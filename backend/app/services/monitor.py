from __future__ import annotations

import asyncio
import json
import os
import random
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from ..models import Club, Post, ClassificationModeEnum, ensure_default_settings
from .classifier import CaptionClassifier
from ..utils.image_downloader import download_image
from ..utils.apify_client import ApifyClient, ApifyClientError, ApifyRunTimeoutError

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
        self._rate_limit_until: Optional[datetime] = None
        self._rate_limit_backoff_minutes = int(os.getenv("INSTAGRAM_RATE_LIMIT_BACKOFF_MINUTES", "15"))
        self._known_post_break_threshold = int(os.getenv("INSTAGRAM_KNOWN_POST_BREAK_THRESHOLD", "2"))
        self._apify_client: Optional[ApifyClient] = None
        self._apify_signature: Optional[str] = None

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

    def _collect_recent_posts(
        self,
        username: str,
        since: datetime,
        known_post_ids: Optional[Set[str]] = None,
    ) -> List[Dict]:
        profile = self._build_profile(username)
        if not profile:
            return []
        posts: List[Dict] = []
        consecutive_known = 0
        try:
            for node in profile.get_posts():
                post_time = node.date_utc.replace(tzinfo=None)
                if post_time < since:
                    break
                if known_post_ids and node.shortcode in known_post_ids:
                    consecutive_known += 1
                    if consecutive_known >= max(self._known_post_break_threshold, 1):
                        break
                    continue
                consecutive_known = 0
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
        if self._in_backoff() and not self._should_use_apify(settings):
            return stats
        global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

        clubs: Iterable[Club] = session.query(Club).filter(Club.active.is_(True)).all()
        try:
            for club in clubs:
                stats["clubs"] += 1
                known_post_ids = self._get_recent_post_ids(session, club.id)
                posts = self._fetch_latest_posts_for_club(
                    settings,
                    club.username,
                    post_count,
                    known_post_ids,
                )
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
            self.clear_backoff()
            return stats
        except RateLimitError:
            raise

    def _collect_latest_posts(
        self,
        username: str,
        count: int = 3,
        known_post_ids: Optional[Set[str]] = None,
    ) -> List[Dict]:
        """Collect the latest N posts from a profile, regardless of date"""
        profile = self._build_profile(username)
        if not profile:
            return []
        posts: List[Dict] = []
        consecutive_known = 0
        try:
            post_iter = profile.get_posts()
            for i, node in enumerate(post_iter):
                if i >= count:  # Stop after collecting the specified number of posts
                    break
                if known_post_ids and node.shortcode in known_post_ids:
                    consecutive_known += 1
                    if consecutive_known >= max(self._known_post_break_threshold, 1):
                        break
                    continue
                consecutive_known = 0
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

        if self._in_backoff() and not self._should_use_apify(settings):
            return stats

        global_auto = (settings.classification_mode or ClassificationModeEnum.MANUAL).lower() == ClassificationModeEnum.AUTO

        self._last_run = datetime.utcnow()
        clubs: Iterable[Club] = session.query(Club).filter(Club.active.is_(True)).all()
        try:
            for club in clubs:
                stats["clubs"] += 1
                lookback_start = club.last_checked or (datetime.utcnow() - timedelta(hours=24))
                lookback_start -= timedelta(minutes=5)
                known_post_ids = self._get_recent_post_ids(session, club.id)
                posts = self._fetch_recent_posts_for_club(
                    settings,
                    club.username,
                    lookback_start,
                    known_post_ids,
                )
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
            self.clear_backoff()
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
        jitter_multiplier = random.uniform(0.85, 1.25)
        time.sleep(max(0.5, delay * jitter_multiplier))

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
            sleep_seconds = interval * 60
            if self._rate_limit_until:
                now = datetime.utcnow()
                if now < self._rate_limit_until:
                    sleep_seconds = max(sleep_seconds, int((self._rate_limit_until - now).total_seconds()))
                else:
                    self._rate_limit_until = None
            self._next_run_eta_seconds = sleep_seconds
            await asyncio.sleep(sleep_seconds)

    def _get_recent_post_ids(self, session: Session, club_id: int, limit: int = 20) -> Set[str]:
        rows = (
            session.query(Post.instagram_id)
            .filter(Post.club_id == club_id)
            .order_by(Post.post_timestamp.desc())
            .limit(limit)
            .all()
        )
        return {row[0] for row in rows if row[0]}

    def _schedule_backoff(self, minutes: Optional[int] = None) -> None:
        minutes = minutes or self._rate_limit_backoff_minutes
        minutes = max(minutes, 1)
        now = datetime.utcnow()
        self._rate_limit_until = now + timedelta(minutes=minutes)
        self._next_run_eta_seconds = int((self._rate_limit_until - now).total_seconds())

    def _in_backoff(self) -> bool:
        if not self._rate_limit_until:
            return False
        now = datetime.utcnow()
        if now >= self._rate_limit_until:
            self._rate_limit_until = None
            return False
        self._next_run_eta_seconds = int((self._rate_limit_until - now).total_seconds())
        return True

    def clear_backoff(self) -> None:
        self._rate_limit_until = None

    @property
    def rate_limit_until(self) -> Optional[datetime]:
        return self._rate_limit_until

    @property
    def rate_limit_backoff_minutes(self) -> int:
        return self._rate_limit_backoff_minutes

    @staticmethod
    def parse_cookie_input(raw: str) -> Dict[str, str]:
        raw = (raw or "").strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            return {str(k): str(v) for k, v in parsed.items() if isinstance(k, str)}
        cookies: Dict[str, str] = {}
        cleaned = raw.replace("\n", ";")
        for segment in cleaned.split(";"):
            segment = segment.strip()
            if not segment or "=" not in segment:
                continue
            key, value = segment.split("=", 1)
            cookies[key.strip()] = value.strip()
        if not cookies and raw:
            cookies["sessionid"] = raw
        return cookies

    def save_session_from_cookies(self, username: str, cookies: Dict[str, str]) -> None:
        if not cookies.get("sessionid"):
            raise ValueError("Session cookie must include 'sessionid'.")
        if not self.loader:
            self.loader = self._create_loader()
        if not self.loader:
            raise ValueError("Instaloader is not available on this server")

        allowed_keys = {
            "sessionid",
            "ds_user_id",
            "csrftoken",
            "mid",
            "ig_did",
            "shbid",
            "shbts",
            "rur",
            "urlgen",
        }
        session_payload = {k: v for k, v in cookies.items() if k in allowed_keys and v}
        session_payload["sessionid"] = cookies["sessionid"]

        self.session_file_path.parent.mkdir(parents=True, exist_ok=True)
        self.session_file_path.write_text(json.dumps(session_payload))

        try:
            self.loader.load_session_from_file(username, str(self.session_file_path))
            self.session_username = username
        except Exception as exc:
            self.session_file_path.unlink(missing_ok=True)
            self.session_username = None
            raise ValueError(f"Failed to load session from cookies: {exc}")

    def _should_use_apify(self, settings) -> bool:
        if not getattr(settings, "apify_enabled", False):
            return False
        return bool(settings.apify_api_token and settings.apify_actor_id)

    def _get_apify_client(self, settings) -> Optional[ApifyClient]:
        if not self._should_use_apify(settings):
            return None
        signature = f"{settings.apify_api_token}:{settings.apify_actor_id}"
        if self._apify_client and self._apify_signature == signature:
            return self._apify_client
        if self._apify_client:
            self._apify_client.close()
            self._apify_client = None
        try:
            self._apify_client = ApifyClient(settings.apify_api_token, settings.apify_actor_id)
        except ValueError as exc:
            self.set_last_error(str(exc))
            self._apify_client = None
            return None
        self._apify_signature = signature
        return self._apify_client

    def _collect_posts_via_apify(
        self,
        client: ApifyClient,
        username: str,
        limit: int,
        known_post_ids: Optional[Set[str]] = None,
    ) -> List[Dict]:
        run_input = {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "posts",
            "resultsLimit": limit,
            "addParentData": False,
        }
        try:
            items = client.run_and_collect(run_input, dataset_limit=limit)
        except (ApifyClientError, ApifyRunTimeoutError) as exc:
            raise ApifyClientError(str(exc)) from exc

        posts: List[Dict] = []
        consecutive_known = 0
        for item in items:
            shortcode = item.get("shortCode") or item.get("shortcode") or item.get("id")
            if not shortcode:
                continue
            if known_post_ids and shortcode in known_post_ids:
                consecutive_known += 1
                if consecutive_known >= max(self._known_post_break_threshold, 1):
                    break
                continue
            consecutive_known = 0
            timestamp_value = item.get("timestamp")
            timestamp_dt = datetime.utcnow()
            if isinstance(timestamp_value, str):
                try:
                    timestamp_dt = datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    pass
            caption = item.get("caption") or ""
            image_url = item.get("displayUrl") or item.get("display_url")
            if not image_url:
                images = item.get("images") or []
                if images:
                    first = images[0]
                    if isinstance(first, dict):
                        image_url = first.get("url") or first.get("displayUrl")
            posts.append(
                {
                    "id": shortcode,
                    "caption": caption,
                    "image_url": image_url,
                    "timestamp": timestamp_dt,
                    "is_video": item.get("type") == "Video",
                }
            )
        return posts

    def _fetch_latest_posts_for_club(
        self,
        settings,
        username: str,
        count: int,
        known_post_ids: Optional[Set[str]],
    ) -> List[Dict]:
        prefer_apify = self._should_use_apify(settings)
        apify_client = self._get_apify_client(settings) if prefer_apify else None
        posts: List[Dict] = []
        if apify_client:
            try:
                limit = settings.apify_results_limit or count
                posts = self._collect_posts_via_apify(apify_client, username, limit, known_post_ids)
            except ApifyClientError as exc:
                self.set_last_error(f"Apify error: {exc}")
                posts = []

        if posts:
            return posts

        if not self.loader:
            if self._should_use_apify(settings) and apify_client:
                return posts
            raise RateLimitError("Instaloader is not available and Apify did not return results")

        try:
            return self._collect_latest_posts(username, count, known_post_ids)
        except RateLimitError as exc:
            if not self._should_use_apify(settings):
                self._schedule_backoff()
                raise
            apify_client = self._get_apify_client(settings)
            if not apify_client:
                self.set_last_error(str(exc))
                self._schedule_backoff()
                raise
            try:
                limit = settings.apify_results_limit or count
                posts = self._collect_posts_via_apify(apify_client, username, limit, known_post_ids)
                self.clear_backoff()
                return posts
            except ApifyClientError as apify_exc:
                self.set_last_error(f"Apify error: {apify_exc}")
                self._schedule_backoff()
                raise RateLimitError(str(exc)) from apify_exc

    def _fetch_recent_posts_for_club(
        self,
        settings,
        username: str,
        since: datetime,
        known_post_ids: Optional[Set[str]],
    ) -> List[Dict]:
        prefer_apify = self._should_use_apify(settings)
        apify_client = self._get_apify_client(settings) if prefer_apify else None
        posts: List[Dict] = []
        if apify_client:
            try:
                limit = settings.apify_results_limit or 30
                posts = self._collect_posts_via_apify(apify_client, username, limit, known_post_ids)
                posts = [p for p in posts if p.get("timestamp") and p["timestamp"] >= since]
            except ApifyClientError as exc:
                self.set_last_error(f"Apify error: {exc}")
                posts = []

        if posts:
            return posts

        if not self.loader:
            if self._should_use_apify(settings) and apify_client:
                return posts
            raise RateLimitError("Instaloader is not available and Apify did not return results")

        try:
            return self._collect_recent_posts(username, since, known_post_ids)
        except RateLimitError as exc:
            if not self._should_use_apify(settings):
                self._schedule_backoff()
                raise
            apify_client = self._get_apify_client(settings)
            if not apify_client:
                self.set_last_error(str(exc))
                self._schedule_backoff()
                raise
            try:
                limit = settings.apify_results_limit or 30
                posts = self._collect_posts_via_apify(apify_client, username, limit, known_post_ids)
                posts = [p for p in posts if p.get("timestamp") and p["timestamp"] >= since]
                self.clear_backoff()
                return posts
            except ApifyClientError as apify_exc:
                self.set_last_error(f"Apify error: {apify_exc}")
                self._schedule_backoff()
                raise RateLimitError(str(exc)) from apify_exc


monitor_service = MonitorService()
