import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Database,
  Download,
  FileText,
  Image as ImageIcon,
  Monitor,
  Pause,
  Play,
  RefreshCcw,
  Settings,
  Upload,
  Zap,
  Trash2,
  Sparkles,
} from "lucide-react";

const RAW_API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const API_BASE = typeof RAW_API_BASE === "string" ? RAW_API_BASE.replace(/\/$/, "") : "";
const STATIC_BASE = API_BASE.startsWith("http") ? API_BASE : "";

interface Club {
  id: number;
  name: string;
  username: string;
  active: boolean;
  classification_mode: "manual" | "auto";
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

interface MonitorStatus {
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

interface ExtractedEvent {
  id: number;
  post_id: number;
  event_data_json: unknown;
  extraction_confidence: number | null;
  created_at: string;
  imported_to_eventscrape: boolean;
}

interface PostRecord {
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

interface StatsSnapshot {
  total_clubs: number;
  active_clubs: number;
  pending_posts: number;
  event_posts: number;
  processed_events: number;
}

interface SystemSettings {
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
  has_apify_token: boolean;
  has_gemini_api_key: boolean;
  gemini_auto_extract: boolean;
  instagram_fetcher: FetcherMode;
  created_at: string;
  updated_at: string;
}

type FetcherMode = "auto" | "instaloader" | "apify";
type ApifyRunnerMode = "disabled" | "unconfigured" | "rest" | "rest_fallback" | "node";

interface ApifyTestPost {
  id: string;
  username?: string | null;
  caption?: string | null;
  image_url?: string | null;
  timestamp?: string | null;
  is_video: boolean;
  permalink?: string | null;
}

interface ApifyTestResult {
  runner: ApifyRunnerMode;
  input: Record<string, unknown>;
  items: Record<string, unknown>[];
  posts: ApifyTestPost[];
}

interface ClubFetchLatestResponse {
  club_id: number;
  club_username: string;
  requested: number;
  fetched: number;
  created: number;
  message: string;
}

interface ApifyImportStats {
  attempted: number;
  created: number;
  skipped_existing: number;
  missing_clubs: number;
  message: string;
}

const FETCHER_LABELS: Record<FetcherMode, string> = {
  auto: "Auto (hybrid)",
  instaloader: "Instaloader only",
  apify: "Apify only",
};

const APIFY_RUNNER_LABELS: Record<ApifyRunnerMode, string> = {
  disabled: "Disabled",
  unconfigured: "Missing token",
  rest: "REST polling",
  rest_fallback: "REST (Node unavailable)",
  node: "Node SDK",
};

const tabs = [
  { id: "setup", label: "Setup", icon: Settings },
  { id: "monitor", label: "Monitor", icon: Monitor },
  { id: "classify", label: "Classify", icon: ImageIcon },
  { id: "events", label: "Events", icon: CheckCircle },
] as const;

type TabId = (typeof tabs)[number]["id"];

const APIFY_SAMPLE_ACCOUNTS = [
  { label: "humansofny", url: "https://www.instagram.com/humansofny/" },
  { label: "unbcpion", url: "https://www.instagram.com/unbcpion/" },
] as const;

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [fetchingPostCount, setFetchingPostCount] = useState<number | null>(null);
  const [fetchProgress, setFetchProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [eventModalPost, setEventModalPost] = useState<PostRecord | null>(null);
  const [eventJson, setEventJson] = useState<string>("");
  const [eventJsonError, setEventJsonError] = useState<string | null>(null);
  const [isExtractingEvent, setIsExtractingEvent] = useState(false);
  const [extractEventError, setExtractEventError] = useState<string | null>(null);
  const [isUpdatingWorkflow, setIsUpdatingWorkflow] = useState(false);
  const [sessionUsernameInput, setSessionUsernameInput] = useState("");
  const [isUploadingSession, setIsUploadingSession] = useState(false);
  const [isRemovingSession, setIsRemovingSession] = useState(false);
  const [clubDelayInput, setClubDelayInput] = useState<number>(2);
  const [isSavingDelay, setIsSavingDelay] = useState(false);
  const [sessionFileKey, setSessionFileKey] = useState(() => Date.now().toString());
  const [sessionCookieInput, setSessionCookieInput] = useState("");
  const [apifyEnabledInput, setApifyEnabledInput] = useState(false);
  const [apifyResultsLimitInput, setApifyResultsLimitInput] = useState<number>(30);
  const [apifyTokenInput, setApifyTokenInput] = useState("");
  const [isSavingApifySettings, setIsSavingApifySettings] = useState(false);
  const [isSavingApifyToken, setIsSavingApifyToken] = useState(false);
  const [isClearingApifyToken, setIsClearingApifyToken] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [isClearingGeminiKey, setIsClearingGeminiKey] = useState(false);
  const [geminiAutoExtractEnabled, setGeminiAutoExtractEnabled] = useState(false);
  const [isSavingGeminiSettings, setIsSavingGeminiSettings] = useState(false);
  const [apifyFetcherMode, setApifyFetcherMode] = useState<FetcherMode>("auto");
  const [apifyTestUrl, setApifyTestUrl] = useState("https://www.instagram.com/humansofny/");
  const [apifyTestLimit, setApifyTestLimit] = useState<number>(1);
  const [apifyTestResult, setApifyTestResult] = useState<ApifyTestResult | null>(null);
  const [isRunningApifyTest, setIsRunningApifyTest] = useState(false);
  const [apifyTestError, setApifyTestError] = useState<string | null>(null);
  const [apifyRunIdInput, setApifyRunIdInput] = useState("");
  const [apifyRunLimit, setApifyRunLimit] = useState<number>(10);
  const [isFetchingApifyRun, setIsFetchingApifyRun] = useState(false);
  const [apifyResultSummary, setApifyResultSummary] = useState<string | null>(null);
  const [fetchingClubId, setFetchingClubId] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [isImportingApifyRun, setIsImportingApifyRun] = useState(false);
  const [lastLoadedRunId, setLastLoadedRunId] = useState<string | null>(null);
  const [isExportingEvents, setIsExportingEvents] = useState(false);

  // Helper function to get the appropriate image URL
  const getImageUrl = (post: PostRecord): string | null => {
    if (post.local_image_path) {
      const prefix = STATIC_BASE ? `${STATIC_BASE}` : "";
      return `${prefix}/static/images/${post.local_image_path}`;
    }
    return post.image_url || null;
  };

  const eventPosts = useMemo(
    () => posts.filter((post) => post.is_event_poster === true),
    [posts]
  );
  const reviewQueue = useMemo(() => {
    return posts
      .filter((post) => {
        if (post.is_event_poster === null) {
          return true;
        }
        if (post.is_event_poster === true) {
          return !post.extracted_event;
        }
        return false;
      })
      .map((post) => ({
        post,
        source: post.is_event_poster === true ? "ai" : "manual",
      }))
      .sort((a, b) => {
        const aTime = new Date(a.post.post_timestamp).getTime();
        const bTime = new Date(b.post.post_timestamp).getTime();
        return bTime - aTime;
      });
  }, [posts]);

  const handleApiError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3500);
  }, []);

  const fetchClubs = useCallback(async () => {
    const response = await fetch(`${API_BASE}/clubs`);
    if (!response.ok) {
      throw new Error("Failed to fetch clubs");
    }
    const data: Club[] = await response.json();
    setClubs(data);
  }, []);

  const fetchPosts = useCallback(async () => {
    const response = await fetch(`${API_BASE}/posts`);
    if (!response.ok) {
      throw new Error("Failed to fetch posts");
    }
    const data: PostRecord[] = await response.json();
    setPosts(data);
  }, []);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`${API_BASE}/monitor/status`);
    if (!response.ok) {
      throw new Error("Failed to fetch monitor status");
    }
    const data: MonitorStatus = await response.json();
    setStatus(data);
  }, []);

  const fetchStats = useCallback(async () => {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) {
      throw new Error("Failed to fetch system stats");
    }
    const data: StatsSnapshot = await response.json();
    setStats(data);
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    const response = await fetch(`${API_BASE}/settings`);
    if (!response.ok) {
      throw new Error("Failed to fetch system settings");
    }
    const data: SystemSettings = await response.json();
    setSystemSettings(data);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([
        fetchClubs(),
        fetchPosts(),
        fetchStatus(),
        fetchStats(),
        fetchSystemSettings(),
      ]);
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchClubs, fetchPosts, fetchStatus, fetchStats, fetchSystemSettings, handleApiError]);

  useEffect(() => {
    refreshAll().catch(() => undefined);
  }, [refreshAll]);

  useEffect(() => {
    if (systemSettings) {
      setSessionUsernameInput(systemSettings.instaloader_username ?? "");
      setClubDelayInput(systemSettings.club_fetch_delay_seconds);
      setApifyResultsLimitInput(systemSettings.apify_results_limit);
      const fetcher = systemSettings.instagram_fetcher ?? "auto";
      setApifyFetcherMode(fetcher);
      setApifyEnabledInput(fetcher === "apify" ? true : systemSettings.apify_enabled);
      setGeminiAutoExtractEnabled(Boolean(systemSettings.gemini_auto_extract));
    }
  }, [systemSettings]);

  const handleToggleActive = async (club: Club) => {
    try {
      const response = await fetch(`${API_BASE}/clubs/${club.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !club.active }),
      });
      if (!response.ok) {
        throw new Error("Failed to update club");
      }
      await refreshAll();
      showSuccess(`${club.name} is now ${!club.active ? "active" : "inactive"}`);
    } catch (err) {
      handleApiError((err as Error).message);
    }
  };

  const handleToggleMode = async (club: Club) => {
    const nextMode = club.classification_mode === "auto" ? "manual" : "auto";
    try {
      const response = await fetch(`${API_BASE}/clubs/${club.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification_mode: nextMode }),
      });
      if (!response.ok) {
        throw new Error("Failed to update classification mode");
      }
      await refreshAll();
      showSuccess(`${club.name} classification set to ${nextMode.toUpperCase()}`);
    } catch (err) {
      handleApiError((err as Error).message);
    }
  };

  const handleFetchLatestForClub = async (club: Club, postCount: number = 1) => {
    try {
      setFetchingClubId(club.id);
      const response = await fetch(`${API_BASE}/clubs/${club.id}/fetch-latest?post_count=${postCount}`, {
        method: "POST",
      });
      if (!response.ok) {
        const text = await response.text();
        let detail = text || `Failed to fetch posts for ${club.name}`;
        if (text) {
          try {
            const payload = JSON.parse(text);
            detail =
              (typeof payload.detail === "string" && payload.detail) ||
              (typeof payload.error === "string" && payload.error) ||
              detail;
          } catch {
            detail = text;
          }
        }
        throw new Error(detail);
      }
      const data: ClubFetchLatestResponse = await response.json();
      await refreshAll();
      showSuccess(data.message);
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setFetchingClubId(null);
    }
  };

  const handleDeletePost = async (post: PostRecord) => {
    if (!confirm(`Delete post ${post.instagram_id}? This cannot be undone.`)) {
      return;
    }
    try {
      setDeletingPostId(post.id);
      const response = await fetch(`${API_BASE}/posts/${post.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        let detail = text || "Failed to delete post";
        if (text) {
          try {
            const payload = JSON.parse(text);
            detail =
              (typeof payload.detail === "string" && payload.detail) ||
              (typeof payload.error === "string" && payload.error) ||
              detail;
          } catch {
            detail = text;
          }
        }
        throw new Error(detail);
      }
      await refreshAll();
      showSuccess(`Deleted post ${post.instagram_id}.`);
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleToggleWorkflowMode = async () => {
    if (!systemSettings) return;
    const nextMode = systemSettings.classification_mode === "auto" ? "manual" : "auto";
    try {
      setIsUpdatingWorkflow(true);
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification_mode: nextMode }),
      });
      if (!response.ok) {
        throw new Error("Failed to update workflow mode");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      await fetchStatus();
      showSuccess(`Workflow classification set to ${nextMode === "auto" ? "AI" : "Manual"} mode`);
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsUpdatingWorkflow(false);
    }
  };

  const handleSessionFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!sessionUsernameInput.trim()) {
      handleApiError("Enter the Instagram username used to generate the session file before uploading.");
      event.target.value = "";
      return;
    }
    try {
      setIsUploadingSession(true);
      const form = new FormData();
      form.append("username", sessionUsernameInput.trim());
      form.append("file", file);
      const response = await fetch(`${API_BASE}/settings/session`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to upload Instagram session file");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      setSessionFileKey(Date.now().toString());
      await fetchStatus();
      showSuccess("Instagram session uploaded. Future fetches will use the authenticated session.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsUploadingSession(false);
      event.target.value = "";
    }
  };

  const handleSessionCookieSubmit = async () => {
    if (!sessionUsernameInput.trim()) {
      handleApiError("Enter the Instagram username that owns the cookie before saving.");
      return;
    }
    if (!sessionCookieInput.trim()) {
      handleApiError("Paste a session cookie string first.");
      return;
    }
    try {
      setIsUploadingSession(true);
      const form = new FormData();
      form.append("username", sessionUsernameInput.trim());
      form.append("session_cookie", sessionCookieInput.trim());
      const response = await fetch(`${API_BASE}/settings/session`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save session cookie");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      setSessionCookieInput("");
      await fetchStatus();
      showSuccess("Instagram session cookie stored. Refresh the monitor if it was paused.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsUploadingSession(false);
    }
  };

  const handleRemoveSession = async () => {
    if (!systemSettings?.instaloader_username) return;
    try {
      setIsRemovingSession(true);
      const response = await fetch(`${API_BASE}/settings/session`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to remove Instagram session");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      await fetchStatus();
      showSuccess("Removed saved Instagram session.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsRemovingSession(false);
    }
  };

  const handleSaveApifySettings = async () => {
    try {
      setIsSavingApifySettings(true);
      const payload: Record<string, unknown> = {
        apify_enabled: apifyEnabledInput,
        apify_results_limit: apifyResultsLimitInput,
        instagram_fetcher: apifyFetcherMode,
      };
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to update Apify settings");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      await fetchStatus();
      showSuccess("Updated Apify integration settings.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsSavingApifySettings(false);
    }
  };

  const handleSaveApifyToken = async () => {
    if (!apifyTokenInput.trim()) {
      handleApiError("Paste an Apify API token before saving.");
      return;
    }
    try {
      setIsSavingApifyToken(true);
      const response = await fetch(`${API_BASE}/settings/apify/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: apifyTokenInput.trim() }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to store Apify token");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      setApifyTokenInput("");
      await fetchStatus();
      showSuccess("Saved Apify API token.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsSavingApifyToken(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiApiKeyInput.trim();
    if (!trimmed) {
      handleApiError("Paste a Gemini API key before saving.");
      return;
    }
    try {
      setIsSavingGeminiKey(true);
      const response = await fetch(`${API_BASE}/settings/gemini/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: trimmed }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to store Gemini API key");
      }
      setGeminiApiKeyInput("");
      await fetchSystemSettings();
      showSuccess("Saved Gemini API key.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleClearGeminiKey = async () => {
    try {
      setIsClearingGeminiKey(true);
      const response = await fetch(`${API_BASE}/settings/gemini/api-key`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to remove Gemini API key");
      }
      setGeminiApiKeyInput("");
      await fetchSystemSettings();
      showSuccess("Removed Gemini API key.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsClearingGeminiKey(false);
    }
  };

  const handleSaveGeminiSettings = async () => {
    try {
      setIsSavingGeminiSettings(true);
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemini_auto_extract: geminiAutoExtractEnabled }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to update Gemini settings");
      }
      await fetchSystemSettings();
      showSuccess(
        geminiAutoExtractEnabled
          ? "Gemini auto extraction enabled."
          : "Gemini auto extraction disabled."
      );
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsSavingGeminiSettings(false);
    }
  };

  const handleExportEvents = async () => {
    try {
      setIsExportingEvents(true);
      const response = await fetch(`${API_BASE}/events/export`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to export events");
      }
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `event-export-${timestamp}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSuccess("Downloaded event export JSON.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsExportingEvents(false);
    }
  };

  const handleClearApifyToken = async () => {
    try {
      setIsClearingApifyToken(true);
      const response = await fetch(`${API_BASE}/settings/apify/token`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to remove Apify token");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      await fetchStatus();
      showSuccess("Removed Apify API token.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsClearingApifyToken(false);
    }
  };

  const handleSaveDelay = async () => {
    if (Number.isNaN(clubDelayInput)) {
      handleApiError("Enter a valid delay");
      return;
    }
    if (clubDelayInput < 0) {
      handleApiError("Delay cannot be negative");
      return;
    }
    try {
      setIsSavingDelay(true);
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ club_fetch_delay_seconds: clubDelayInput }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to update fetch delay");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      showSuccess("Updated delay between club fetches.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsSavingDelay(false);
    }
  };

  const handleCSVUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${API_BASE}/clubs/import`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error("Failed to import CSV");
      }
      const result = await response.json();
      await refreshAll();
      showSuccess(`Imported ${result.clubs_created} new clubs and updated ${result.clubs_updated}`);
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      event.target.value = "";
    }
  };

  const handleMonitorToggle = async () => {
    if (!status) return;
    try {
      const endpoint = status.monitoring_enabled ? "stop" : "start";
      const response = await fetch(`${API_BASE}/monitor/${endpoint}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to toggle monitor");
      }
      const data: MonitorStatus = await response.json();
      setStatus(data);
      showSuccess(`Monitoring ${data.monitoring_enabled ? "started" : "paused"}`);
    } catch (err) {
      handleApiError((err as Error).message);
    }
  };

  const handleFetchLatestPosts = async (postCount: number = 3) => {
    try {
      setIsFetchingPosts(true);
      setFetchingPostCount(postCount);
      setFetchProgress(`Starting to fetch ${postCount} latest ${postCount === 1 ? 'post' : 'posts'} from all active clubs...`);
      setError(null);

      const response = await fetch(`${API_BASE}/monitor/fetch-latest-stream?post_count=${postCount}`, {
        method: "POST"
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch latest posts");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to read response stream");
      }

      const decoder = new TextDecoder();
      let done = false;
      let finalStats = null;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.status === 'starting') {
                  setFetchProgress(data.message);
                } else if (data.status === 'processing') {
                  setFetchProgress(`Processing ${data.current_club} (${data.progress}/${data.total})`);
                } else if (data.status === 'completed_club') {
                  setFetchProgress(`✓ ${data.club} - found ${data.posts_found} posts (${data.progress}/${data.total})`);
                } else if (data.status === 'completed') {
                  finalStats = data.stats;
                  setFetchProgress(`✅ ${data.message}`);
                } else if (data.status === 'error') {
                  throw new Error(data.error);
                }
              } catch (parseError) {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      }

      // Small delay to show completion message
      setTimeout(() => {
        setFetchProgress(null);
      }, 2000);

      if (finalStats) {
        if (finalStats.posts > 0) {
          showSuccess(`Successfully fetched posts! Found ${finalStats.posts} new posts from ${finalStats.clubs} clubs.`);
        } else if (finalStats.clubs > 0) {
          showSuccess(`Checked ${finalStats.clubs} clubs but no new posts were found. All posts may already be in the database.`);
        } else {
          showSuccess(`No active clubs to check. Please activate some clubs in the Setup tab.`);
        }
      }

      await refreshAll();
    } catch (err) {
      setFetchProgress(null);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      handleApiError(`Failed to fetch posts: ${errorMessage}`);
    } finally {
      setIsFetchingPosts(false);
      setFetchingPostCount(null);
    }
  };

  const handleRunApifyTest = useCallback(
    async (urlOverride?: string, limitOverride?: number) => {
      const rawUrl = urlOverride ?? apifyTestUrl;
      const targetUrl = rawUrl.trim();
      const requestedLimit = limitOverride ?? apifyTestLimit;
      const normalizedLimit = Math.min(Math.max(Math.round(requestedLimit), 1), 100);

      if (!targetUrl) {
        setApifyTestError("Provide an Instagram URL or username before running the test.");
        return;
      }

      setApifyTestUrl(targetUrl);
      setApifyTestLimit(normalizedLimit);
      setIsRunningApifyTest(true);
      setApifyTestError(null);
      setApifyResultSummary(null);
      setLastLoadedRunId(null);

      try {
        const response = await fetch(`${API_BASE}/apify/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl, limit: normalizedLimit }),
        });

        if (!response.ok) {
          let detail = "Failed to run Apify test.";
          const text = await response.text();
          if (text) {
            try {
              const payload = JSON.parse(text);
              detail =
                (typeof payload.detail === "string" && payload.detail) ||
                (typeof payload.error === "string" && payload.error) ||
                detail;
            } catch {
              detail = text;
            }
          }
          setApifyTestError(detail);
          return;
        }

        const data: ApifyTestResult = await response.json();
        setApifyTestResult(data);
        setApifyResultSummary(`Live test run for ${targetUrl}`);
      } catch (err) {
        setApifyTestError(err instanceof Error ? err.message : "Failed to run Apify test.");
      } finally {
        setIsRunningApifyTest(false);
      }
    },
    [apifyTestUrl, apifyTestLimit]
  );

  const handleFetchApifyRun = useCallback(async () => {
    const runId = apifyRunIdInput.trim();
    const normalizedLimit = Math.min(Math.max(Math.round(apifyRunLimit), 1), 100);
    if (!runId) {
      setApifyTestError("Paste an Apify run ID before loading results.");
      return;
    }

    setApifyRunLimit(normalizedLimit);
    setIsFetchingApifyRun(true);
    setApifyTestError(null);
    setApifyResultSummary(null);

    try {
      const response = await fetch(
        `${API_BASE}/apify/run/${encodeURIComponent(runId)}?limit=${normalizedLimit}`
      );

      if (!response.ok) {
        let detail = "Failed to load Apify run.";
        const text = await response.text();
        if (text) {
          try {
            const payload = JSON.parse(text);
            detail =
              (typeof payload.detail === "string" && payload.detail) ||
              (typeof payload.error === "string" && payload.error) ||
              detail;
          } catch {
            detail = text;
          }
        }
        setApifyTestError(detail);
        return;
      }

      const data: ApifyTestResult = await response.json();
      setApifyTestResult(data);
      setApifyResultSummary(`Snapshot from Apify run ${runId}`);
      setLastLoadedRunId(runId);
      const userInputs = Array.isArray(data.input?.username) ? data.input?.username : [];
      if (userInputs && userInputs.length > 0) {
        setApifyTestUrl(String(userInputs[0] ?? ""));
      } else if (Array.isArray(data.input?.directUrls) && data.input.directUrls.length > 0) {
        setApifyTestUrl(String(data.input.directUrls[0] ?? ""));
      }
    } catch (err) {
      setApifyTestError(err instanceof Error ? err.message : "Failed to load Apify run.");
    } finally {
      setIsFetchingApifyRun(false);
    }
  }, [apifyRunIdInput, apifyRunLimit]);

  const handleImportApifyRun = useCallback(async () => {
    if (!lastLoadedRunId) {
      setApifyTestError("Load an Apify run before importing posts.");
      return;
    }
    try {
      setIsImportingApifyRun(true);
      const response = await fetch(
        `${API_BASE}/apify/run/${encodeURIComponent(lastLoadedRunId)}/import?limit=${apifyRunLimit}`,
        { method: "POST" }
      );
      if (!response.ok) {
        const text = await response.text();
        let detail = text || "Failed to import posts from Apify run.";
        if (text) {
          try {
            const payload = JSON.parse(text);
            detail =
              (typeof payload.detail === "string" && payload.detail) ||
              (typeof payload.error === "string" && payload.error) ||
              detail;
          } catch {
            detail = text;
          }
        }
        throw new Error(detail);
      }
      const data: ApifyImportStats = await response.json();
      await refreshAll();
      showSuccess(data.message);
    } catch (err) {
      setApifyTestError(err instanceof Error ? err.message : "Failed to import posts from Apify run.");
    } finally {
      setIsImportingApifyRun(false);
    }
  }, [lastLoadedRunId, apifyRunLimit, refreshAll, showSuccess]);

  const handleManualClassification = async (post: PostRecord, isEvent: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/posts/${post.id}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_event_poster: isEvent,
          confidence: isEvent ? 0.95 : 0.05,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to classify post");
      }
      await refreshAll();
      if (isEvent && systemSettings?.gemini_auto_extract && systemSettings?.has_gemini_api_key) {
        showSuccess(`Marked post ${post.instagram_id} as event; Gemini extraction is running.`);
        setTimeout(() => {
          refreshAll().catch(() => undefined);
        }, 4000);
      } else {
        showSuccess(`Marked post ${post.instagram_id} as ${isEvent ? "event" : "non-event"}`);
      }
    } catch (err) {
      handleApiError((err as Error).message);
    }
  };

  const openEventModal = (post: PostRecord) => {
    setEventModalPost(post);
    setEventJson(post.extracted_event ? JSON.stringify(post.extracted_event.event_data_json, null, 2) : "");
    setEventJsonError(null);
    setExtractEventError(null);
    setIsExtractingEvent(false);
  };

  const closeEventModal = () => {
    setEventModalPost(null);
    setEventJson("");
    setEventJsonError(null);
    setExtractEventError(null);
    setIsExtractingEvent(false);
  };

  const handleSaveEventJson = async () => {
    if (!eventModalPost) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(eventJson);
    } catch {
      setEventJsonError("Invalid JSON payload");
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      setEventJsonError("Event payload must be a JSON object");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/posts/${eventModalPost.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_data: parsed, confidence: 0.9 }),
      });
      if (!response.ok) {
        throw new Error("Failed to attach event data");
      }
      await refreshAll();
      showSuccess("Event data saved");
      closeEventModal();
    } catch (err) {
      handleApiError((err as Error).message);
    }
  };

  const handleExtractEvent = async () => {
    if (!eventModalPost) return;
    if (!systemSettings?.has_gemini_api_key) {
      setExtractEventError("Add a Gemini API key in Setup to enable automatic extraction.");
      return;
    }
    try {
      setIsExtractingEvent(true);
      setExtractEventError(null);
      setEventJsonError(null);
      const response = await fetch(`${API_BASE}/posts/${eventModalPost.id}/extract`, {
        method: "POST",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to extract event data");
      }
      const updatedPost: PostRecord = await response.json();
      setEventModalPost(updatedPost);
      if (updatedPost.extracted_event) {
        setEventJson(JSON.stringify(updatedPost.extracted_event.event_data_json, null, 2));
      }
      await Promise.all([fetchPosts(), fetchStats()]);
      showSuccess("Gemini extracted event data.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to extract event data";
      setExtractEventError(message);
      handleApiError(message);
    } finally {
      setIsExtractingEvent(false);
    }
  };

  const renderAlert = () => {
    if (!error && !successMessage) return null;
    const isError = Boolean(error);
    const message = error ?? successMessage;
    const Icon = isError ? AlertCircle : CheckCircle;
    return (
      <div
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
          isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span>{message}</span>
      </div>
    );
  };

  const monitorButtonIcon = status?.monitoring_enabled ? Pause : Play;

  const formatTimestamp = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const describeMinutes = (minutes: number | null) => {
    if (minutes == null) return "—";
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const minutesInDay = 60 * 24;
    const days = Math.floor(minutes / minutesInDay);
    const remainingAfterDays = minutes % minutesInDay;
    const hours = Math.floor(remainingAfterDays / 60);
    const remainingMinutes = remainingAfterDays % 60;

    if (days > 0) {
      const dayPart = `${days} d`;
      if (hours > 0) {
        return remainingMinutes > 0 ? `${dayPart} ${hours} h ${remainingMinutes} min` : `${dayPart} ${hours} h`;
      }
      return remainingMinutes > 0 ? `${dayPart} ${remainingMinutes} min` : dayPart;
    }

    if (hours > 0) {
      return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
    }

    return `${minutes} min`;
  };

  const apifyPosts = apifyTestResult?.posts ?? [];
  const apifyDirectUrls = Array.isArray(apifyTestResult?.input?.directUrls)
    ? (apifyTestResult?.input?.directUrls as string[])
    : [];
  const apifyUsernameInputs = Array.isArray(apifyTestResult?.input?.username)
    ? (apifyTestResult?.input?.username as string[])
    : [];
  const apifyRunnerLabel =
    apifyTestResult ? APIFY_RUNNER_LABELS[apifyTestResult.runner] ?? apifyTestResult.runner : null;
  const apifyRawItemCount = apifyTestResult?.items?.length ?? 0;
  const apifyUniqueUsernames = Array.from(
    new Set(apifyPosts.map((post) => (post.username ? post.username.replace(/^@/, "") : null)).filter(Boolean))
  ) as string[];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <header className="bg-white rounded-xl shadow-sm">
          <div className="bg-blue-600 px-6 py-8 text-white rounded-t-xl">
            <h1 className="text-3xl font-bold">Instagram Event Monitor</h1>
            <p className="mt-2 text-blue-100">
              Scrape club profiles for new posts, classify event posters, and prepare data for extraction.
            </p>
          </div>
          <div className="border-b">
            <nav className="flex space-x-8 px-6">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === id
                      ? "border-purple-500 text-purple-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="inline h-4 w-4 mr-2" />
                  {label}
                </button>
              ))}
              <button
                onClick={refreshAll}
                disabled={isRefreshing}
                className="ml-auto flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 rounded-lg font-medium transition-colors"
              >
                <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </nav>
          </div>
        </header>

        {renderAlert()}

        {activeTab === "setup" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="text-xl font-semibold">Load Clubs CSV</h2>
              <p className="text-sm text-gray-600">
                Upload the export from your database. Include columns: name, username, active, classification_mode.
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-purple-400 transition-colors">
                <Upload className="h-10 w-10 text-gray-400 mb-3" />
                <span className="text-gray-600 font-medium">Drop CSV or Choose File</span>
                <span className="text-xs text-gray-400 mt-1">Max 5 MB</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              </label>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Tracked Clubs</h2>
                <span className="text-sm text-gray-500">{stats ? `${stats.active_clubs}/${stats.total_clubs} active` : "—"}</span>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {clubs.map((club) => (
                  <div key={club.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                    <div>
                      <a
                        href={`https://instagram.com/${club.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {club.name}
                      </a>
                      <p className="text-sm text-gray-500">@{club.username}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Last checked: {formatTimestamp(club.last_checked)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => handleToggleActive(club)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          club.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {club.active ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => handleToggleMode(club)}
                        className="text-xs text-purple-600 hover:text-purple-800"
                      >
                        Mode: {club.classification_mode.toUpperCase()}
                      </button>
                      <button
                        onClick={() => handleFetchLatestForClub(club, 1)}
                        disabled={fetchingClubId === club.id}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-60"
                      >
                        <RefreshCcw className={`h-3.5 w-3.5 ${fetchingClubId === club.id ? "animate-spin" : ""}`} />
                        {fetchingClubId === club.id ? "Fetching..." : "Fetch 1 post"}
                      </button>
                    </div>
                  </div>
                ))}
                {clubs.length === 0 && (
                  <p className="text-sm text-gray-500">Upload a CSV to start tracking clubs.</p>
                )}
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  Gemini Event Extraction
                </h2>
                <span className="text-xs text-gray-500">
                  {systemSettings?.has_gemini_api_key ? "Ready" : "Not configured"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Store a Gemini API key to let the app read posters and draft structured event JSON with one click.
              </p>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Gemini API key</label>
                <input
                  type="password"
                  value={geminiApiKeyInput}
                  onChange={(event) => setGeminiApiKeyInput(event.target.value)}
                  placeholder="AI... (from Google AI Studio)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSaveGeminiKey}
                    disabled={isSavingGeminiKey}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
                  >
                    {isSavingGeminiKey ? "Saving..." : "Save key"}
                  </button>
                  <button
                    onClick={handleClearGeminiKey}
                    disabled={!systemSettings?.has_gemini_api_key || isClearingGeminiKey}
                    className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-400"
                  >
                    {isClearingGeminiKey ? "Removing..." : "Remove key"}
                  </button>
                  <span className="text-xs text-gray-500">
                    {systemSettings?.has_gemini_api_key
                      ? "Key stored locally for extraction."
                      : "Generate one in Google AI Studio → API Keys."}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-200">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={geminiAutoExtractEnabled}
                      onChange={(event) => setGeminiAutoExtractEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    Auto extract new event posts with Gemini
                  </label>
                  <button
                    onClick={handleSaveGeminiSettings}
                    disabled={isSavingGeminiSettings}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
                  >
                    {isSavingGeminiSettings ? "Saving..." : "Save preference"}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  When enabled, freshly detected or approved event posts attempt extraction automatically.
                  Requires a valid API key; failures fall back to manual review.
                </p>
                <p className="text-xs text-gray-500">
                  The key lives only in your local settings database; nothing is uploaded elsewhere.
                </p>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                  Workflow Mode
                </h2>
                <span className="text-sm font-semibold text-purple-600">
                  {systemSettings ? (systemSettings.classification_mode === "auto" ? "AI" : "Manual") : "—"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Choose whether new posts are classified automatically with AI or queued for manual review before event extraction.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleToggleWorkflowMode}
                  disabled={!systemSettings || isUpdatingWorkflow}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 ${
                    systemSettings?.classification_mode === "auto"
                      ? "bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400"
                      : "bg-gray-700 hover:bg-gray-800 disabled:bg-gray-500"
                  }`}
                >
                  <Settings className={`h-4 w-4 ${isUpdatingWorkflow ? "animate-spin" : ""}`} />
                  {systemSettings?.classification_mode === "auto" ? "Switch to Manual" : "Switch to AI"}
                </button>
                <span className="text-xs text-gray-500">
                  {systemSettings?.classification_mode === "auto"
                    ? "AI mode classifies posts automatically."
                    : "Manual mode requires human review before events move forward."}
                </span>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                  Apify Integration
                </h2>
                <span className="text-xs text-gray-500">
                  {systemSettings?.apify_enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Choose whether to pull posts with Instaloader, Apify, or let the app switch automatically after
                rate limits. Provide your Apify actor ID and API token if you plan to use Apify.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fetcher preference</label>
                  <select
                    value={apifyFetcherMode}
                    onChange={(event) => {
                      const mode = event.target.value as FetcherMode;
                      setApifyFetcherMode(mode);
                      if (mode === "apify") {
                        setApifyEnabledInput(true);
                      }
                    }}
                    className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  >
                    <option value="auto">Auto (Instaloader first, Apify on block)</option>
                    <option value="instaloader">Instaloader only</option>
                    <option value="apify">Apify only</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Auto keeps Instaloader as primary; Apify is used only when needed.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={apifyEnabledInput}
                    onChange={(event) => setApifyEnabledInput(event.target.checked)}
                    disabled={apifyFetcherMode === "apify"}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-60"
                  />
                  Enable Apify fallback (used in auto mode)
                </label>
                <p className="text-xs text-gray-500">
                  Using Apify actor <span className="font-mono">nH2AHrwxeTRJoN5hX</span>. Override this by setting
                  the <span className="font-mono">APIFY_ACTOR_ID</span> environment variable if needed.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Results limit per club</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={apifyResultsLimitInput}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isNaN(value)) {
                        setApifyResultsLimitInput(Math.min(Math.max(1, Math.round(value)), 1000));
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  <p className="text-xs text-gray-500 mt-1">How many posts to request from Apify when invoked.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSaveApifySettings}
                    disabled={isSavingApifySettings}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
                  >
                    {isSavingApifySettings ? "Saving..." : "Save Apify settings"}
                  </button>
                  <span className="text-xs text-gray-500">
                    Limit and fetcher updates apply immediately to the next monitor run.
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Apify personal API token</label>
                  <input
                    type="password"
                    value={apifyTokenInput}
                    onChange={(event) => setApifyTokenInput(event.target.value)}
                    placeholder="apify_api_... (from Personal API tokens)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleSaveApifyToken}
                      disabled={isSavingApifyToken}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:bg-green-400"
                    >
                      {isSavingApifyToken ? "Saving token..." : "Save token"}
                    </button>
                    <button
                      onClick={handleClearApifyToken}
                      disabled={!systemSettings?.has_apify_token || isClearingApifyToken}
                      className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-400"
                    >
                      {isClearingApifyToken ? "Removing..." : "Remove token"}
                    </button>
                    <span className="text-xs text-gray-500">
                      {systemSettings?.has_apify_token
                        ? "Token stored securely."
                        : "Open Apify Console → Integrations → Personal API tokens to generate one."}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                  Instagram Login
                </h2>
                <span className="text-xs text-gray-500">
                  {systemSettings?.instaloader_username
                    ? `Signed in as ${systemSettings.instaloader_username}`
                    : "No session"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Generate an Instaloader session on your workstation (<code>instaloader -l USERNAME</code>)
                and upload the resulting <code>.session</code> file so the monitor can look like a real
                logged-in user. This dramatically reduces Instagram throttle errors.
              </p>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Instagram username</label>
                <input
                  type="text"
                  value={sessionUsernameInput}
                  onChange={(event) => setSessionUsernameInput(event.target.value)}
                  placeholder="account_username"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2">
                  <label className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 cursor-pointer hover:border-purple-400 transition-colors">
                    <Upload className={`h-4 w-4 mr-2 ${isUploadingSession ? "animate-spin" : ""}`} />
                    {isUploadingSession ? "Uploading session..." : "Upload session file"}
                    <input
                      key={sessionFileKey}
                      type="file"
                      accept=".session"
                      className="hidden"
                      onChange={handleSessionFileChange}
                      disabled={isUploadingSession}
                    />
                  </label>
                  <button
                    onClick={handleRemoveSession}
                    disabled={!systemSettings?.instaloader_username || isRemovingSession}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {isRemovingSession ? "Removing..." : "Remove session"}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Upload the <code>.session</code> file generated by Instaloader or paste your browser cookies below.
                </p>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Session cookie string</label>
                  <textarea
                    value={sessionCookieInput}
                    onChange={(event) => setSessionCookieInput(event.target.value)}
                    placeholder="sessionid=...; csrftoken=...; ds_user_id=..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2">
                  <button
                    onClick={handleSessionCookieSubmit}
                    disabled={isUploadingSession || !sessionCookieInput.trim()}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
                  >
                    {isUploadingSession ? "Saving..." : "Save cookie string"}
                  </button>
                  <span className="text-xs text-gray-500">
                    Paste the cookie header from dev tools; only keys like <code>sessionid</code> are stored.
                  </span>
                </div>
              </div>
              {status?.session_username && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">Active session: @{status?.session_username}</p>
                  <p>
                    Uploaded {formatTimestamp(status?.session_uploaded_at ?? null)}
                    {status?.session_age_minutes != null
                      ? ` (${describeMinutes(status?.session_age_minutes)} ago)`
                      : ""}
                  </p>
                  {status?.is_rate_limited && status?.rate_limit_until && (
                    <p className="text-xs text-red-600">
                      Rate limited until {formatTimestamp(status?.rate_limit_until ?? null)}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600" />
                Fetch Throttling
              </h2>
              <p className="text-sm text-gray-600">
                Add a short pause between clubs to stay under Instagram’s rate limits. Increase this value if you see “Please wait a few minutes” errors.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Delay (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={clubDelayInput}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isNaN(value)) {
                        setClubDelayInput(0);
                        return;
                      }
                      setClubDelayInput(Math.max(0, Math.round(value)));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <button
                  onClick={handleSaveDelay}
                  disabled={isSavingDelay}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
                >
                  {isSavingDelay ? "Saving..." : "Update delay"}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Current delay: {systemSettings?.club_fetch_delay_seconds ?? 0} seconds
              </p>
            </section>
          </div>
        )}

        {activeTab === "monitor" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2 bg-white rounded-xl shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Monitoring Status</h2>
                <button
                  onClick={handleMonitorToggle}
                  className={`px-5 py-2 rounded-lg font-semibold flex items-center gap-2 text-white ${
                    status?.monitoring_enabled ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {status?.monitoring_enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {status?.monitoring_enabled ? "Pause Monitor" : "Start Monitor"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-900">Monitor State</p>
                  <p className="text-lg font-semibold text-blue-700 mt-1">
                    {status?.monitoring_enabled ? "Running" : "Stopped"}
                  </p>
                  <p className="text-xs text-blue-500 mt-2">
                    Interval: {status?.monitor_interval_minutes ?? "—"} minutes
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    Workflow: {status ? (status.classification_mode === "auto" ? "AI" : "Manual") : "—"}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    Fetcher: {status ? FETCHER_LABELS[status.instagram_fetcher] : "—"}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    Apify fallback: {status?.apify_enabled ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    Apify runner: {status ? APIFY_RUNNER_LABELS[status.apify_runner] : "—"}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-900">Last Run</p>
                  <p className="text-lg font-semibold text-purple-700 mt-1">{formatTimestamp(status?.last_run ?? null)}</p>
                  <p className="text-xs text-purple-500 mt-2">
                    Next run in {status?.next_run_eta_seconds ? `${Math.round(status.next_run_eta_seconds / 60)} min` : "—"}
                  </p>
                  {status?.is_rate_limited && status?.rate_limit_until && (
                    <p className="text-xs text-red-600 mt-1">
                      Backing off until {formatTimestamp(status?.rate_limit_until ?? null)}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-900">Activity</p>
                  <p className="text-lg font-semibold text-green-700 mt-1">
                    {stats ? `${stats.event_posts} events / ${stats.pending_posts} pending` : "—"}
                  </p>
                  <p className="text-xs text-green-500 mt-2">Processed events: {stats?.processed_events ?? "—"}</p>
                </div>
              </div>
              {status?.last_error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 font-medium">Instagram temporarily blocked our requests</p>
                    <p className="text-xs text-red-600 mt-1">{status.last_error}</p>
                  </div>
                </div>
              )}

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Manual Actions</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleFetchLatestPosts(1)}
                    disabled={isFetchingPosts}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Download className={`h-4 w-4 ${isFetchingPosts && fetchingPostCount === 1 ? "animate-spin" : ""}`} />
                    {isFetchingPosts && fetchingPostCount === 1 ? "Fetching..." : "Fetch Latest 1 Post"}
                  </button>
                  <button
                    onClick={() => handleFetchLatestPosts(3)}
                    disabled={isFetchingPosts}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Download className={`h-4 w-4 ${isFetchingPosts && fetchingPostCount === 3 ? "animate-spin" : ""}`} />
                    {isFetchingPosts && fetchingPostCount === 3 ? "Fetching..." : "Fetch Latest 3 Posts"}
                  </button>
                  <button
                    onClick={() => handleFetchLatestPosts(5)}
                    disabled={isFetchingPosts}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Download className={`h-4 w-4 ${isFetchingPosts && fetchingPostCount === 5 ? "animate-spin" : ""}`} />
                    {isFetchingPosts && fetchingPostCount === 5 ? "Fetching..." : "Fetch Latest 5 Posts"}
                  </button>
                </div>

                {fetchProgress && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                      <p className="text-sm text-blue-700">{fetchProgress}</p>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      This may take a while depending on the number of active clubs...
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  Manually fetch the latest posts from all active clubs. This will collect recent posts regardless of the last check time.
                </p>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Apify Test Runner</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[2fr,auto] gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Instagram URL or username</label>
                      <input
                        type="text"
                        value={apifyTestUrl}
                        onChange={(event) => setApifyTestUrl(event.target.value)}
                        placeholder="https://www.instagram.com/humansofny/"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Posts to fetch</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={apifyTestLimit}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isNaN(value)) {
                            setApifyTestLimit(1);
                            return;
                          }
                          setApifyTestLimit(Math.min(Math.max(Math.round(value), 1), 100));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleRunApifyTest()}
                      disabled={isRunningApifyTest || isFetchingApifyRun}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <RefreshCcw className={`h-4 w-4 ${isRunningApifyTest ? "animate-spin" : ""}`} />
                      {isRunningApifyTest ? "Running test..." : "Run Apify test"}
                    </button>
                    {APIFY_SAMPLE_ACCOUNTS.map((sample) => (
                      <button
                        key={sample.url}
                        type="button"
                        disabled={isRunningApifyTest || isFetchingApifyRun}
                        onClick={() => handleRunApifyTest(sample.url, 1)}
                        className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:border-purple-500 hover:text-purple-600 disabled:opacity-60"
                      >
                        Sample: {sample.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Load existing Apify run</p>
                    <div className="grid grid-cols-1 md:grid-cols-[2fr,auto] gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Run ID</label>
                        <input
                          type="text"
                          value={apifyRunIdInput}
                          onChange={(event) => setApifyRunIdInput(event.target.value)}
                          placeholder="5TOhNTdGxG0CxF9Ln"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Posts to preview</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={apifyRunLimit}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isNaN(value)) {
                              setApifyRunLimit(1);
                              return;
                            }
                            setApifyRunLimit(Math.min(Math.max(Math.round(value), 1), 100));
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleFetchApifyRun}
                        disabled={isFetchingApifyRun || isRunningApifyTest}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                      >
                        <FileText className={`h-4 w-4 ${isFetchingApifyRun ? "animate-spin" : ""}`} />
                        {isFetchingApifyRun ? "Loading run..." : "Fetch Apify run"}
                      </button>
                      <p className="text-xs text-gray-500">
                        Paste an Apify run ID to preview its dataset without triggering a new actor execution.
                      </p>
                    </div>
                  </div>

                  {apifyTestError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {apifyTestError}
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    Runs the configured Apify actor (or loads an existing run) to preview the actor input JSON and normalized posts before importing them into the database.
                  </p>

                  {apifyTestResult && (
                    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-700">
                            Runner: {apifyRunnerLabel ?? apifyTestResult.runner}
                          </span>
                          {apifyResultSummary && (
                            <span className="text-xs text-gray-500">{apifyResultSummary}</span>
                          )}
                        </div>
                        <span>
                          Raw items: {apifyRawItemCount} • Normalized posts: {apifyPosts.length}
                        </span>
                      </div>
                      {lastLoadedRunId && (
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <button
                            type="button"
                            onClick={handleImportApifyRun}
                            disabled={isImportingApifyRun || apifyPosts.length === 0}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                          >
                            <Download className={`h-4 w-4 ${isImportingApifyRun ? "animate-spin" : ""}`} />
                            {isImportingApifyRun ? "Importing..." : "Import posts"}
                          </button>
                          <span className="text-xs text-gray-500">
                            Imports posts into the monitor using the above run snapshot.
                          </span>
                        </div>
                      )}

                      {(apifyUsernameInputs.length > 0 || apifyDirectUrls.length > 0) && (
                        <div className="space-y-2 text-xs text-gray-600">
                          {apifyUsernameInputs.length > 0 && (
                            <div>
                              <p className="font-semibold uppercase tracking-wide text-gray-500">Username inputs</p>
                              <div className="flex flex-wrap gap-2">
                                {apifyUsernameInputs.map((value) => (
                                  <span
                                    key={value}
                                    className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 border border-gray-200"
                                  >
                                    {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {apifyDirectUrls.length > 0 && (
                            <div>
                              <p className="font-semibold uppercase tracking-wide text-gray-500">Direct URLs</p>
                              <div className="flex flex-wrap gap-2">
                                {apifyDirectUrls.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full bg-white px-3 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200"
                                  >
                                    {url}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {apifyUniqueUsernames.length > 0 && (
                            <p className="text-xs text-gray-500">
                              Profiles in results: {apifyUniqueUsernames.map((name) => `@${name}`).join(", ")}
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Actor input</p>
                        <pre className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-800">
                          {JSON.stringify(apifyTestResult.input, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          Normalized posts ({apifyPosts.length})
                        </p>
                        {apifyPosts.length > 0 ? (
                          <div className="space-y-4">
                            {apifyPosts.map((post, index) => {
                              const username = post.username ? post.username.replace(/^@/, "") : null;
                              const profileUrl = username ? `https://www.instagram.com/${username}/` : null;
                              const permalink = post.permalink ?? (post.id ? `https://www.instagram.com/p/${post.id}/` : null);
                              return (
                                <article
                                  key={`${post.id}-${username ?? 'unknown'}-${index}`}
                                  className="space-y-3 rounded-md border border-gray-200 bg-white p-3"
                                >
                                  {post.image_url && (
                                    <div className="w-full max-w-sm overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                                      <img
                                        src={post.image_url}
                                        alt={post.caption ?? "Apify post"}
                                        className="w-full object-cover"
                                        onError={(event) => {
                                          const target = event.currentTarget;
                                          target.style.display = "none";
                                        }}
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 text-sm text-gray-700">
                                      {username ? (
                                        <a
                                          href={profileUrl!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-semibold text-blue-600 hover:text-blue-800"
                                        >
                                          @{username}
                                        </a>
                                      ) : (
                                        <span className="font-semibold text-gray-800">Unknown profile</span>
                                      )}
                                      <p className="text-xs text-gray-500">
                                        Collected: {post.timestamp ? formatTimestamp(post.timestamp) : "—"}
                                      </p>
                                    </div>
                                    <span className="text-xs font-mono text-gray-400">#{post.id}</span>
                                  </div>
                                  <p className="whitespace-pre-wrap text-sm text-gray-700">{post.caption || "(no caption)"}</p>
                                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                                    <span>Video: {post.is_video ? "Yes" : "No"}</span>
                                    <div className="flex flex-wrap gap-3">
                                      {permalink && (
                                        <a
                                          href={permalink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800"
                                        >
                                          View post
                                        </a>
                                      )}
                                      {post.image_url && (
                                        <a
                                          href={post.image_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800"
                                        >
                                          Open image
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">Apify did not return any posts for this run.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-600" />
                System Snapshot
              </h2>
              <div className="space-y-2 text-sm text-gray-600">
                <p>Total clubs: {stats?.total_clubs ?? "—"}</p>
                <p>Active clubs: {stats?.active_clubs ?? "—"}</p>
                <p>Pending posts: {stats?.pending_posts ?? "—"}</p>
                <p>Event posts: {stats?.event_posts ?? "—"}</p>
                <p>Processed events: {stats?.processed_events ?? "—"}</p>
                <p>
                  Workflow mode: {systemSettings ? (systemSettings.classification_mode === "auto" ? "AI" : "Manual") : "—"}
                </p>
                <p>Fetch delay: {systemSettings?.club_fetch_delay_seconds ?? "—"} sec</p>
                <p>
                  Instagram session: {systemSettings?.instaloader_username ?? "None"}
                </p>
              </div>
            </section>
          </div>
        )}

        {activeTab === "classify" && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Review Queue</h2>
                <span className="text-sm text-gray-500">{reviewQueue.length} posts</span>
              </div>
              {reviewQueue.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <CheckCircle className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  All caught up—no posts awaiting review.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {reviewQueue.map(({ post, source }) => {
                    const imageUrl = getImageUrl(post);
                    const badgeLabel = source === "ai"
                      ? `AI${post.classification_confidence ? ` · ${Math.round(post.classification_confidence * 100)}%` : ""}`
                      : "Manual";
                    const badgeClasses = source === "ai"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-200 text-slate-700";
                    return (
                      <article key={post.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">
                        {imageUrl ? (
                          <div className="bg-black flex items-center justify-center">
                            <img
                              src={imageUrl}
                              alt={post.caption || 'Instagram post'}
                              className="w-full max-h-80 object-contain cursor-pointer"
                              onClick={() => window.open(imageUrl, '_blank')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class=\"text-red-500 text-sm py-12\">Failed to load image</span>';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="bg-slate-100 h-32 flex items-center justify-center text-xs text-slate-500">
                            No image available
                          </div>
                        )}
                        <div className="p-4 space-y-3 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <a
                                href={`https://instagram.com/${post.club.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {post.club.name}
                              </a>
                              <p className="text-sm text-gray-500">@{post.club.username}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatTimestamp(post.post_timestamp)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${badgeClasses}`}>
                                {badgeLabel}
                              </span>
                              <span className="text-xs text-gray-400">#{post.instagram_id}</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.caption || "(no caption)"}</p>
                          {source === "ai" ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEventModal(post)}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                              >
                                <Zap className="h-4 w-4" />
                                Attach Event JSON
                              </button>
                              <button
                                onClick={() => handleManualClassification(post, false)}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium"
                              >
                                Undo
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleManualClassification(post, true)}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Mark Event
                              </button>
                              <button
                                onClick={() => handleManualClassification(post, false)}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium"
                              >
                                Not Event
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Review Summary</h2>
                <span className="text-xs text-gray-400">Updated {new Date().toLocaleTimeString()}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-semibold text-gray-800">Manual pending</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {reviewQueue.filter((item) => item.source === "manual").length}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-semibold text-gray-800">AI suggestions</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {reviewQueue.filter((item) => item.source === "ai").length}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-semibold text-gray-800">Rejected posts</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {posts.filter((post) => post.is_event_poster === false).length}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-semibold text-gray-800">Ready for export</p>
                  <p className="text-2xl font-bold text-purple-600">{eventPosts.length}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                AI suggestions stay in this queue until you attach event JSON or undo them. Manual posts disappear once
                you classify them.
              </p>
            </section>
          </div>
        )}

        {activeTab === "events" && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                Ready for Extraction
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{eventPosts.length} posts marked as events</span>
                <button
                  onClick={handleExportEvents}
                  disabled={isExportingEvents || eventPosts.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-purple-200 text-sm font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                >
                  <Download className={`h-4 w-4 ${isExportingEvents ? "animate-spin" : ""}`} />
                  {isExportingEvents ? "Exporting..." : "Export events"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {eventPosts.map((post) => (
                <article key={post.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 h-44 flex items-center justify-center text-gray-500 text-sm">
                    {getImageUrl(post) ? (
                      <img
                        src={getImageUrl(post)!}
                        alt={post.caption || 'Instagram post'}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => window.open(getImageUrl(post)!, '_blank')}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-red-500">Failed to load image</span>';
                        }}
                      />
                    ) : (
                      <span>No image available</span>
                    )}
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div>
                      <a
                        href={`https://instagram.com/${post.club.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {post.club.name}
                      </a>
                      <p className="text-gray-500">@{post.club.username}</p>
                    </div>
                    <p className="text-gray-600 max-h-20 overflow-hidden">{post.caption || "(no caption)"}</p>
                    <div className="text-xs text-gray-400">
                      <p>Collected: {formatTimestamp(post.collected_at)}</p>
                      <p>Post time: {formatTimestamp(post.post_timestamp)}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => openEventModal(post)}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Zap className="h-4 w-4" />
                        {post.extracted_event ? "Edit Event JSON" : "Add Event JSON"}
                      </button>
                      <button
                        onClick={() => handleDeletePost(post)}
                        disabled={deletingPostId === post.id}
                        className="w-full bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <Trash2 className={`h-4 w-4 ${deletingPostId === post.id ? "animate-spin" : ""}`} />
                        {deletingPostId === post.id ? "Deleting..." : "Delete post"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {eventPosts.length === 0 && (
                <div className="text-center text-gray-500 py-12 border border-dashed border-gray-200 rounded-lg">
                  No event posts available yet—monitor or classify to add more.
                </div>
              )}
            </div>
          </div>
        )}

        {eventModalPost && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold">Event JSON for {eventModalPost.club.name}</h3>
                  <p className="text-sm text-gray-500">Instagram ID: {eventModalPost.instagram_id}</p>
                </div>
                <button className="text-gray-400 hover:text-gray-600" onClick={closeEventModal}>
                  ×
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-gray-600">
                    {systemSettings?.has_gemini_api_key
                      ? "Let Gemini read the poster and pre-fill the JSON template."
                      : "Add your Gemini API key on the Setup tab to enable automated extraction."}
                  </p>
                  <button
                    onClick={handleExtractEvent}
                    disabled={isExtractingEvent || !systemSettings?.has_gemini_api_key}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-300"
                  >
                    {isExtractingEvent ? (
                      <>
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Extract with Gemini
                      </>
                    )}
                  </button>
                </div>
                {extractEventError && <p className="text-sm text-red-600">{extractEventError}</p>}
                <textarea
                  className="w-full h-64 border border-gray-300 rounded-lg p-3 font-mono text-sm"
                  placeholder="Paste extracted event JSON here"
                  value={eventJson}
                  onChange={(e) => {
                    setEventJson(e.target.value);
                    setEventJsonError(null);
                  }}
                />
                {eventJsonError && <p className="text-sm text-red-600">{eventJsonError}</p>}
              </div>
              <div className="flex justify-end gap-3 border-t px-6 py-4">
                <button className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700" onClick={closeEventModal}>
                  Cancel
                </button>
                <button
                  onClick={handleSaveEventJson}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-md"
                >
                  Save Event JSON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
