import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { API_BASE } from "./config";
import type {
  ApifyImportStats,
  ApifyRunnerMode,
  ApifyTestPost,
  ApifyTestResult,
  Club,
  ClubFetchLatestResponse,
  FetcherMode,
  MonitorStatus,
  PostRecord,
  StatsSnapshot,
  SystemSettings,
  TabId,
} from "./types";

import { APIFY_RUNNER_LABELS, DASHBOARD_TABS } from "./constants";
import { AlertBanner } from "./components/AlertBanner";
import { TabNavigation } from "./components/TabNavigation";
import { EventModal } from "./components/EventModal";
import { SetupSection } from "./sections/SetupSection";
import { MonitorSection } from "./sections/MonitorSection";
import { ClassifySection } from "./sections/ClassifySection";
import { EventsSection } from "./sections/EventsSection";

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
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [backupFileInputKey, setBackupFileInputKey] = useState(() => Date.now().toString());
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

  const handleUploadSessionCookie = async () => {
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

  const handleDownloadBackup = async () => {
    try {
      setIsDownloadingBackup(true);
      const response = await fetch(`${API_BASE}/export/full`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to prepare backup archive");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "event-monitor-backup.zip";
      if (contentDisposition) {
        const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
        const rawName = match?.[1] ?? match?.[2];
        if (rawName) {
          try {
            filename = decodeURIComponent(rawName);
          } catch {
            filename = rawName;
          }
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showSuccess("Backup archive downloaded.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleRestoreBackup = async (file: File) => {
    try {
      setIsRestoringBackup(true);
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${API_BASE}/import/full`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to import backup archive");
      }
      await refreshAll();
      showSuccess("Backup restored. Data refreshed.");
    } catch (err) {
      handleApiError((err as Error).message);
    } finally {
      setIsRestoringBackup(false);
      setBackupFileInputKey(Date.now().toString());
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

  const handleMonitorIntervalChange = async (value: number) => {
    const normalized = Math.max(1, Math.round(value));
    const previousInterval = systemSettings?.monitor_interval_minutes ?? null;
    setSystemSettings((prev) =>
      prev ? { ...prev, monitor_interval_minutes: normalized } : prev
    );
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitor_interval_minutes: normalized }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to update monitor interval");
      }
      const data: SystemSettings = await response.json();
      setSystemSettings(data);
      await fetchStatus();
      showSuccess(
        `Monitor interval set to ${normalized} minute${normalized === 1 ? "" : "s"}.`
      );
    } catch (err) {
      if (previousInterval !== null) {
        setSystemSettings((prev) =>
          prev ? { ...prev, monitor_interval_minutes: previousInterval } : prev
        );
      }
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
    return <AlertBanner message={error ?? successMessage ?? ""} variant={error ? "error" : "success"} />;
  };

  const apifyPosts = apifyTestResult?.posts ?? [];
  const apifyDirectUrls = Array.isArray(apifyTestResult?.input?.directUrls)
    ? (apifyTestResult?.input?.directUrls as string[])
    : [];
  const apifyRunnerLabel =
    apifyTestResult ? APIFY_RUNNER_LABELS[apifyTestResult.runner] ?? apifyTestResult.runner : null;
  const apifyRawItemCount = apifyTestResult?.items?.length ?? 0;
  const apifyUniqueUsernames = Array.from(
    new Set(apifyPosts.map((post) => (post.username ? post.username.replace(/^@/, "") : null)).filter(Boolean))
  ) as string[];

  const setupSectionProps = {
    clubs,
    stats,
    systemSettings,
    sessionUsernameInput,
    sessionCookieInput,
    clubDelayInput,
    apifyEnabledInput,
    apifyResultsLimitInput,
    apifyTokenInput,
    geminiApiKeyInput,
    geminiAutoExtractEnabled,
    apifyFetcherMode,
    fetchingClubId,
    isUploadingSession,
    isRemovingSession,
    isSavingDelay,
    isSavingApifySettings,
    isSavingApifyToken,
    isClearingApifyToken,
    isSavingGeminiKey,
    isClearingGeminiKey,
    isSavingGeminiSettings,
    isDownloadingBackup,
    isRestoringBackup,
    isUpdatingWorkflow,
    sessionFileKey,
    onCSVUpload: handleCSVUpload,
    onToggleActive: handleToggleActive,
    onToggleMode: handleToggleMode,
    onFetchLatestForClub: handleFetchLatestForClub,
    onSessionUsernameChange: setSessionUsernameInput,
    onSessionFileChange: handleSessionFileChange,
    onRemoveSession: handleRemoveSession,
    onSessionCookieChange: setSessionCookieInput,
    onUploadSessionCookie: handleUploadSessionCookie,
    onClubDelayChange: setClubDelayInput,
    onSaveDelay: handleSaveDelay,
    onFetcherModeChange: setApifyFetcherMode,
    onApifyEnabledChange: setApifyEnabledInput,
    onApifyResultsLimitChange: setApifyResultsLimitInput,
    onSaveApifySettings: handleSaveApifySettings,
    onApifyTokenChange: setApifyTokenInput,
    onSaveApifyToken: handleSaveApifyToken,
    onClearApifyToken: handleClearApifyToken,
    onGeminiKeyChange: setGeminiApiKeyInput,
    onSaveGeminiKey: handleSaveGeminiKey,
    onClearGeminiKey: handleClearGeminiKey,
    onGeminiAutoExtractChange: setGeminiAutoExtractEnabled,
    onSaveGeminiSettings: handleSaveGeminiSettings,
    onToggleWorkflowMode: handleToggleWorkflowMode,
    onDownloadBackup: handleDownloadBackup,
    onRestoreBackup: handleRestoreBackup,
    backupFileInputKey,
  } as const;

  const monitorSectionProps = {
    status,
    stats,
    systemSettings,
    isFetchingPosts,
    fetchingPostCount,
    fetchProgress,
    apifyTestUrl,
    apifyTestLimit,
    apifyTestResult,
    apifyTestError,
    apifyRunnerLabel,
    apifyRawItemCount,
    apifyUniqueUsernames,
    apifyDirectUrls,
    isRunningApifyTest,
    isFetchingApifyRun,
    isImportingApifyRun,
    lastLoadedRunId,
    apifyResultSummary,
    apifyRunIdInput,
    apifyRunLimit,
    onMonitorToggle: handleMonitorToggle,
    onMonitorIntervalChange: handleMonitorIntervalChange,
    onFetchLatestPosts: handleFetchLatestPosts,
    onRunApifyTest: handleRunApifyTest,
    onApifyTestUrlChange: setApifyTestUrl,
    onApifyTestLimitChange: setApifyTestLimit,
    onApifyRunIdChange: setApifyRunIdInput,
    onApifyRunLimitChange: setApifyRunLimit,
    onFetchApifyRun: handleFetchApifyRun,
    onImportApifyRun: handleImportApifyRun,
  } as const;

  const classifySectionProps = {
    reviewQueue,
    eventPosts,
    deletingPostId,
    onManualClassification: handleManualClassification,
    onOpenEventModal: openEventModal,
    onDeletePost: handleDeletePost,
  } as const;

  const eventsSectionProps = {
    eventPosts,
    deletingPostId,
    isExporting: isExportingEvents,
    onExportEvents: handleExportEvents,
    onOpenEventModal: openEventModal,
    onDeletePost: handleDeletePost,
  } as const;

  const eventModalProps = eventModalPost
    ? {
        post: eventModalPost,
        eventJson,
        eventJsonError,
        extractEventError,
        isExtracting: isExtractingEvent,
        hasGemini: Boolean(systemSettings?.has_gemini_api_key),
        onClose: closeEventModal,
        onJsonChange: (value: string) => {
          setEventJson(value);
          setEventJsonError(null);
        },
        onExtract: handleExtractEvent,
        onSave: handleSaveEventJson,
      }
    : null;

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
            <TabNavigation
              tabs={DASHBOARD_TABS}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as TabId)}
              refreshButton={{
                onClick: refreshAll,
                disabled: isRefreshing,
                content: (
                  <>
                    <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </>
                ),
              }}
            />
          </div>
        </header>

        {renderAlert()}

        {activeTab === "setup" && (
          <SetupSection {...setupSectionProps} />
        )}

        {activeTab === "monitor" && (
          <MonitorSection {...monitorSectionProps} />
        )}

        {activeTab === "classify" && (
          <ClassifySection {...classifySectionProps} />
        )}

        {activeTab === "events" && (
          <EventsSection {...eventsSectionProps} />
        )}

        {eventModalProps && (
          <EventModal {...eventModalProps} />
        )}
      </div>
    </div>
  );
};

export default App;
