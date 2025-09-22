from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class ClubBase(BaseModel):
    name: str
    username: str
    active: bool = True
    classification_mode: str = Field(default="auto", pattern="^(manual|auto)$")


class ClubCreate(ClubBase):
    pass


class ClubUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    classification_mode: Optional[str] = Field(default=None, pattern="^(manual|auto)$")


class ClubOut(ClubBase):
    id: int
    last_checked: Optional[str]
    created_at: str
    updated_at: str

    @validator('last_checked', pre=True)
    def format_last_checked(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @validator('created_at', pre=True)
    def format_created_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @validator('updated_at', pre=True)
    def format_updated_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        orm_mode = True


class ExtractedEventOut(BaseModel):
    id: int
    post_id: int
    event_data_json: Any
    extraction_confidence: Optional[float]
    created_at: str
    imported_to_eventscrape: bool

    @validator('created_at', pre=True)
    def format_created_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        orm_mode = True


class PostOut(BaseModel):
    id: int
    club_id: int
    instagram_id: str
    image_url: Optional[str]
    local_image_path: Optional[str]
    caption: Optional[str]
    post_timestamp: str
    collected_at: str
    is_event_poster: Optional[bool]
    classification_confidence: Optional[float]
    processed: bool
    manual_review_notes: Optional[str]
    club: ClubOut
    extracted_event: Optional[ExtractedEventOut] = None

    @validator('post_timestamp', pre=True)
    def format_post_timestamp(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @validator('collected_at', pre=True)
    def format_collected_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        orm_mode = True


class PostClassificationRequest(BaseModel):
    is_event_poster: bool
    confidence: float = Field(ge=0.0, le=1.0)
    notes: Optional[str] = None


class EventExtractionRequest(BaseModel):
    event_data: Any
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class ExtractedEventWithPostOut(BaseModel):
    id: int
    post_id: int
    event_data_json: Any
    extraction_confidence: Optional[float]
    created_at: str
    imported_to_eventscrape: bool
    post: PostOut

    @validator('created_at', pre=True)
    def format_created_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        orm_mode = True


class MonitorStatus(BaseModel):
    monitoring_enabled: bool
    monitor_interval_minutes: int
    last_run: Optional[str] = None
    next_run_eta_seconds: Optional[int] = None
    classification_mode: Optional[str] = Field(default=None, pattern="^(manual|auto)$")
    last_error: Optional[str] = None
    apify_enabled: bool
    instagram_fetcher: str = Field(pattern="^(auto|instaloader|apify)$")
    apify_runner: str = Field(pattern="^(disabled|unconfigured|rest|rest_fallback|node)$")
    session_username: Optional[str] = None
    session_uploaded_at: Optional[str] = None
    session_age_minutes: Optional[int] = None
    is_rate_limited: bool = False
    rate_limit_until: Optional[str] = None

    @validator('session_uploaded_at', 'rate_limit_until', pre=True)
    def format_iso_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v


class CSVImportResponse(BaseModel):
    clubs_created: int
    clubs_updated: int


class StatsOut(BaseModel):
    total_clubs: int
    active_clubs: int
    pending_posts: int
    event_posts: int
    processed_events: int


class SystemSettingsOut(BaseModel):
    id: int
    monitoring_enabled: bool
    monitor_interval_minutes: int
    classification_mode: str = Field(pattern="^(manual|auto)$")
    instaloader_username: Optional[str]
    instaloader_session_uploaded_at: Optional[str]
    club_fetch_delay_seconds: int
    apify_enabled: bool
    apify_actor_id: Optional[str]
    apify_results_limit: int
    has_apify_token: bool
    instagram_fetcher: str = Field(pattern="^(auto|instaloader|apify)$")
    created_at: str
    updated_at: str

    @validator('created_at', pre=True)
    def format_created_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @validator('updated_at', pre=True)
    def format_updated_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @validator('instaloader_session_uploaded_at', pre=True)
    def format_instaloader_uploaded_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        orm_mode = True


class SystemSettingsUpdate(BaseModel):
    classification_mode: Optional[str] = Field(default=None, pattern="^(manual|auto)$")
    monitor_interval_minutes: Optional[int] = Field(default=None, ge=1)
    club_fetch_delay_seconds: Optional[int] = Field(default=None, ge=0)
    apify_enabled: Optional[bool] = None
    apify_actor_id: Optional[str] = None
    apify_results_limit: Optional[int] = Field(default=None, ge=1, le=1000)
    instagram_fetcher: Optional[str] = Field(default=None, pattern="^(auto|instaloader|apify)$")


class ApifyTokenUpdate(BaseModel):
    token: Optional[str] = None


class ApifyTestRequest(BaseModel):
    url: str = Field(min_length=1)
    limit: Optional[int] = Field(default=10, ge=1, le=100)


class ApifyTestPostOut(BaseModel):
    id: str
    username: Optional[str] = None
    caption: Optional[str] = None
    image_url: Optional[str] = None
    timestamp: Optional[str] = None
    is_video: bool = False
    permalink: Optional[str] = None

    @validator("timestamp", pre=True)
    def format_timestamp(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v


class ApifyTestResponse(BaseModel):
    runner: str = Field(pattern="^(rest|rest_fallback|node)$")
    input: Dict[str, Any]
    items: List[Dict[str, Any]]
    posts: List[ApifyTestPostOut]


class DeletePostResponse(BaseModel):
    id: int
    success: bool = True


class ApifyImportStats(BaseModel):
    attempted: int
    created: int
    skipped_existing: int
    missing_clubs: int
    message: str


class ClubFetchLatestResponse(BaseModel):
    club_id: int
    club_username: str
    requested: int
    fetched: int
    created: int
    message: str
