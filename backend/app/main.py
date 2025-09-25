from __future__ import annotations

import asyncio
import contextlib
import os
import json
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from .database import DB_PATH, SessionLocal, engine
from .models import (
    Base,
    Club,
    ExtractedEvent,
    Post,
    ClassificationModeEnum,
    ScheduledJob,
    ScheduledJobRun,
    ensure_default_settings,
    DEFAULT_APIFY_ACTOR_ID,
)
from pydantic import ValidationError

from .schemas import (
    CSVImportResponse,
    ClubOut,
    ClubUpdate,
    EventExtractionRequest,
    MonitorStatus,
    PostClassificationRequest,
    PostOut,
    StatsOut,
    SystemSettingsOut,
    SystemSettingsUpdate,
    ApifyTokenUpdate,
    ApifyTestRequest,
    ApifyTestResponse,
    ClubFetchLatestResponse,
    DeletePostResponse,
    ApifyImportStats,
    GeminiApiKeyUpdate,
    ClubEventsExport,
    EventExportItem,
    ScheduledJobCreate,
    ScheduledJobUpdate,
    ScheduledJobOut,
    ScheduledJobRunOut,
    ScheduledJobRunDetail,
)
from .services.gemini_extractor import (
    GeminiApiKeyMissing,
    GeminiClientUnavailable,
    GeminiExtractionError,
    auto_extract_for_post,
    extract_event_data_for_post,
)
from .services.monitor import monitor_service, RateLimitError, ApifyIntegrationError
from .services.scheduler import scheduler_service
from .utils.apify_client import ApifyRunTimeoutError
from .utils.csv_loader import import_clubs_from_csv
from .utils.image_downloader import get_image_url

app = FastAPI(title="Instagram Event Monitor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving images
app.mount("/static", StaticFiles(directory="app/static"), name="static")

INSTALOADER_SESSION_DIR = Path("app/instaloader_session")
INSTALOADER_SESSION_DIR.mkdir(parents=True, exist_ok=True)
INSTALOADER_SESSION_PATH = INSTALOADER_SESSION_DIR / "instaloader.session"
IMAGES_DIR = Path("app/static/images")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
async def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        settings = ensure_default_settings(session)
        monitor_service.session_file_path = INSTALOADER_SESSION_PATH
        if INSTALOADER_SESSION_PATH.exists():
            try:
                monitor_service.configure_from_settings(settings)
            except Exception:
                pass
        await scheduler_service.startup(bool(getattr(settings, "scheduler_enabled", False)))
    finally:
        session.close()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    task: Optional[asyncio.Task] = getattr(app.state, "monitor_task", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await scheduler_service.shutdown()


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


def _cleanup_file(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _clear_directory(path: Path) -> None:
    if not path.exists():
        return
    for child in path.iterdir():
        try:
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        except OSError:
            pass


def _normalize_local_image_path(image_path: Optional[str]) -> Optional[str]:
    if not image_path:
        return None
    normalized = image_path.replace("\\", "/")
    if normalized.startswith("/static/images/"):
        normalized = normalized[len("/static/images/") :]
    return normalized.strip("/") or None


def _import_event_export(data: Any) -> None:
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="Event export JSON must be a list of clubs")

    try:
        clubs_export: List[ClubEventsExport] = [ClubEventsExport(**item) for item in data]
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid event export format: {exc}") from exc

    session = SessionLocal()
    try:
        session.execute(text("DELETE FROM extracted_events"))
        session.execute(text("DELETE FROM posts"))
        session.execute(text("DELETE FROM clubs"))
        session.commit()

        now = datetime.utcnow()
        for club_export in clubs_export:
            club = Club(
                name=club_export.club_name,
                username=club_export.club_username,
                active=True,
            )
            session.add(club)
            session.flush()

            for event_export in club_export.events:
                try:
                    raw_ts = event_export.post_timestamp.replace("Z", "+00:00")
                    post_timestamp = datetime.fromisoformat(raw_ts)
                except Exception:
                    post_timestamp = now

                post = Post(
                    club_id=club.id,
                    instagram_id=event_export.post_instagram_id,
                    image_url=event_export.post_image_url,
                    local_image_path=_normalize_local_image_path(event_export.post_image_url),
                    caption=event_export.post_caption,
                    post_timestamp=post_timestamp,
                    collected_at=now,
                    is_event_poster=True,
                    processed=True,
                    classification_confidence=event_export.extraction_confidence,
                )
                session.add(post)
                session.flush()

                if event_export.payload is not None:
                    extracted = ExtractedEvent(
                        post_id=post.id,
                        event_data_json=event_export.payload,
                        extraction_confidence=event_export.extraction_confidence,
                    )
                    session.add(extracted)

        session.commit()
    finally:
        session.close()


@app.get("/export/full", response_class=FileResponse)
async def export_full_backup(background_tasks: BackgroundTasks) -> FileResponse:
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    backup_path = Path(tmp.name)
    tmp.close()

    try:
        with zipfile.ZipFile(backup_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            if DB_PATH.exists():
                archive.write(DB_PATH, arcname="instagram_monitor.db")
            if IMAGES_DIR.exists():
                for file_path in IMAGES_DIR.rglob("*"):
                    if file_path.is_file():
                        archive.write(
                            file_path,
                            arcname=f"static/images/{file_path.relative_to(IMAGES_DIR)}",
                        )
    except Exception:
        backup_path.unlink(missing_ok=True)
        raise

    background_tasks.add_task(_cleanup_file, backup_path)
    return FileResponse(
        backup_path,
        media_type="application/zip",
        filename=f"event-monitor-backup-{timestamp}.zip",
        background=background_tasks,
    )


def _validate_zip_entry(name: str) -> None:
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=400, detail="Archive contains unsafe paths")


@app.post("/import/full")
async def import_full_backup(file: UploadFile = File(...)) -> Dict[str, str]:
    filename = (file.filename or "").lower()

    if filename.endswith(".json"):
        content = await file.read()
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Uploaded file is not valid JSON") from exc
        finally:
            file.file.close()

        _import_event_export(data)
        message = "Event export imported successfully."

    elif filename.endswith(".zip"):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            try:
                shutil.copyfileobj(file.file, tmp)
            finally:
                file.file.close()
            temp_zip_path = Path(tmp.name)

        try:
            with zipfile.ZipFile(temp_zip_path, "r") as archive:
                if "instagram_monitor.db" not in archive.namelist():
                    raise HTTPException(status_code=400, detail="Archive missing instagram_monitor.db")
                for info in archive.infolist():
                    _validate_zip_entry(info.filename)

                with tempfile.TemporaryDirectory() as extract_dir:
                    archive.extractall(path=extract_dir)
                    extract_path = Path(extract_dir)
                    new_db_path = extract_path / "instagram_monitor.db"
                    if not new_db_path.exists():
                        raise HTTPException(status_code=400, detail="Archive missing instagram_monitor.db")
                    new_images_dir = extract_path / "static" / "images"

                    engine.dispose()

                    try:
                        # Copy database
                        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(new_db_path, DB_PATH)

                        # Copy images with better error handling
                        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
                        _clear_directory(IMAGES_DIR)
                        if new_images_dir.exists():
                            # Copy files one by one to handle permission issues
                            for src_file in new_images_dir.rglob("*"):
                                if src_file.is_file():
                                    rel_path = src_file.relative_to(new_images_dir)
                                    dst_file = IMAGES_DIR / rel_path
                                    dst_file.parent.mkdir(parents=True, exist_ok=True)
                                    try:
                                        shutil.copy2(src_file, dst_file)
                                    except OSError as e:
                                        print(f"Warning: Could not copy {src_file}: {e}")
                                        # Continue with other files
                    except Exception as e:
                        print(f"Error during import: {e}")
                        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive") from exc
        finally:
            temp_zip_path.unlink(missing_ok=True)

        message = "Backup imported successfully."

    else:
        raise HTTPException(status_code=400, detail="Upload a .zip backup or event export .json file")

    session = SessionLocal()
    try:
        settings = ensure_default_settings(session)
        monitor_service.configure_from_settings(settings)
        monitor_service.clear_last_error()
    finally:
        session.close()

    return {"message": message}


@app.get("/monitor/status", response_model=MonitorStatus)
async def monitor_status(db: Session = Depends(get_db)) -> MonitorStatus:
    settings = ensure_default_settings(db)
    return _render_status(settings)


@app.post("/monitor/start", response_model=MonitorStatus)
async def monitor_start(db: Session = Depends(get_db)) -> MonitorStatus:
    settings = ensure_default_settings(db)
    settings.monitoring_enabled = True
    db.commit()
    db.refresh(settings)
    return _render_status(settings)


@app.post("/monitor/stop", response_model=MonitorStatus)
async def monitor_stop(db: Session = Depends(get_db)) -> MonitorStatus:
    settings = ensure_default_settings(db)
    settings.monitoring_enabled = False
    db.commit()
    db.refresh(settings)
    return _render_status(settings)


@app.get("/settings", response_model=SystemSettingsOut)
async def get_system_settings(db: Session = Depends(get_db)) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    return _system_settings_out(settings)


@app.patch("/settings", response_model=SystemSettingsOut)
async def update_system_settings(
    payload: SystemSettingsUpdate,
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    updated = False
    scheduler_toggled = False
    if payload.classification_mode is not None:
        settings.classification_mode = payload.classification_mode
        updated = True
    if payload.monitor_interval_minutes is not None:
        if payload.monitor_interval_minutes < 1:
            raise HTTPException(status_code=400, detail="Monitor interval must be at least 1 minute")
        settings.monitor_interval_minutes = payload.monitor_interval_minutes
        updated = True
    if payload.club_fetch_delay_seconds is not None:
        if payload.club_fetch_delay_seconds < 0:
            raise HTTPException(status_code=400, detail="Club fetch delay cannot be negative")
        settings.club_fetch_delay_seconds = payload.club_fetch_delay_seconds
        updated = True
    if payload.apify_enabled is not None:
        settings.apify_enabled = payload.apify_enabled
        updated = True
    if payload.apify_actor_id is not None:
        settings.apify_actor_id = DEFAULT_APIFY_ACTOR_ID
        updated = True
    if payload.apify_results_limit is not None:
        settings.apify_results_limit = payload.apify_results_limit
        updated = True
    if payload.instagram_fetcher is not None:
        fetcher = payload.instagram_fetcher.lower()
        if fetcher not in {"instaloader", "apify"}:
            raise HTTPException(status_code=400, detail="Invalid Instagram fetcher selection")
        settings.instagram_fetcher = fetcher
        if payload.apify_enabled is None:
            settings.apify_enabled = fetcher == "apify"
        updated = True
    if payload.gemini_auto_extract is not None:
        settings.gemini_auto_extract = bool(payload.gemini_auto_extract)
        updated = True
    if payload.scheduler_enabled is not None:
        desired = bool(payload.scheduler_enabled)
        if bool(getattr(settings, "scheduler_enabled", False)) != desired:
            settings.scheduler_enabled = desired
            scheduler_toggled = True
            updated = True
    if updated:
        db.commit()
        db.refresh(settings)
        monitor_service.clear_last_error()
        if scheduler_toggled:
            await scheduler_service.set_enabled(bool(settings.scheduler_enabled))
    return _system_settings_out(settings)


@app.post("/settings/apify/token", response_model=SystemSettingsOut)
async def update_apify_token(
    payload: ApifyTokenUpdate,
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    token = (payload.token or "").strip()
    settings.apify_api_token = token or None
    db.commit()
    db.refresh(settings)
    monitor_service.clear_last_error()
    return _system_settings_out(settings)


@app.delete("/settings/apify/token", response_model=SystemSettingsOut)
async def clear_apify_token(db: Session = Depends(get_db)) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    settings.apify_api_token = None
    db.commit()
    db.refresh(settings)
    monitor_service.clear_last_error()
    return _system_settings_out(settings)


@app.post("/settings/gemini/api-key", response_model=SystemSettingsOut)
async def update_gemini_api_key(
    payload: GeminiApiKeyUpdate,
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    settings.gemini_api_key = payload.api_key.strip()
    db.commit()
    db.refresh(settings)
    return _system_settings_out(settings)


@app.delete("/settings/gemini/api-key", response_model=SystemSettingsOut)
async def clear_gemini_api_key(db: Session = Depends(get_db)) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    settings.gemini_api_key = None
    db.commit()
    db.refresh(settings)
    return _system_settings_out(settings)


@app.post("/apify/test", response_model=ApifyTestResponse)
async def run_apify_test(
    payload: ApifyTestRequest,
    db: Session = Depends(get_db),
) -> ApifyTestResponse:
    settings = ensure_default_settings(db)
    target_url = (payload.url or "").strip()
    if not target_url:
        raise HTTPException(status_code=400, detail="Instagram URL or username is required")

    configured_limit = settings.apify_results_limit or 10
    requested_limit = payload.limit or configured_limit
    limit = max(1, min(requested_limit, configured_limit))

    try:
        return ApifyTestResponse(**monitor_service.test_apify_fetch(settings, target_url, limit=limit))
    except ApifyIntegrationError as exc:
        detail = str(exc) or "Apify integration failed to return results."
        raise HTTPException(status_code=502, detail=detail)
    except ApifyRunTimeoutError as exc:
        detail = str(exc) or "Apify run timed out before completion."
        raise HTTPException(status_code=504, detail=detail)


@app.get("/apify/run/{run_id}", response_model=ApifyTestResponse)
async def fetch_apify_run(
    run_id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
) -> ApifyTestResponse:
    settings = ensure_default_settings(db)
    try:
        return ApifyTestResponse(
            **monitor_service.fetch_apify_run_snapshot(settings, run_id, limit=limit)
        )
    except ApifyIntegrationError as exc:
        detail = str(exc) or "Apify integration failed to return results."
        raise HTTPException(status_code=502, detail=detail)


@app.post("/apify/run/{run_id}/import", response_model=ApifyImportStats)
async def import_apify_run(
    run_id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
) -> ApifyImportStats:
    settings = ensure_default_settings(db)
    try:
        snapshot = monitor_service.fetch_apify_run_snapshot(settings, run_id, limit=limit)
        stats = monitor_service.import_apify_posts(db, settings, snapshot["posts"])
        return ApifyImportStats(**stats)
    except ApifyIntegrationError as exc:
        detail = str(exc) or "Apify integration failed to return results."
        raise HTTPException(status_code=502, detail=detail)
    except ApifyRunTimeoutError as exc:
        detail = str(exc) or "Apify run timed out before completion."
        raise HTTPException(status_code=504, detail=detail)


@app.post("/clubs/{club_id}/fetch-latest", response_model=ClubFetchLatestResponse)
async def fetch_latest_for_club(
    club_id: int,
    post_count: int = 1,
    db: Session = Depends(get_db),
) -> ClubFetchLatestResponse:
    if post_count < 1:
        raise HTTPException(status_code=400, detail="post_count must be at least 1")

    club = db.query(Club).filter(Club.id == club_id).one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    settings = ensure_default_settings(db)
    fetch_mode = monitor_service._get_fetch_mode(settings)
    apify_ready = bool(settings.apify_api_token and settings.apify_actor_id)
    has_loader = bool(monitor_service.loader)

    if fetch_mode == "instaloader" and not has_loader:
        raise HTTPException(
            status_code=503,
            detail="Instaloader session is not available. Upload a session file or switch fetcher.",
        )
    if fetch_mode == "apify" and not apify_ready:
        raise HTTPException(
            status_code=503,
            detail="Apify integration is not configured. Add a personal API token and actor ID before using Apify mode.",
        )
    if fetch_mode == "auto" and not has_loader and not apify_ready:
        raise HTTPException(
            status_code=503,
            detail="No Instagram fetcher is ready. Provide an Instaloader session or Apify credentials.",
        )

    try:
        async with monitor_service.run_guard("manual"):
            stats = monitor_service.fetch_latest_posts_for_club(db, club, post_count, settings)
    except RateLimitError as exc:
        db.rollback()
        detail = str(exc) or "Instagram temporarily blocked our requests. Please try again later."
        raise HTTPException(status_code=429, detail=detail)
    except ApifyIntegrationError as exc:
        db.rollback()
        detail = str(exc) or "Apify integration failed to return results."
        raise HTTPException(status_code=502, detail=detail)
    except ApifyRunTimeoutError as exc:
        db.rollback()
        detail = str(exc) or "Apify run timed out before completion."
        raise HTTPException(status_code=504, detail=detail)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        import traceback

        print(f"Error in fetch_latest_for_club: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error fetching posts: {exc}")

    return ClubFetchLatestResponse(
        club_id=club.id,
        club_username=club.username,
        requested=stats["requested"],
        fetched=stats["fetched"],
        created=stats["created"],
        message=stats["message"],
    )


@app.post("/settings/session", response_model=SystemSettingsOut)
async def upload_instagram_session(
    username: str = Form(...),
    file: Optional[UploadFile] = File(None),
    session_cookie: Optional[str] = Form(None),
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    if not monitor_service.loader:
        raise HTTPException(status_code=503, detail="Instaloader is not available on this server")

    settings = ensure_default_settings(db)
    settings.instaloader_username = username
    settings.instaloader_session_uploaded_at = datetime.utcnow()

    monitor_service.session_file_path = INSTALOADER_SESSION_PATH

    try:
        if session_cookie and session_cookie.strip():
            cookies = monitor_service.parse_cookie_input(session_cookie)
            if not cookies.get("sessionid"):
                raise HTTPException(status_code=400, detail="Session cookie must include a 'sessionid' value")
            monitor_service.save_session_from_cookies(username, cookies)
        elif file is not None:
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Session file was empty")

            INSTALOADER_SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
            INSTALOADER_SESSION_PATH.write_bytes(content)
        else:
            raise HTTPException(status_code=400, detail="Provide a session file or paste a session cookie string")
    except HTTPException:
        db.rollback()
        raise
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        monitor_service.clear_backoff()
        monitor_service.clear_last_error()
    except Exception:
        pass

    try:
        monitor_service.session_file_path = INSTALOADER_SESSION_PATH
        if not (session_cookie and session_cookie.strip()):
            monitor_service.configure_from_settings(settings)
    except Exception as exc:
        INSTALOADER_SESSION_PATH.unlink(missing_ok=True)
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to load session: {exc}")

    db.commit()
    db.refresh(settings)
    monitor_service.clear_last_error()
    return _system_settings_out(settings)


@app.delete("/settings/session", response_model=SystemSettingsOut)
async def remove_instagram_session(db: Session = Depends(get_db)) -> SystemSettingsOut:
    settings = ensure_default_settings(db)
    monitor_service.remove_session()
    monitor_service.clear_backoff()
    settings.instaloader_username = None
    settings.instaloader_session_uploaded_at = None
    db.commit()
    db.refresh(settings)
    monitor_service.clear_last_error()
    return _system_settings_out(settings)


@app.post("/monitor/fetch-latest")
async def fetch_latest_posts(post_count: int = 3, db: Session = Depends(get_db)) -> dict:
    """Manually fetch the latest N posts from all active clubs"""
    try:
        # Check if there are any active clubs first
        active_clubs_count = db.query(Club).filter(Club.active.is_(True)).count()
        if active_clubs_count == 0:
            return {
                "success": False,
                "message": "No active clubs found",
                "stats": {"clubs": 0, "posts": 0, "classified": 0},
                "error": "Please activate some clubs in the Setup tab before fetching posts."
            }

        settings = ensure_default_settings(db)
        fetch_mode = monitor_service._get_fetch_mode(settings)
        apify_ready = bool(settings.apify_api_token and settings.apify_actor_id)
        has_loader = bool(monitor_service.loader)

        if fetch_mode == "instaloader" and not has_loader:
            raise HTTPException(
                status_code=503,
                detail="Instaloader session is not available. Upload a session file or switch to Apify mode."
            )
        if fetch_mode == "apify" and not apify_ready:
            raise HTTPException(
                status_code=503,
                detail="Apify integration is not configured. Add a personal API token before using Apify mode."
            )

        async with monitor_service.run_guard("manual"):
            stats = monitor_service.fetch_latest_posts_for_clubs(db, post_count)
        return {
            "success": True,
            "message": f"Successfully fetched posts from {stats['clubs']} clubs",
            "stats": stats
        }
    except RateLimitError as exc:
        detail = str(exc) or "Instagram temporarily blocked our requests. Please try again later."
        raise HTTPException(status_code=429, detail=detail)
    except ApifyIntegrationError as exc:
        detail = str(exc) or "Apify integration failed to return results."
        raise HTTPException(status_code=502, detail=detail)
    except ApifyRunTimeoutError as exc:
        detail = str(exc) or "Apify run timed out before completion."
        raise HTTPException(status_code=504, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error fetching posts: {str(e)}"
        print(f"Error in fetch_latest_posts: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/monitor/fetch-latest-stream")
async def fetch_latest_posts_stream(post_count: int = 3, db: Session = Depends(get_db)):
    """Stream real-time progress while fetching latest posts"""
    import json

    async def generate_progress():
        try:
            # Check if there are any active clubs first
            active_clubs_count = db.query(Club).filter(Club.active.is_(True)).count()
            if active_clubs_count == 0:
                yield f"data: {json.dumps({'error': 'No active clubs found'})}\n\n"
                return

            settings = ensure_default_settings(db)
            fetch_mode = monitor_service._get_fetch_mode(settings)
            apify_ready = bool(settings.apify_api_token and settings.apify_actor_id)
            has_loader = bool(monitor_service.loader)

            if fetch_mode == "instaloader" and not has_loader:
                yield f"data: {json.dumps({'error': 'Instaloader session is not available'})}\n\n"
                return
            if fetch_mode == "apify" and not apify_ready:
                yield f"data: {json.dumps({'error': 'Apify integration is not configured'})}\n\n"
                return

            async with monitor_service.run_guard("manual"):
                if monitor_service._in_backoff():
                    if fetch_mode == "apify" and apify_ready:
                        monitor_service.clear_backoff()
                    else:
                        wait_seconds = (
                            monitor_service.next_run_eta_seconds
                            or monitor_service.rate_limit_backoff_minutes * 60
                        )
                        yield f"data: {json.dumps({'status': 'error', 'error': f'Instagram is throttling requests. Please retry in {max(wait_seconds // 60, 1)} minutes.'})}\n\n"
                        return

                yield f"data: {json.dumps({'status': 'starting', 'message': f'Starting to fetch {post_count} posts from {active_clubs_count} clubs'})}\n\n"

                stats = {"clubs": 0, "posts": 0, "classified": 0}
                monitor_service._last_run = datetime.utcnow()

                global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

                clubs = db.query(Club).filter(Club.active.is_(True)).all()
                total_clubs = len(clubs)

                apify_bulk_cache: Dict[str, List[Dict]] = {}
                apify_known_map: Dict[str, Set[str]] = {}
                if fetch_mode == "apify":
                    apify_client = monitor_service._get_apify_client(settings)
                    if not apify_client:
                        yield f"data: {json.dumps({'status': 'error', 'error': 'Apify integration is not configured.'})}\n\n"
                        return
                    apify_known_map = {
                        club.username: monitor_service._get_recent_post_ids(db, club.id)
                        for club in clubs
                    }
                    configured_limit = settings.apify_results_limit or post_count
                    limit = max(1, min(configured_limit, post_count))
                    try:
                        apify_bulk_cache = monitor_service._collect_posts_via_apify_bulk(
                            apify_client,
                            [club.username for club in clubs],
                            limit,
                            apify_known_map,
                        )
                    except ApifyIntegrationError as exc:
                        yield f"data: {json.dumps({'status': 'error', 'error': str(exc) or 'Apify integration failed to return results.'})}\n\n"
                        return

                for i, club in enumerate(clubs, 1):
                    yield f"data: {json.dumps({'status': 'processing', 'current_club': club.username, 'progress': i, 'total': total_clubs, 'message': f'Processing {club.name} ({i}/{total_clubs})'})}\n\n"

                    stats["clubs"] += 1
                    try:
                        if fetch_mode == "apify":
                            known_ids = apify_known_map.get(club.username, set())
                            posts = apify_bulk_cache.get(club.username, [])
                        else:
                            known_ids = monitor_service._get_recent_post_ids(db, club.id)
                            posts = monitor_service._fetch_latest_posts_for_club(
                                settings,
                                club.username,
                                post_count,
                                known_ids,
                            )
                    except RateLimitError as exc:
                        db.rollback()
                        monitor_service.set_last_error(str(exc))
                        monitor_service._schedule_backoff()
                        yield f"data: {json.dumps({'status': 'error', 'error': str(exc) or 'Instagram temporarily blocked our requests. Please try again later.'})}\n\n"
                        return
                    except ApifyIntegrationError as exc:
                        db.rollback()
                        monitor_service.set_last_error(str(exc))
                        yield f"data: {json.dumps({'status': 'error', 'error': str(exc) or 'Apify integration failed to return results.'})}\n\n"
                        return
                    except ApifyRunTimeoutError as exc:
                        db.rollback()
                        monitor_service.set_last_error(str(exc))
                        yield f"data: {json.dumps({'status': 'error', 'error': str(exc) or 'Apify run timed out before completion.'})}\n\n"
                        return
                    except ApifyIntegrationError as exc:
                        db.rollback()
                        monitor_service.set_last_error(str(exc))
                        yield f"data: {json.dumps({'status': 'error', 'error': str(exc) or 'Apify integration failed to return results.'})}\n\n"
                        return

                    for post in posts:
                        auto_classify = global_auto and (club.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO
                        if monitor_service._create_post_if_new(db, club, post, auto_classify, settings):
                            stats["posts"] += 1
                            if auto_classify:
                                stats["classified"] += 1

                    club.last_checked = datetime.utcnow()
                    yield f"data: {json.dumps({'status': 'completed_club', 'club': club.username, 'posts_found': len(posts), 'progress': i, 'total': total_clubs})}\n\n"
                    monitor_service._apply_delay(settings.club_fetch_delay_seconds)

                db.commit()
                clubs_count = stats["clubs"]
                completion_message = f'Successfully fetched posts from {clubs_count} clubs'
                monitor_service.clear_last_error()
                yield f"data: {json.dumps({'status': 'completed', 'message': completion_message, 'stats': stats})}\n\n"

        except Exception as e:
            import traceback
            error_detail = f"Error fetching posts: {str(e)}"
            print(f"Error in fetch_latest_posts_stream: {traceback.format_exc()}")
            yield f"data: {json.dumps({'status': 'error', 'error': error_detail})}\n\n"

    return StreamingResponse(generate_progress(), media_type="text/plain")





@app.get("/clubs", response_model=List[ClubOut])
async def list_clubs(db: Session = Depends(get_db)) -> List[ClubOut]:
    clubs = db.query(Club).order_by(Club.name.asc()).all()
    return clubs


@app.patch("/clubs/{club_id}", response_model=ClubOut)
async def update_club(club_id: int, payload: ClubUpdate, db: Session = Depends(get_db)) -> ClubOut:
    club = db.query(Club).filter(Club.id == club_id).one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    if payload.name is not None:
        club.name = payload.name
    if payload.active is not None:
        club.active = payload.active
    if payload.classification_mode is not None:
        club.classification_mode = payload.classification_mode
    db.commit()
    db.refresh(club)
    return club


@app.post("/clubs/import", response_model=CSVImportResponse)
async def import_clubs(file: UploadFile = File(...), db: Session = Depends(get_db)) -> CSVImportResponse:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    content = (await file.read()).decode("utf-8")
    created, updated = import_clubs_from_csv(db, content)
    return CSVImportResponse(clubs_created=created, clubs_updated=updated)


@app.get("/posts", response_model=List[PostOut])
async def list_posts(status: Optional[str] = None, db: Session = Depends(get_db)) -> List[PostOut]:
    query = db.query(Post).options(joinedload(Post.club)).order_by(Post.post_timestamp.desc())
    if status == "pending":
        query = query.filter(Post.is_event_poster.is_(None))
    elif status == "events":
        query = query.filter(Post.is_event_poster.is_(True))
    elif status == "non_events":
        query = query.filter(Post.is_event_poster.is_(False))
    posts = query.limit(200).all()
    return posts


@app.post("/posts/{post_id}/classify", response_model=PostOut)
async def classify_post(
    post_id: int,
    payload: PostClassificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> PostOut:
    post = db.query(Post).options(joinedload(Post.club)).filter(Post.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    settings = ensure_default_settings(db)
    post.is_event_poster = payload.is_event_poster
    post.classification_confidence = payload.confidence
    post.manual_review_notes = payload.notes

    should_schedule_auto_extract = False
    if payload.is_event_poster and settings.gemini_auto_extract:
        gemini_api_key = (settings.gemini_api_key or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
        if gemini_api_key and not post.extracted_event:
            should_schedule_auto_extract = True
    db.commit()
    db.refresh(post)
    if should_schedule_auto_extract:
        background_tasks.add_task(_run_gemini_auto_extract, post.id)
    return post


@app.post("/posts/{post_id}/events", response_model=PostOut)
async def attach_event(
    post_id: int,
    payload: EventExtractionRequest,
    db: Session = Depends(get_db),
) -> PostOut:
    post = db.query(Post).options(joinedload(Post.club)).filter(Post.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not payload.event_data:
        raise HTTPException(status_code=400, detail="event_data payload is required")
    if post.extracted_event:
        post.extracted_event.event_data_json = payload.event_data
        post.extracted_event.extraction_confidence = payload.confidence
    else:
        post.extracted_event = ExtractedEvent(
            post_id=post.id,
            event_data_json=payload.event_data,
            extraction_confidence=payload.confidence,
        )
    post.processed = True
    db.commit()
    db.refresh(post)
    return post


@app.post("/posts/{post_id}/extract", response_model=PostOut)
async def extract_event_with_gemini(
    post_id: int,
    overwrite: bool = True,
    db: Session = Depends(get_db),
) -> PostOut:
    post = (
        db.query(Post)
        .options(joinedload(Post.club), joinedload(Post.extracted_event))
        .filter(Post.id == post_id)
        .one_or_none()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.is_event_poster is False:
        raise HTTPException(status_code=400, detail="Post is not classified as an event poster")

    if post.extracted_event and not overwrite:
        raise HTTPException(status_code=409, detail="Event data already exists for this post")

    settings = ensure_default_settings(db)
    api_key = (settings.gemini_api_key or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is not configured")

    try:
        payload, downloaded_filename = extract_event_data_for_post(post, api_key)
    except GeminiApiKeyMissing as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GeminiClientUnavailable as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except GeminiExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if downloaded_filename and downloaded_filename != post.local_image_path:
        post.local_image_path = downloaded_filename

    extraction_confidence = None
    payload_confidence = None
    if isinstance(payload, dict):
        payload_confidence = payload.get("extractionConfidence")
    if isinstance(payload_confidence, dict):
        overall = payload_confidence.get("overall")
        try:
            extraction_confidence = float(overall) if overall is not None else None
        except (TypeError, ValueError):
            extraction_confidence = None

    if post.extracted_event:
        post.extracted_event.event_data_json = payload
        post.extracted_event.extraction_confidence = extraction_confidence
    else:
        post.extracted_event = ExtractedEvent(
            post_id=post.id,
            event_data_json=payload,
            extraction_confidence=extraction_confidence,
        )

    post.processed = True
    db.commit()
    db.refresh(post)
    return post


@app.delete("/posts/{post_id}", response_model=DeletePostResponse)
async def delete_post(post_id: int, db: Session = Depends(get_db)) -> DeletePostResponse:
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
    return DeletePostResponse(id=post_id, success=True)


@app.get("/stats", response_model=StatsOut)
async def stats(db: Session = Depends(get_db)) -> StatsOut:
    total_clubs = db.query(Club).count()
    active_clubs = db.query(Club).filter(Club.active.is_(True)).count()
    pending_posts = db.query(Post).filter(Post.is_event_poster.is_(None)).count()
    event_posts = db.query(Post).filter(Post.is_event_poster.is_(True)).count()
    processed_events = db.query(ExtractedEvent).count()
    return StatsOut(
        total_clubs=total_clubs,
        active_clubs=active_clubs,
        pending_posts=pending_posts,
        event_posts=event_posts,
        processed_events=processed_events,
    )


@app.get("/events/export", response_model=List[ClubEventsExport])
async def export_events(db: Session = Depends(get_db)) -> List[ClubEventsExport]:
    extracted_events = (
        db.query(ExtractedEvent)
        .join(Post)
        .join(Club)
        .options(joinedload(ExtractedEvent.post).joinedload(Post.club))
        .order_by(Club.name.asc(), ExtractedEvent.created_at.desc())
        .all()
    )

    clubs: Dict[int, ClubEventsExport] = {}
    for extracted in extracted_events:
        post = extracted.post
        club = post.club
        if club.id not in clubs:
            clubs[club.id] = ClubEventsExport(
                club_id=club.id,
                club_name=club.name,
                club_username=club.username,
                club_profile_url=f"https://www.instagram.com/{club.username}/",
                events=[],
            )
        wrapper = clubs[club.id]
        post_url = f"https://www.instagram.com/p/{post.instagram_id}/"
        image_url = None
        if post.local_image_path:
            image_url = get_image_url(post.local_image_path)
        elif post.image_url:
            image_url = post.image_url
        event_item = EventExportItem(
            db_id=f"event:{extracted.id}",
            post_id=post.id,
            post_instagram_id=post.instagram_id,
            post_url=post_url,
            post_timestamp=post.post_timestamp.isoformat() if isinstance(post.post_timestamp, datetime) else str(post.post_timestamp),
            post_caption=post.caption,
            post_image_url=image_url,
            payload=extracted.event_data_json,
            extraction_confidence=extracted.extraction_confidence,
        )
        wrapper.events.append(event_item)

    return list(clubs.values())

def _render_status(settings) -> MonitorStatus:
    last_run = monitor_service.last_run.isoformat() if monitor_service.last_run else None
    rate_limit_until = monitor_service.rate_limit_until
    rate_limit_until_iso = rate_limit_until.isoformat() if rate_limit_until else None
    now = datetime.utcnow()
    uploaded_at = settings.instaloader_session_uploaded_at
    session_uploaded_iso = uploaded_at.isoformat() if uploaded_at else None
    session_age_minutes = None
    if uploaded_at:
        delta = now - uploaded_at
        session_age_minutes = max(int(delta.total_seconds() // 60), 0)
    is_rate_limited = bool(rate_limit_until and rate_limit_until > now)
    apify_runner = monitor_service.get_apify_runner_status(settings)
    fetch_mode = monitor_service._get_fetch_mode(settings)
    return MonitorStatus(
        monitoring_enabled=settings.monitoring_enabled,
        monitor_interval_minutes=settings.monitor_interval_minutes,
        last_run=last_run,
        next_run_eta_seconds=monitor_service.next_run_eta_seconds,
        classification_mode=settings.classification_mode,
        apify_enabled=settings.apify_enabled,
        instagram_fetcher=fetch_mode,
        apify_runner=apify_runner,
        last_error=monitor_service.last_error,
        session_username=settings.instaloader_username,
        session_uploaded_at=session_uploaded_iso,
        session_age_minutes=session_age_minutes,
        is_rate_limited=is_rate_limited,
        rate_limit_until=rate_limit_until_iso,
    )


def _system_settings_out(settings) -> SystemSettingsOut:
    def _iso(dt):
        return dt.isoformat() if isinstance(dt, datetime) else None

    return SystemSettingsOut(
        id=settings.id,
        monitoring_enabled=bool(settings.monitoring_enabled),
        monitor_interval_minutes=settings.monitor_interval_minutes,
        classification_mode=settings.classification_mode,
        instaloader_username=settings.instaloader_username,
        instaloader_session_uploaded_at=_iso(settings.instaloader_session_uploaded_at),
        club_fetch_delay_seconds=settings.club_fetch_delay_seconds,
        apify_enabled=bool(settings.apify_enabled),
        apify_actor_id=settings.apify_actor_id,
        apify_results_limit=settings.apify_results_limit,
        has_apify_token=bool(getattr(settings, "apify_api_token", None)),
        has_gemini_api_key=bool((settings.gemini_api_key or "").strip() or os.getenv("GEMINI_API_KEY")),
        gemini_auto_extract=bool(getattr(settings, "gemini_auto_extract", False)),
        instagram_fetcher=monitor_service._get_fetch_mode(settings),
        scheduler_enabled=bool(getattr(settings, "scheduler_enabled", False)),
        created_at=_iso(settings.created_at),
        updated_at=_iso(settings.updated_at),
    )


def _scheduled_job_to_out(job: ScheduledJob) -> ScheduledJobOut:
    aps_job = scheduler_service.scheduler.get_job(f"scheduler-job-{job.id}") if scheduler_service.scheduler else None
    next_run = getattr(aps_job, "next_run_time", None)

    return ScheduledJobOut(
        id=job.id,
        name=job.name,
        job_type=job.job_type,
        enabled=bool(job.enabled),
        schedule_type=job.schedule_type,
        cron_expression=job.cron_expression,
        interval_minutes=job.interval_minutes,
        timezone=job.timezone,
        skip_if_running=bool(job.skip_if_running),
        skip_if_manual_running=bool(job.skip_if_manual_running),
        payload=job.payload,
        last_run_at=job.last_run_at,
        next_run_at=next_run,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _scheduled_run_to_out(run: ScheduledJobRun) -> ScheduledJobRunOut:
    return ScheduledJobRunOut.from_orm(run)


def _get_scheduled_job_or_404(db: Session, job_id: int) -> ScheduledJob:
    job = db.query(ScheduledJob).filter(ScheduledJob.id == job_id).one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    return job


@app.get("/scheduler/jobs", response_model=List[ScheduledJobOut])
async def list_scheduler_jobs(db: Session = Depends(get_db)) -> List[ScheduledJobOut]:
    jobs = (
        db.query(ScheduledJob)
        .order_by(ScheduledJob.created_at.asc())
        .all()
    )
    return [_scheduled_job_to_out(job) for job in jobs]


@app.post("/scheduler/jobs", response_model=ScheduledJobOut, status_code=201)
async def create_scheduler_job(
    payload: ScheduledJobCreate,
    db: Session = Depends(get_db),
) -> ScheduledJobOut:
    try:
        scheduler_service.validate_schedule(
            payload.schedule_type,
            payload.cron_expression,
            payload.interval_minutes,
            payload.timezone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = ScheduledJob(
        name=payload.name,
        job_type=payload.job_type,
        enabled=payload.enabled,
        schedule_type=payload.schedule_type,
        cron_expression=payload.cron_expression,
        interval_minutes=payload.interval_minutes,
        timezone=payload.timezone,
        skip_if_running=payload.skip_if_running,
        skip_if_manual_running=payload.skip_if_manual_running,
        payload=payload.payload or {},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    await scheduler_service.refresh_job(job.id)
    return _scheduled_job_to_out(job)


@app.get("/scheduler/jobs/{job_id}", response_model=ScheduledJobOut)
async def get_scheduler_job(job_id: int, db: Session = Depends(get_db)) -> ScheduledJobOut:
    job = _get_scheduled_job_or_404(db, job_id)
    return _scheduled_job_to_out(job)


@app.patch("/scheduler/jobs/{job_id}", response_model=ScheduledJobOut)
async def update_scheduler_job(
    job_id: int,
    payload: ScheduledJobUpdate,
    db: Session = Depends(get_db),
) -> ScheduledJobOut:
    job = _get_scheduled_job_or_404(db, job_id)
    data = payload.dict(exclude_unset=True)

    schedule_type = data.get("schedule_type", job.schedule_type)
    timezone = data.get("timezone", job.timezone)
    if schedule_type == "cron":
        cron_expression = data.get("cron_expression", job.cron_expression)
        interval_minutes = None
        if not cron_expression:
            raise HTTPException(status_code=400, detail="cron_expression is required for cron schedules")
    else:
        interval_minutes = data.get("interval_minutes", job.interval_minutes)
        cron_expression = None
        if not interval_minutes:
            raise HTTPException(status_code=400, detail="interval_minutes is required for interval schedules")

    try:
        scheduler_service.validate_schedule(schedule_type, cron_expression, interval_minutes, timezone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "name" in data:
        job.name = data["name"]
    if "job_type" in data:
        job.job_type = data["job_type"]
    if "enabled" in data:
        job.enabled = data["enabled"]
    job.schedule_type = schedule_type
    job.cron_expression = cron_expression
    job.interval_minutes = interval_minutes
    job.timezone = timezone
    if "skip_if_running" in data:
        job.skip_if_running = data["skip_if_running"]
    if "skip_if_manual_running" in data:
        job.skip_if_manual_running = data["skip_if_manual_running"]
    if "payload" in data:
        job.payload = data["payload"] or {}

    db.add(job)
    db.commit()
    db.refresh(job)
    await scheduler_service.refresh_job(job.id)
    return _scheduled_job_to_out(job)


@app.delete("/scheduler/jobs/{job_id}", status_code=204)
async def delete_scheduler_job(job_id: int, db: Session = Depends(get_db)):
    job = _get_scheduled_job_or_404(db, job_id)
    await scheduler_service.remove_job(job.id)
    db.delete(job)
    db.commit()


@app.post("/scheduler/jobs/{job_id}/run", response_model=ScheduledJobRunDetail)
async def trigger_scheduler_job(job_id: int, db: Session = Depends(get_db)) -> ScheduledJobRunDetail:
    job = _get_scheduled_job_or_404(db, job_id)
    run_id = await scheduler_service.run_job_now(job.id)
    if not run_id:
        raise HTTPException(status_code=500, detail="Failed to start job run")
    run = db.query(ScheduledJobRun).filter(ScheduledJobRun.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Job run not found")
    return ScheduledJobRunDetail.from_orm(run)


@app.get("/scheduler/jobs/{job_id}/runs", response_model=List[ScheduledJobRunOut])
async def list_scheduler_job_runs(
    job_id: int,
    limit: int = 25,
    db: Session = Depends(get_db),
) -> List[ScheduledJobRunOut]:
    _ = _get_scheduled_job_or_404(db, job_id)
    bounded_limit = max(1, min(limit, 200))
    runs = (
        db.query(ScheduledJobRun)
        .filter(ScheduledJobRun.job_id == job_id)
        .order_by(ScheduledJobRun.started_at.desc())
        .limit(bounded_limit)
        .all()
    )
    return [_scheduled_run_to_out(run) for run in runs]


@app.get("/scheduler/jobs/{job_id}/runs/{run_id}", response_model=ScheduledJobRunDetail)
async def get_scheduler_job_run(
    job_id: int,
    run_id: int,
    db: Session = Depends(get_db),
) -> ScheduledJobRunDetail:
    _ = _get_scheduled_job_or_404(db, job_id)
    run = (
        db.query(ScheduledJobRun)
        .filter(ScheduledJobRun.job_id == job_id, ScheduledJobRun.id == run_id)
        .one_or_none()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Job run not found")
    return ScheduledJobRunDetail.from_orm(run)


@app.get("/scheduler/jobs/{job_id}/runs/{run_id}/log")
async def get_scheduler_job_run_log(
    job_id: int,
    run_id: int,
    db: Session = Depends(get_db),
):
    _ = _get_scheduled_job_or_404(db, job_id)
    run = (
        db.query(ScheduledJobRun)
        .filter(ScheduledJobRun.job_id == job_id, ScheduledJobRun.id == run_id)
        .one_or_none()
    )
    if not run or not run.log_path:
        raise HTTPException(status_code=404, detail="Log not found for this run")
    log_path = Path(run.log_path)
    if not log_path.exists() or not log_path.is_file():
        raise HTTPException(status_code=404, detail="Log file is not available")
    return FileResponse(log_path, media_type="text/plain")


def _run_gemini_auto_extract(post_id: int) -> None:
    session = SessionLocal()
    try:
        post = (
            session.query(Post)
            .options(joinedload(Post.extracted_event))
            .filter(Post.id == post_id)
            .one_or_none()
        )
        if not post:
            return
        settings = ensure_default_settings(session)
        changed = auto_extract_for_post(post, settings, overwrite=False)
        if changed:
            session.commit()
        else:
            session.rollback()
    except Exception as exc:  # pragma: no cover - background safety
        session.rollback()
        print(f"Gemini background extraction failed for post {post_id}: {exc}")
    finally:
        session.close()
