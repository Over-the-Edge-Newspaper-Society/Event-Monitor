from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from ..models import Club, Post, ClassificationModeEnum, ensure_default_settings
from .classifier import CaptionClassifier
from ..utils.image_downloader import download_image

try:
    from instaloader import Instaloader, Profile
except ImportError:  # pragma: no cover
    Instaloader = None  # type: ignore
    Profile = None  # type: ignore
    InstaloaderException = Exception  # type: ignore
else:
    from instaloader.exceptions import InstaloaderException  # type: ignore


class RateLimitError(Exception):
    """Raised when Instagram responds with a temporary rate limit / throttle message."""
    pass


class MonitorService:
    def __init__(self) -> None:
        self.classifier = CaptionClassifier()
        self.loader = None
        self.session_username: Optional[str] = None
        self.session_file_path = Path(
            os.getenv("INSTALOADER_SESSION_FILE", "app/instaloader_session/instaloader.session")
        )
        self.session_file_path.parent.mkdir(parents=True, exist_ok=True)
        self._last_error: Optional[str] = None
        if Instaloader:
            self.loader = self._create_loader()
        self._last_run: Optional[datetime] = None
        self._next_run_eta_seconds: Optional[int] = None

    @property
    def last_run(self) -> Optional[datetime]:
        return self._last_run

    @property
    def next_run_eta_seconds(self) -> Optional[int]:
        return self._next_run_eta_seconds

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def clear_last_error(self) -> None:
        self._last_error = None

    def set_last_error(self, message: Optional[str]) -> None:
        self._last_error = message

    def _create_loader(self):
        if not Instaloader:
            return None
        loader = Instaloader(
            download_pictures=False,
            download_video_thumbnails=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
        )
        # Set logging level to ERROR to reduce noise
        import logging

        logging.getLogger("instaloader").setLevel(logging.ERROR)
        return loader

    def configure_from_settings(self, settings) -> None:
        if not Instaloader:
            return
        self.loader = self._create_loader()
        self.session_username = None
        if (
            self.loader
            and settings.instaloader_username
            and self.session_file_path.exists()
        ):
            try:
                self.loader.load_session_from_file(
                    settings.instaloader_username,
                    str(self.session_file_path),
                )
                self.session_username = settings.instaloader_username
            except Exception as exc:  # pragma: no cover
                self.set_last_error(f"Failed to load Instagram session: {exc}")
                raise

    def remove_session(self) -> None:
        if self.session_file_path.exists():
            self.session_file_path.unlink(missing_ok=True)
        self.session_username = None
        self.loader = self._create_loader()
        self.clear_last_error()

    def _build_profile(self, username: str) -> Optional[Profile]:  # type: ignore[name-defined]
        if not self.loader or not Profile:
            return None
        try:
            return Profile.from_username(self.loader.context, username)
        except InstaloaderException as exc:
            message = str(exc)
            if "Please wait a few minutes" in message or "Too many requests" in message:
                raise RateLimitError(message) from exc
            return None

    def _collect_recent_posts(self, username: str, since: datetime) -> List[Dict]:
        profile = self._build_profile(username)
        if not profile:
            return []
        posts: List[Dict] = []
        try:
            for node in profile.get_posts():
                post_time = node.date_utc.replace(tzinfo=None)
                if post_time < since:
                    break
                posts.append(
                    {
                        "id": node.shortcode,
                        "caption": node.caption or "",
                        "image_url": node.url,
                        "timestamp": post_time,
                        "is_video": node.is_video,
                    }
                )
        except InstaloaderException as exc:
            message = str(exc)
            if "Please wait a few minutes" in message or "Too many requests" in message:
                raise RateLimitError(message) from exc
            return []
        return posts

    def fetch_latest_posts_for_clubs(self, session: Session, post_count: int = 3) -> Dict[str, int]:
        """Fetch the latest N posts from all active clubs, regardless of last check time"""
        stats = {"clubs": 0, "posts": 0, "classified": 0}
        self._last_run = datetime.utcnow()

        settings = ensure_default_settings(session)
        global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

        clubs: Iterable[Club] = session.query(Club).filter(Club.active.is_(True)).all()
        try:
            for club in clubs:
                stats["clubs"] += 1
                try:
                    posts = self._collect_latest_posts(club.username, post_count)
                except RateLimitError as exc:
                    session.rollback()
                    self.set_last_error(str(exc))
                    raise
                for post in posts:
                    auto_classify = global_auto and (club.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO
                    if self._create_post_if_new(session, club, post, auto_classify):
                        stats["posts"] += 1
                        if auto_classify:
                            stats["classified"] += 1
                club.last_checked = datetime.utcnow()
                self._apply_delay(settings.club_fetch_delay_seconds)
            session.commit()
            self.clear_last_error()
            return stats
        except RateLimitError:
            raise

    def _collect_latest_posts(self, username: str, count: int = 3) -> List[Dict]:
        """Collect the latest N posts from a profile, regardless of date"""
        profile = self._build_profile(username)
        if not profile:
            return []
        posts: List[Dict] = []
        try:
            post_iter = profile.get_posts()
            for i, node in enumerate(post_iter):
                if i >= count:  # Stop after collecting the specified number of posts
                    break
                posts.append(
                    {
                        "id": node.shortcode,
                        "caption": node.caption or "",
                        "image_url": node.url,
                        "timestamp": node.date_utc.replace(tzinfo=None),
                        "is_video": node.is_video,
                    }
                )
        except InstaloaderException as exc:
            message = str(exc)
            if "Please wait a few minutes" in message or "Too many requests" in message:
                raise RateLimitError(message) from exc
            return []
        return posts

    def monitor_active_clubs(self, session: Session) -> Dict[str, int]:
        stats = {"clubs": 0, "posts": 0, "classified": 0}
        settings = ensure_default_settings(session)
        if not settings.monitoring_enabled:
            return stats

        global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

        self._last_run = datetime.utcnow()
        clubs: Iterable[Club] = session.query(Club).filter(Club.active.is_(True)).all()
        try:
            for club in clubs:
                stats["clubs"] += 1
                lookback_start = club.last_checked or (datetime.utcnow() - timedelta(hours=24))
                lookback_start -= timedelta(minutes=5)
                try:
                    posts = self._collect_recent_posts(club.username, lookback_start)
                except RateLimitError as exc:
                    session.rollback()
                    self.set_last_error(str(exc))
                    raise
                for post in posts:
                    auto_classify = global_auto and (club.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO
                    if self._create_post_if_new(session, club, post, auto_classify):
                        stats["posts"] += 1
                        if auto_classify:
                            stats["classified"] += 1
                club.last_checked = datetime.utcnow()
                self._apply_delay(settings.club_fetch_delay_seconds)
            session.commit()
            self.clear_last_error()
            return stats
        except RateLimitError:
            raise

    def _create_post_if_new(self, session: Session, club: Club, post: Dict, auto_classify: bool) -> bool:
        existing = session.query(Post).filter(Post.instagram_id == post["id"]).one_or_none()
        if existing:
            return False
        is_event = None
        confidence = None
        if auto_classify:
            is_event_bool, conf = self.classifier.classify(post.get("caption"))
            is_event = is_event_bool
            confidence = conf

        # Download image locally
        local_image_filename = None
        if post.get("image_url"):
            local_image_filename = download_image(post["image_url"], post["id"])

        db_post = Post(
            club_id=club.id,
            instagram_id=post["id"],
            image_url=post.get("image_url"),
            local_image_path=local_image_filename,
            caption=post.get("caption"),
            post_timestamp=post.get("timestamp", datetime.utcnow()),
            is_event_poster=is_event,
            classification_confidence=confidence,
            processed=False,
        )
        session.add(db_post)
        session.flush()
        return True

    def _apply_delay(self, delay_seconds: Optional[int]) -> None:
        if not delay_seconds:
            return
        try:
            delay = float(delay_seconds)
        except (TypeError, ValueError):
            return
        if delay <= 0:
            return
        time.sleep(delay)

    async def run_periodic_monitor(self, session_factory: Callable[[], Session], default_interval: int) -> None:
        interval = max(default_interval, 5)
        while True:
            self._next_run_eta_seconds = None
            session = session_factory()
            try:
                settings = ensure_default_settings(session)
                interval = max(settings.monitor_interval_minutes or default_interval, 5)
                self.monitor_active_clubs(session)
            except RateLimitError:
                session.rollback()
            except Exception:
                session.rollback()
            finally:
                session.close()
            self._next_run_eta_seconds = interval * 60
            await asyncio.sleep(interval * 60)


monitor_service = MonitorService()
