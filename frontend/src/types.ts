import type { ComponentType } from "react";

export type FetcherMode = "auto" | "instaloader" | "apify";

export type ApifyRunnerMode = "disabled" | "unconfigured" | "rest" | "rest_fallback" | "node";

export interface Club {
  id: number;
  name: string;
  username: string;
  active: boolean;
  classification_mode: "manual" | "auto";
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorStatus {
  monitoring_enabled: boolean;
  monitor_interval_minutes: number;
  last_run: string | null;
  next_run_eta_seconds: number | null;
  classification_mode: "manual" | "auto";
  last_error: string | null;
  apify_enabled: boolean;
  instagram_fetcher: FetcherMode;
  apify_runner: ApifyRunnerMode;
  session_username: string | null;
  session_uploaded_at: string | null;
  session_age_minutes: number | null;
  is_rate_limited: boolean;
  rate_limit_until: string | null;
}

export interface ExtractedEvent {
  id: number;
  post_id: number;
  event_data_json: unknown;
  extraction_confidence: number | null;
  created_at: string;
  imported_to_eventscrape: boolean;
}

export interface PostRecord {
  id: number;
  club_id: number;
  instagram_id: string;
  image_url?: string;
  local_image_path?: string;
  caption?: string;
  post_timestamp: string;
  collected_at: string;
  is_event_poster: boolean | null;
  classification_confidence: number | null;
  processed: boolean;
  manual_review_notes?: string | null;
  club: Club;
  extracted_event?: ExtractedEvent | null;
}

export interface StatsSnapshot {
  total_clubs: number;
  active_clubs: number;
  pending_posts: number;
  event_posts: number;
  processed_events: number;
}

export interface SystemSettings {
  id: number;
  monitoring_enabled: boolean;
  monitor_interval_minutes: number;
  classification_mode: "manual" | "auto";
  instaloader_username?: string | null;
  instaloader_session_uploaded_at?: string | null;
  club_fetch_delay_seconds: number;
  apify_enabled: boolean;
  apify_actor_id?: string | null;
  apify_results_limit: number;
  has_gemini_api_key: boolean;
  has_apify_token: boolean;
  gemini_auto_extract: boolean;
  instagram_fetcher: FetcherMode;
  created_at: string;
  updated_at: string;
}

export interface ApifyTestPost {
  id: string;
  username?: string | null;
  caption?: string | null;
  image_url?: string | null;
  timestamp?: string | null;
  is_video: boolean;
  permalink?: string | null;
}

export interface ApifyTestResult {
  runner: ApifyRunnerMode;
  input: Record<string, unknown>;
  items: Record<string, unknown>[];
  posts: ApifyTestPost[];
}

export interface ClubFetchLatestResponse {
  club_id: number;
  club_username: string;
  requested: number;
  fetched: number;
  created: number;
  message: string;
}

export interface ApifyImportStats {
  attempted: number;
  created: number;
  skipped_existing: number;
  missing_clubs: number;
  message: string;
}

export interface TabsConfig {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export type TabId = "setup" | "monitor" | "classify" | "events";
