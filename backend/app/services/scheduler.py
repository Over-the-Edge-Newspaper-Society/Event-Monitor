from __future__ import annotations

import asyncio
import io
import json
import logging
import os
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from apscheduler.job import Job as APSJob
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.base import BaseTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.base import JobLookupError

from ..database import SessionLocal, session_scope
from ..models import ScheduledJob, ScheduledJobRun
from .monitor import monitor_service, RateLimitError, ApifyIntegrationError
from ..utils.apify_client import ApifyRunTimeoutError

logger = logging.getLogger(__name__)

SUPPORTED_JOB_TYPES = {"apify_pull"}
LOG_DIR = Path(os.getenv("SCHEDULER_LOG_DIR", "/data/scheduler_logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)


class SchedulerService:
    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()
        self._job_handles: Dict[int, str] = {}
        self.enabled: bool = False
        self._reload_lock = asyncio.Lock()

    async def startup(self, enabled: bool) -> None:
        """Initialize scheduler and load jobs from database."""
        self.enabled = enabled
        if not self.scheduler.running:
            self.scheduler.start()
        await self.reload_jobs()

    async def shutdown(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
        self._job_handles.clear()

    async def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled
        if enabled:
            await self.reload_jobs()
        else:
            await self._unschedule_all()

    async def reload_jobs(self) -> None:
        async with self._reload_lock:
            await self._unschedule_all()
            if not self.enabled:
                return
            session = SessionLocal()
            try:
                jobs = session.query(ScheduledJob).filter(ScheduledJob.enabled.is_(True)).all()
                for job in jobs:
                    self._schedule_job(job)
            finally:
                session.close()

    def validate_schedule(self, schedule_type: str, cron_expression: Optional[str], interval_minutes: Optional[int], timezone: Optional[str]) -> None:
        tz = self._resolve_timezone(timezone)
        if schedule_type == "cron":
            if not cron_expression:
                raise ValueError("cron_expression is required for cron schedules")
            CronTrigger.from_crontab(cron_expression, timezone=tz)
            return
        minutes = interval_minutes or 0
        if minutes <= 0:
            raise ValueError("interval_minutes must be greater than zero for interval schedules")
        IntervalTrigger(minutes=minutes, timezone=tz)

    async def refresh_job(self, job_id: int) -> None:
        async with self._reload_lock:
            await self._unschedule_job(job_id)
            if not self.enabled:
                return
            session = SessionLocal()
            try:
                job = session.get(ScheduledJob, job_id)
                if job and job.enabled:
                    self._schedule_job(job)
            finally:
                session.close()

    async def remove_job(self, job_id: int) -> None:
        await self._unschedule_job(job_id)

    async def run_job_now(self, job_id: int) -> Optional[int]:
        session = SessionLocal()
        try:
            job = session.get(ScheduledJob, job_id)
            if not job:
                return None
            # Execute outside current session to avoid cross-thread state
            return await self._run_job(job_id, force=True)
        finally:
            session.close()

    async def _unschedule_all(self) -> None:
        for job_id, handle in list(self._job_handles.items()):
            try:
                self.scheduler.remove_job(handle)
            except JobLookupError:
                pass
            self._job_handles.pop(job_id, None)

    async def _unschedule_job(self, job_id: int) -> None:
        handle = self._job_handles.pop(job_id, None)
        if handle:
            try:
                self.scheduler.remove_job(handle)
            except JobLookupError:
                pass

    def _schedule_job(self, job: ScheduledJob) -> None:
        if job.job_type not in SUPPORTED_JOB_TYPES:
            logger.warning("Skipping unsupported job type '%s' (id=%s)", job.job_type, job.id)
            return
        trigger = self._build_trigger(job)
        if not trigger:
            logger.warning("Skipping job id=%s due to invalid trigger configuration", job.id)
            return
        aps_job: APSJob = self.scheduler.add_job(
            self._run_job,
            trigger=trigger,
            id=f"scheduler-job-{job.id}",
            args=[job.id],
            replace_existing=True,
            max_instances=1 if job.skip_if_running else 3,
            coalesce=True,
        )
        self._job_handles[job.id] = aps_job.id
        logger.debug("Scheduled job id=%s with trigger %s", job.id, trigger)

    def _build_trigger(self, job: ScheduledJob) -> Optional[BaseTrigger]:
        tz = self._resolve_timezone(job.timezone)
        if job.schedule_type == "cron":
            if not job.cron_expression:
                return None
            try:
                return CronTrigger.from_crontab(job.cron_expression, timezone=tz)
            except ValueError as exc:
                logger.error("Invalid cron expression for job %s: %s", job.id, exc)
                return None
        interval = job.interval_minutes or 0
        if interval <= 0:
            return None
        return IntervalTrigger(minutes=interval, timezone=tz)

    def _resolve_timezone(self, tz_name: Optional[str]):
        if not tz_name:
            return None
        try:
            return ZoneInfo(tz_name)
        except Exception:
            logger.warning("Unknown timezone '%s', falling back to default", tz_name)
            return None

    async def _run_job(self, job_id: int, force: bool = False) -> Optional[int]:
        session = SessionLocal()
        job = session.get(ScheduledJob, job_id)
        if not job:
            session.close()
            logger.warning("Job id=%s no longer exists", job_id)
            return None
        if not self.enabled and not force:
            session.close()
            logger.info("Scheduler disabled; skipping job id=%s", job_id)
            return None
        if not job.enabled and not force:
            session.close()
            logger.info("Job id=%s disabled; skipping execution", job_id)
            return None

        run_record = ScheduledJobRun(
            job_id=job.id,
            status="running",
            payload_snapshot=job.payload or {},
        )
        session.add(run_record)
        session.commit()
        session.refresh(run_record)
        run_id = run_record.id
        session.expunge(job)
        session.close()

        job_payload = {
            "id": job.id,
            "job_type": job.job_type,
            "skip_if_running": job.skip_if_running,
            "skip_if_manual_running": job.skip_if_manual_running,
            "payload": job.payload or {},
        }

        status = "success"
        detail_message = ""
        exception: Optional[Exception] = None
        log_buffer = io.StringIO()
        start_ts = datetime.utcnow()

        try:
            if (not force) and job_payload["skip_if_manual_running"] and await monitor_service.has_active_runs(exclude={"scheduler"}):
                status = "skipped"
                detail_message = "Skipped because a manual run is in progress."
            else:
                async with monitor_service.run_guard("scheduler", exclusive=job_payload["skip_if_running"]):
                    if (not force) and job_payload["skip_if_manual_running"] and await monitor_service.has_active_runs(exclude={"scheduler"}):
                        status = "skipped"
                        detail_message = "Skipped because a manual run is in progress."
                    else:
                        result = await asyncio.to_thread(self._execute_job, job_payload, log_buffer)
                        detail_message = json.dumps(result)
        except Exception as exc:
            exception = exc
            status = "failed"
            detail_message = f"{type(exc).__name__}: {exc}"
            logger.exception("Scheduled job id=%s failed", job_id)
        finally:
            finished_ts = datetime.utcnow()
            log_text = log_buffer.getvalue()
            log_path: Optional[Path] = None
            if log_text:
                log_path = LOG_DIR / f"job_{job_id}" / f"run_{run_id}.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    log_path.write_text(log_text)
                except OSError as write_exc:
                    logger.error("Failed to write scheduler log %s: %s", log_path, write_exc)
                    log_path = None

            update_session = SessionLocal()
            try:
                run = update_session.get(ScheduledJobRun, run_id)
                if run:
                    run.status = status
                    run.finished_at = finished_ts
                    run.detail = detail_message
                    run.log_excerpt = (log_text[:2000]) if log_text else None
                    run.log_path = str(log_path) if log_path else None
                    update_session.add(run)
                job_row = update_session.get(ScheduledJob, job_id)
                if job_row:
                    job_row.last_run_at = finished_ts
                    update_session.add(job_row)
                update_session.commit()
            finally:
                update_session.close()

        if exception and not force:
            # Propagate failure so APScheduler can record it, but we've already logged details
            raise exception
        return run_id

    def _execute_job(self, job_payload: Dict[str, Any], log_buffer: io.StringIO) -> Dict[str, Any]:
        with redirect_stdout(log_buffer), redirect_stderr(log_buffer):
            payload = job_payload.get("payload") or {}
            job_type = job_payload.get("job_type")
            if job_type == "apify_pull":
                return self._run_apify_pull(payload)
            raise ValueError(f"Unsupported job type: {job_type}")

    def _run_apify_pull(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        post_count = int(payload.get("post_count", 3) or 3)
        result: Dict[str, Any] = {"job": "apify_pull", "post_count": post_count}
        stats: Dict[str, Any]
        with session_scope() as session:
            try:
                stats = monitor_service.fetch_latest_posts_for_clubs(session, post_count)
                result.update({"status": "completed", "stats": stats})
            except (RateLimitError, ApifyIntegrationError, ApifyRunTimeoutError) as known_exc:
                session.rollback()
                result.update({
                    "status": "error",
                    "error": type(known_exc).__name__,
                    "message": str(known_exc) or "Apify run did not complete successfully.",
                })
                raise
            except Exception:
                session.rollback()
                raise
        return result


scheduler_service = SchedulerService()
