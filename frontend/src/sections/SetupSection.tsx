import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Database, Sparkles, Upload, RefreshCcw, Settings } from "lucide-react";

import type { Club, FetcherMode, StatsSnapshot, SystemSettings } from "../types";
import { FETCHER_LABELS } from "../constants";
import { describeMinutes, formatTimestamp } from "../utils/format";

type VoidOrPromise = void | Promise<void>;

interface SetupSectionProps {
  clubs: Club[];
  stats: StatsSnapshot | null;
  systemSettings: SystemSettings | null;
  sessionUsernameInput: string;
  sessionCookieInput: string;
  clubDelayInput: number;
  apifyEnabledInput: boolean;
  apifyResultsLimitInput: number;
  apifyTokenInput: string;
  geminiApiKeyInput: string;
  geminiAutoExtractEnabled: boolean;
  apifyFetcherMode: SystemSettings["instagram_fetcher"];
  fetchingClubId: number | null;
  isUploadingSession: boolean;
  isRemovingSession: boolean;
  isSavingDelay: boolean;
  isSavingApifySettings: boolean;
  isSavingApifyToken: boolean;
  isClearingApifyToken: boolean;
  isSavingGeminiKey: boolean;
  isClearingGeminiKey: boolean;
  isSavingGeminiSettings: boolean;
  isDownloadingBackup: boolean;
  isRestoringBackup: boolean;
  isUpdatingWorkflow: boolean;
  sessionFileKey: string;
  onCSVUpload: (event: ChangeEvent<HTMLInputElement>) => VoidOrPromise;
  onToggleActive: (club: Club) => VoidOrPromise;
  onToggleMode: (club: Club) => VoidOrPromise;
  onFetchLatestForClub: (club: Club, count: number) => VoidOrPromise;
  onSessionUsernameChange: (value: string) => void;
  onSessionFileChange: (event: ChangeEvent<HTMLInputElement>) => VoidOrPromise;
  onRemoveSession: () => VoidOrPromise;
  onSessionCookieChange: (value: string) => void;
  onUploadSessionCookie: () => VoidOrPromise;
  onClubDelayChange: (value: number) => void;
  onSaveDelay: () => VoidOrPromise;
  onFetcherModeChange: (mode: FetcherMode) => void;
  onApifyEnabledChange: (value: boolean) => void;
  onApifyResultsLimitChange: (value: number) => void;
  onSaveApifySettings: () => VoidOrPromise;
  onApifyTokenChange: (value: string) => void;
  onSaveApifyToken: () => VoidOrPromise;
  onClearApifyToken: () => VoidOrPromise;
  onGeminiKeyChange: (value: string) => void;
  onSaveGeminiKey: () => VoidOrPromise;
  onClearGeminiKey: () => VoidOrPromise;
  onGeminiAutoExtractChange: (value: boolean) => void;
  onSaveGeminiSettings: () => VoidOrPromise;
  onToggleWorkflowMode: () => VoidOrPromise;
  onDownloadBackup: () => VoidOrPromise;
  onRestoreBackup: (file: File) => VoidOrPromise;
  backupFileInputKey: string;
}

export const SetupSection = ({
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
  onCSVUpload,
  onToggleActive,
  onToggleMode,
  onFetchLatestForClub,
  onSessionUsernameChange,
  onSessionFileChange,
  onRemoveSession,
  onSessionCookieChange,
  onUploadSessionCookie,
  onClubDelayChange,
  onSaveDelay,
  onFetcherModeChange,
  onApifyEnabledChange,
  onApifyResultsLimitChange,
  onSaveApifySettings,
  onApifyTokenChange,
  onSaveApifyToken,
  onClearApifyToken,
  onGeminiKeyChange,
  onSaveGeminiKey,
  onClearGeminiKey,
  onGeminiAutoExtractChange,
  onSaveGeminiSettings,
  onToggleWorkflowMode,
  onDownloadBackup,
  onRestoreBackup,
  backupFileInputKey,
}: SetupSectionProps) => (
  <SetupSectionContent
    clubs={clubs}
    stats={stats}
    systemSettings={systemSettings}
    sessionUsernameInput={sessionUsernameInput}
    sessionCookieInput={sessionCookieInput}
    clubDelayInput={clubDelayInput}
    apifyEnabledInput={apifyEnabledInput}
    apifyResultsLimitInput={apifyResultsLimitInput}
    apifyTokenInput={apifyTokenInput}
    geminiApiKeyInput={geminiApiKeyInput}
    geminiAutoExtractEnabled={geminiAutoExtractEnabled}
    apifyFetcherMode={apifyFetcherMode}
    fetchingClubId={fetchingClubId}
    isUploadingSession={isUploadingSession}
    isRemovingSession={isRemovingSession}
    isSavingDelay={isSavingDelay}
    isSavingApifySettings={isSavingApifySettings}
    isSavingApifyToken={isSavingApifyToken}
    isClearingApifyToken={isClearingApifyToken}
    isSavingGeminiKey={isSavingGeminiKey}
    isClearingGeminiKey={isClearingGeminiKey}
    isSavingGeminiSettings={isSavingGeminiSettings}
    isDownloadingBackup={isDownloadingBackup}
    isRestoringBackup={isRestoringBackup}
    isUpdatingWorkflow={isUpdatingWorkflow}
    sessionFileKey={sessionFileKey}
    onCSVUpload={onCSVUpload}
    onToggleActive={onToggleActive}
    onToggleMode={onToggleMode}
    onFetchLatestForClub={onFetchLatestForClub}
    onSessionUsernameChange={onSessionUsernameChange}
    onSessionFileChange={onSessionFileChange}
    onRemoveSession={onRemoveSession}
    onSessionCookieChange={onSessionCookieChange}
    onUploadSessionCookie={onUploadSessionCookie}
    onClubDelayChange={onClubDelayChange}
    onSaveDelay={onSaveDelay}
    onFetcherModeChange={onFetcherModeChange}
    onApifyEnabledChange={onApifyEnabledChange}
    onApifyResultsLimitChange={onApifyResultsLimitChange}
    onSaveApifySettings={onSaveApifySettings}
    onApifyTokenChange={onApifyTokenChange}
    onSaveApifyToken={onSaveApifyToken}
    onClearApifyToken={onClearApifyToken}
    onGeminiKeyChange={onGeminiKeyChange}
    onSaveGeminiKey={onSaveGeminiKey}
    onClearGeminiKey={onClearGeminiKey}
    onGeminiAutoExtractChange={onGeminiAutoExtractChange}
    onSaveGeminiSettings={onSaveGeminiSettings}
    onToggleWorkflowMode={onToggleWorkflowMode}
    onDownloadBackup={onDownloadBackup}
    onRestoreBackup={onRestoreBackup}
    backupFileInputKey={backupFileInputKey}
  />
);

type SetupSectionContentProps = SetupSectionProps;

const SetupSectionContent = ({
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
  onCSVUpload,
  onToggleActive,
  onToggleMode,
  onFetchLatestForClub,
  onSessionUsernameChange,
  onSessionFileChange,
  onRemoveSession,
  onSessionCookieChange,
  onUploadSessionCookie,
  onClubDelayChange,
  onSaveDelay,
  onFetcherModeChange,
  onApifyEnabledChange,
  onApifyResultsLimitChange,
  onSaveApifySettings,
  onApifyTokenChange,
  onSaveApifyToken,
  onClearApifyToken,
  onGeminiKeyChange,
  onSaveGeminiKey,
  onClearGeminiKey,
  onGeminiAutoExtractChange,
  onSaveGeminiSettings,
  onToggleWorkflowMode,
  onDownloadBackup,
  onRestoreBackup,
  backupFileInputKey,
}: SetupSectionContentProps) => {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [clubFilter, setClubFilter] = useState<"active" | "inactive" | "all">("active");

  const filterCounts = useMemo(() => {
    const activeCount = clubs.filter((club) => club.active).length;
    const inactiveCount = clubs.length - activeCount;
    return {
      active: activeCount,
      inactive: inactiveCount,
      all: clubs.length,
    } as const;
  }, [clubs]);

  const filteredClubs = useMemo(() => {
    if (clubFilter === "active") {
      return clubs.filter((club) => club.active);
    }
    if (clubFilter === "inactive") {
      return clubs.filter((club) => !club.active);
    }
    return clubs;
  }, [clubs, clubFilter]);

  const emptyStateMessage = useMemo(() => {
    if (clubs.length === 0) {
      return "Upload a CSV to start tracking clubs.";
    }
    if (clubFilter === "active") {
      return "No active clubs. Toggle some on or switch the filter.";
    }
    if (clubFilter === "inactive") {
      return "No inactive clubs right now.";
    }
    return "No clubs match this filter.";
  }, [clubs, clubFilter]);

  const handleBackupFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      onRestoreBackup(selected);
    }
    event.target.value = "";
  };

  return (
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
        <input type="file" accept=".csv" className="hidden" onChange={onCSVUpload} />
      </label>
    </section>

    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Tracked Clubs</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">
            {stats ? `${stats.active_clubs}/${stats.total_clubs} active` : "—"}
          </span>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs font-medium text-gray-600 bg-gray-50">
            {([
              { id: "active" as const, label: "Active" },
              { id: "inactive" as const, label: "Inactive" },
              { id: "all" as const, label: "All" },
            ]).map((option) => {
              const isSelected = clubFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setClubFilter(option.id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    isSelected
                      ? "bg-white text-purple-600 shadow"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {option.label}
                  <span className="ml-1 text-[11px] text-gray-400">
                    {filterCounts[option.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {filteredClubs.map((club) => (
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
              <p className="text-xs text-gray-400 mt-1">Last checked: {formatTimestamp(club.last_checked)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => onToggleActive(club)}
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
                  club.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {club.active ? "Active" : "Inactive"}
              </button>
              <button
                onClick={() => onToggleMode(club)}
                className="text-xs text-purple-600 hover:text-purple-800"
              >
                Mode: {club.classification_mode.toUpperCase()}
              </button>
              <button
                onClick={() => onFetchLatestForClub(club, 1)}
                disabled={fetchingClubId === club.id}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-60"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${fetchingClubId === club.id ? "animate-spin" : ""}`} />
                {fetchingClubId === club.id ? "Fetching..." : "Fetch 1 post"}
              </button>
            </div>
          </div>
        ))}
        {filteredClubs.length === 0 && (
          <p className="text-sm text-gray-500">{emptyStateMessage}</p>
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
          onChange={(event) => onGeminiKeyChange(event.target.value)}
          placeholder="AI... (from Google AI Studio)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onSaveGeminiKey}
            disabled={isSavingGeminiKey}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
          >
            {isSavingGeminiKey ? "Saving..." : "Save key"}
          </button>
          <button
            onClick={onClearGeminiKey}
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
              onChange={(event) => onGeminiAutoExtractChange(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            Auto extract new event posts with Gemini
          </label>
          <button
            onClick={onSaveGeminiSettings}
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
        and upload the resulting <code>.session</code> file so the monitor can look like a real logged-in user.
      </p>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Instagram username</label>
        <input
          type="text"
          value={sessionUsernameInput}
          onChange={(event) => onSessionUsernameChange(event.target.value)}
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
              onChange={onSessionFileChange}
              disabled={isUploadingSession}
            />
          </label>
          <button
            onClick={onRemoveSession}
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
            onChange={(event) => onSessionCookieChange(event.target.value)}
            placeholder="sessionid=...; csrftoken=...; ds_user_id=..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2">
          <button
            onClick={onUploadSessionCookie}
            disabled={isUploadingSession}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:bg-blue-400"
          >
            {isUploadingSession ? "Uploading..." : "Upload cookie"}
          </button>
          <span className="text-xs text-gray-500">
            Paste cookies exported from your browser (Chrome extension: Get cookies.txt).
          </span>
        </div>
      </div>
    </section>

    <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-600" />
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
          onClick={onToggleWorkflowMode}
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
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <label className="block text-sm font-medium text-gray-700">Fetch delay between clubs</label>
        <input
          type="number"
          min={0}
          value={clubDelayInput}
          onChange={(event) => onClubDelayChange(Number(event.target.value) || 0)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onSaveDelay}
            disabled={isSavingDelay}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
          >
            {isSavingDelay ? "Saving..." : "Save delay"}
          </button>
          <span className="text-xs text-gray-500">
            Current delay: {describeMinutes(systemSettings?.club_fetch_delay_seconds ?? null)}
          </span>
        </div>
      </div>
    </section>

    <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-purple-600" />
          Apify Integration
        </h2>
        <span className="text-xs text-gray-500">{systemSettings?.apify_enabled ? "Enabled" : "Disabled"}</span>
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
            onChange={(event) => onFetcherModeChange(event.target.value as FetcherMode)}
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
          >
            {Object.entries(FETCHER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Auto keeps Instaloader as primary; Apify is used only when needed.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={apifyEnabledInput}
            onChange={(event) => onApifyEnabledChange(event.target.checked)}
            disabled={apifyFetcherMode === "apify"}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-60"
          />
          Enable Apify fallback (used in auto mode)
        </label>
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
                onApifyResultsLimitChange(Math.min(Math.max(1, Math.round(value)), 1000));
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          <p className="text-xs text-gray-500 mt-1">How many posts to request from Apify when invoked.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onSaveApifySettings}
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
            onChange={(event) => onApifyTokenChange(event.target.value)}
            placeholder="apify_api_... (from Personal API tokens)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSaveApifyToken}
              disabled={isSavingApifyToken}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:bg-green-400"
            >
              {isSavingApifyToken ? "Saving token..." : "Save token"}
            </button>
            <button
              onClick={onClearApifyToken}
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
          Backup & Transfer
        </h2>
      </div>
      <p className="text-sm text-gray-600">
        Download a portable archive containing the SQLite database and cached Instagram images, or restore one to
        migrate the monitor to another machine.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onDownloadBackup}
          disabled={isDownloadingBackup}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-400"
        >
          {isDownloadingBackup ? "Preparing archive..." : "Download backup zip"}
        </button>
        <button
          onClick={() => backupInputRef.current?.click()}
          disabled={isRestoringBackup}
          className="px-4 py-2 rounded-lg border border-purple-200 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:border-gray-200 disabled:text-gray-400"
        >
          {isRestoringBackup ? "Restoring..." : "Restore from backup zip"}
        </button>
        <input
          key={backupFileInputKey}
          ref={backupInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleBackupFileChange}
        />
        <span className="text-xs text-gray-500">
          Includes `instagram_monitor.db` and all files under `static/images/`.
        </span>
      </div>
    </section>
  </div>
);
};
