from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload

from .database import SessionLocal, engine
from .models import Base, Club, ExtractedEvent, Post, ClassificationModeEnum, ensure_default_settings
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
)
from .services.monitor import monitor_service, RateLimitError
from .utils.csv_loader import import_clubs_from_csv

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
    finally:
        session.close()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    task: Optional[asyncio.Task] = getattr(app.state, "monitor_task", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


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
        cleaned_actor = payload.apify_actor_id.strip() or None
        settings.apify_actor_id = cleaned_actor
        updated = True
    if payload.apify_results_limit is not None:
        settings.apify_results_limit = payload.apify_results_limit
        updated = True
    if payload.instagram_fetcher is not None:
        fetcher = payload.instagram_fetcher.lower()
        if fetcher not in {"auto", "instaloader", "apify"}:
            raise HTTPException(status_code=400, detail="Invalid Instagram fetcher selection")
        settings.instagram_fetcher = fetcher
        updated = True
    if updated:
        db.commit()
        db.refresh(settings)
        monitor_service.clear_last_error()
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
        fetch_mode = (settings.instagram_fetcher or "auto").lower()
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
        if fetch_mode == "auto" and not has_loader and not apify_ready:
            raise HTTPException(
                status_code=503,
                detail="No Instagram fetcher is ready. Provide an Instaloader session or Apify credentials."
            )

        stats = monitor_service.fetch_latest_posts_for_clubs(db, post_count)
        return {
            "success": True,
            "message": f"Successfully fetched posts from {stats['clubs']} clubs",
            "stats": stats
        }
    except RateLimitError as exc:
        detail = str(exc) or "Instagram temporarily blocked our requests. Please try again later."
        raise HTTPException(status_code=429, detail=detail)
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
            fetch_mode = (settings.instagram_fetcher or "auto").lower()
            apify_ready = bool(settings.apify_api_token and settings.apify_actor_id)
            has_loader = bool(monitor_service.loader)

            if fetch_mode == "instaloader" and not has_loader:
                yield f"data: {json.dumps({'error': 'Instaloader session is not available'})}\n\n"
                return
            if fetch_mode == "apify" and not apify_ready:
                yield f"data: {json.dumps({'error': 'Apify integration is not configured'})}\n\n"
                return
            if fetch_mode == "auto" and not has_loader and not apify_ready:
                yield f"data: {json.dumps({'error': 'Neither Instaloader nor Apify is ready to fetch'})}\n\n"
                return

            if monitor_service._in_backoff():
                if fetch_mode != "instaloader" and apify_ready:
                    monitor_service.clear_backoff()
                else:
                    wait_seconds = monitor_service.next_run_eta_seconds or monitor_service.rate_limit_backoff_minutes * 60
                    yield f"data: {json.dumps({'status': 'error', 'error': f'Instagram is throttling requests. Please retry in {max(wait_seconds // 60, 1)} minutes.'})}\n\n"
                    return

            yield f"data: {json.dumps({'status': 'starting', 'message': f'Starting to fetch {post_count} posts from {active_clubs_count} clubs'})}\n\n"

            stats = {"clubs": 0, "posts": 0, "classified": 0}
            monitor_service._last_run = datetime.utcnow()

            global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

            clubs = db.query(Club).filter(Club.active.is_(True)).all()
            total_clubs = len(clubs)

            for i, club in enumerate(clubs, 1):
                yield f"data: {json.dumps({'status': 'processing', 'current_club': club.username, 'progress': i, 'total': total_clubs, 'message': f'Processing {club.name} ({i}/{total_clubs})'})}\n\n"

                stats["clubs"] += 1
                try:
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

                for post in posts:
                    auto_classify = global_auto and (club.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO
                    if monitor_service._create_post_if_new(db, club, post, auto_classify):
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
    db: Session = Depends(get_db),
) -> PostOut:
    post = db.query(Post).options(joinedload(Post.club)).filter(Post.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.is_event_poster = payload.is_event_poster
    post.classification_confidence = payload.confidence
    post.manual_review_notes = payload.notes
    db.commit()
    db.refresh(post)
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
    return MonitorStatus(
        monitoring_enabled=settings.monitoring_enabled,
        monitor_interval_minutes=settings.monitor_interval_minutes,
        last_run=last_run,
        next_run_eta_seconds=monitor_service.next_run_eta_seconds,
        classification_mode=settings.classification_mode,
        apify_enabled=settings.apify_enabled,
        instagram_fetcher=settings.instagram_fetcher,
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
        instagram_fetcher=(settings.instagram_fetcher or "auto"),
        created_at=_iso(settings.created_at),
        updated_at=_iso(settings.updated_at),
    )
