from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    inspect,
    text,
)
from sqlalchemy.orm import relationship

from .database import Base


DEFAULT_APIFY_ACTOR_ID = "nH2AHrwxeTRJoN5hX"


class ClassificationModeEnum(str):
    MANUAL = "manual"
    AUTO = "auto"


class Club(Base):
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    username = Column(String(255), unique=True, nullable=False, index=True)
    active = Column(Boolean, default=True, nullable=False)
    classification_mode = Column(String(20), default=ClassificationModeEnum.AUTO, nullable=False)
    last_checked = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    posts = relationship("Post", back_populates="club", cascade="all, delete-orphan")


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (UniqueConstraint("instagram_id", name="uq_posts_instagram_id"),)

    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False)
    instagram_id = Column(String(255), nullable=False)
    image_url = Column(Text, nullable=True)
    local_image_path = Column(String(255), nullable=True)
    caption = Column(Text, nullable=True)
    post_timestamp = Column(DateTime, nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_event_poster = Column(Boolean, nullable=True)
    classification_confidence = Column(Float, nullable=True)
    processed = Column(Boolean, default=False, nullable=False)
    manual_review_notes = Column(Text, nullable=True)

    club = relationship("Club", back_populates="posts")
    extracted_event = relationship(
        "ExtractedEvent",
        back_populates="post",
        uselist=False,
        cascade="all, delete-orphan",
    )


class ExtractedEvent(Base):
    __tablename__ = "extracted_events"

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, unique=True)
    event_data_json = Column(JSON, nullable=False)
    extraction_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    imported_to_eventscrape = Column(Boolean, default=False, nullable=False)

    post = relationship("Post", back_populates="extracted_event")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    monitoring_enabled = Column(Boolean, default=False, nullable=False)
    monitor_interval_minutes = Column(Integer, default=45, nullable=False)
    classification_mode = Column(String(20), default=ClassificationModeEnum.AUTO, nullable=False)
    instaloader_username = Column(String(255), nullable=True)
    instaloader_session_uploaded_at = Column(DateTime, nullable=True)
    club_fetch_delay_seconds = Column(Integer, default=2, nullable=False)
    apify_enabled = Column(Boolean, default=False, nullable=False)
    apify_actor_id = Column(String(255), default=DEFAULT_APIFY_ACTOR_ID, nullable=True)
    apify_results_limit = Column(Integer, default=30, nullable=False)
    apify_api_token = Column(String(512), nullable=True)
    instagram_fetcher = Column(String(20), default="auto", nullable=False)
    gemini_api_key = Column(String(512), nullable=True)
    gemini_auto_extract = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


def ensure_default_settings(session) -> SystemSetting:
    bind = session.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("system_settings")}

    alter_statements = []
    if "apify_enabled" not in columns:
        alter_statements.append("ADD COLUMN apify_enabled BOOLEAN DEFAULT 0 NOT NULL")
    if "apify_actor_id" not in columns:
        alter_statements.append(f"ADD COLUMN apify_actor_id VARCHAR(255) DEFAULT '{DEFAULT_APIFY_ACTOR_ID}'")
    if "apify_results_limit" not in columns:
        alter_statements.append("ADD COLUMN apify_results_limit INTEGER DEFAULT 30 NOT NULL")
    if "apify_api_token" not in columns:
        alter_statements.append("ADD COLUMN apify_api_token VARCHAR(512)")
    if "instagram_fetcher" not in columns:
        alter_statements.append("ADD COLUMN instagram_fetcher VARCHAR(20) DEFAULT 'auto' NOT NULL")
    if "gemini_api_key" not in columns:
        alter_statements.append("ADD COLUMN gemini_api_key VARCHAR(512)")
    if "gemini_auto_extract" not in columns:
        alter_statements.append("ADD COLUMN gemini_auto_extract BOOLEAN DEFAULT 0 NOT NULL")

    if alter_statements:
        with bind.connect() as conn:
            for statement in alter_statements:
                conn.execute(text(f"ALTER TABLE system_settings {statement}"))
            conn.commit()

    setting: Optional[SystemSetting] = session.query(SystemSetting).order_by(SystemSetting.id).first()
    updated = False
    if setting is None:
        setting = SystemSetting(
            monitoring_enabled=False,
            monitor_interval_minutes=45,
            classification_mode=ClassificationModeEnum.AUTO,
            club_fetch_delay_seconds=2,
            apify_actor_id=DEFAULT_APIFY_ACTOR_ID,
        )
        session.add(setting)
        session.commit()
        session.refresh(setting)
    else:
        if setting.monitor_interval_minutes is None:
            setting.monitor_interval_minutes = 45
            updated = True
        if not getattr(setting, "classification_mode", None):
            setting.classification_mode = ClassificationModeEnum.AUTO
            updated = True
        if setting.club_fetch_delay_seconds is None:
            setting.club_fetch_delay_seconds = 2
            updated = True
        if not getattr(setting, "apify_actor_id", None):
            setting.apify_actor_id = DEFAULT_APIFY_ACTOR_ID
            updated = True
        if setting.apify_results_limit is None:
            setting.apify_results_limit = 30
            updated = True
        if setting.apify_enabled is None:
            setting.apify_enabled = False
            updated = True
        if not getattr(setting, "instagram_fetcher", None):
            setting.instagram_fetcher = "auto"
            updated = True
        if not hasattr(setting, "gemini_api_key"):
            setting.gemini_api_key = None
            updated = True
        if getattr(setting, "gemini_auto_extract", None) is None:
            setting.gemini_auto_extract = False
            updated = True

    env_actor_id = os.getenv("APIFY_ACTOR_ID")
    if env_actor_id and setting.apify_actor_id != env_actor_id:
        setting.apify_actor_id = env_actor_id
        updated = True

    env_token = os.getenv("APIFY_API_TOKEN")
    if env_token and setting.apify_api_token != env_token:
        setting.apify_api_token = env_token
        updated = True

    env_enabled = os.getenv("APIFY_ENABLED")
    if env_enabled is not None:
        normalized = env_enabled.strip().lower()
        desired = normalized in {"1", "true", "yes", "on"}
        if bool(setting.apify_enabled) != desired:
            setting.apify_enabled = desired
            updated = True

    env_limit = os.getenv("APIFY_RESULTS_LIMIT")
    if env_limit:
        try:
            parsed_limit = max(1, min(int(env_limit), 1000))
        except ValueError:
            parsed_limit = None
        if parsed_limit is not None and setting.apify_results_limit != parsed_limit:
            setting.apify_results_limit = parsed_limit
            updated = True

    env_fetcher = os.getenv("APIFY_FETCHER_MODE")
    if env_fetcher:
        normalized_fetcher = env_fetcher.strip().lower()
        if normalized_fetcher in {"auto", "instaloader", "apify"} and setting.instagram_fetcher != normalized_fetcher:
            setting.instagram_fetcher = normalized_fetcher
            updated = True
    if updated:
        session.commit()
        session.refresh(setting)
    return setting
