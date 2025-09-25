import {
  AlertCircle,
  Database,
  Download,
  FileText,
  Monitor,
  Pause,
  Play,
  RefreshCcw,
  Settings,
} from "lucide-react";

import { APIFY_RUNNER_LABELS, FETCHER_LABELS, APIFY_SAMPLE_ACCOUNTS } from "../constants";
import { describeMinutes, formatTimestamp } from "../utils/format";
import type {
  ApifyTestResult,
  MonitorStatus,
  StatsSnapshot,
  SystemSettings,
} from "../types";

interface MonitorSectionProps {
  status: MonitorStatus | null;
  stats: StatsSnapshot | null;
  systemSettings: SystemSettings | null;
  isFetchingPosts: boolean;
  fetchingPostCount: number | null;
  fetchProgress: string | null;
  apifyTestUrl: string;
  apifyTestLimit: number;
  apifyTestResult: ApifyTestResult | null;
  apifyTestError: string | null;
  apifyRunnerLabel: string | null;
  apifyRawItemCount: number;
  apifyUniqueUsernames: string[];
  apifyDirectUrls: string[];
  isRunningApifyTest: boolean;
  isFetchingApifyRun: boolean;
  isImportingApifyRun: boolean;
  lastLoadedRunId: string | null;
  apifyResultSummary: string | null;
  apifyRunIdInput: string;
  apifyRunLimit: number;
  onMonitorToggle: () => void;
  onMonitorIntervalChange: (value: number) => void;
  onFetchLatestPosts: (count: number) => void;
  onRunApifyTest: (url?: string, limit?: number) => void;
  onApifyTestUrlChange: (value: string) => void;
  onApifyTestLimitChange: (value: number) => void;
  onApifyRunIdChange: (value: string) => void;
  onApifyRunLimitChange: (value: number) => void;
  onFetchApifyRun: () => void;
  onImportApifyRun: () => void;
}

export const MonitorSection = ({
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
  onMonitorToggle,
  onMonitorIntervalChange,
  onFetchLatestPosts,
  onRunApifyTest,
  onApifyTestUrlChange,
  onApifyTestLimitChange,
  onApifyRunIdChange,
  onApifyRunLimitChange,
  onFetchApifyRun,
  onImportApifyRun,
}: MonitorSectionProps) => {
  const monitorEnabled = Boolean(status?.monitoring_enabled);
  const MonitorButtonIcon = monitorEnabled ? Pause : Play;
  const monitorButtonLabel = monitorEnabled ? "Pause Monitor" : "Start Monitor";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <section className="xl:col-span-2 bg-white rounded-xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Monitoring Status</h2>
          <button
            onClick={onMonitorToggle}
            className={`px-5 py-2 rounded-lg font-semibold flex items-center gap-2 text-white ${
              monitorEnabled ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            <MonitorButtonIcon className="h-4 w-4" />
            {monitorButtonLabel}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-900">Monitor State</p>
            <p className="text-lg font-semibold text-blue-700 mt-1">{monitorEnabled ? "Running" : "Stopped"}</p>
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
              Apify token: {systemSettings?.has_apify_token ? "Saved" : "Missing"}
            </p>
            <p className="text-xs text-blue-500 mt-1">Apify runner: {status ? APIFY_RUNNER_LABELS[status.apify_runner] : "—"}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-900">Last Run</p>
            <p className="text-lg font-semibold text-purple-700 mt-1">{formatTimestamp(status?.last_run ?? null)}</p>
            <p className="text-xs text-purple-500 mt-2">Next run ETA: {status?.next_run_eta_seconds ?? "—"} sec</p>
            <p className="text-xs text-purple-500 mt-1">
              Rate limit: {status?.is_rate_limited ? `Blocked until ${formatTimestamp(status?.rate_limit_until ?? null)}` : "None"}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-900">Stats</p>
            <p className="text-lg font-semibold text-green-700 mt-1">{stats?.event_posts ?? 0} events</p>
            <p className="text-xs text-green-500 mt-2">Pending posts: {stats?.pending_posts ?? 0}</p>
            <p className="text-xs text-green-500 mt-1">Processed events: {stats?.processed_events ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Monitor className="h-4 w-4 text-purple-600" />
              Monitor Controls
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700">Interval (minutes)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={systemSettings?.monitor_interval_minutes ?? 45}
                onChange={(event) => onMonitorIntervalChange(Math.max(1, Number(event.target.value) || 1))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onFetchLatestPosts(3)}
                disabled={isFetchingPosts}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <RefreshCcw className={`h-4 w-4 ${isFetchingPosts && fetchingPostCount === 3 ? "animate-spin" : ""}`} />
                {isFetchingPosts && fetchingPostCount === 3 ? "Fetching..." : "Fetch Latest 3 Posts"}
              </button>
              <button
                onClick={() => onFetchLatestPosts(5)}
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
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-600" />
              Monitor Summary
            </h3>
            <p className="text-sm text-gray-600">Workflow: {systemSettings ? (systemSettings.classification_mode === "auto" ? "AI" : "Manual") : "—"}</p>
            <p className="text-sm text-gray-600">Fetch delay: {describeMinutes(systemSettings?.club_fetch_delay_seconds ?? null)}</p>
            <p className="text-sm text-gray-600">
              Scraper mode: {systemSettings ? FETCHER_LABELS[systemSettings.instagram_fetcher] : "—"}
            </p>
            <p className="text-sm text-gray-600">Gemini auto extract: {systemSettings?.gemini_auto_extract ? "Enabled" : "Disabled"}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        <h3 className="text-lg font-semibold">Apify Test Runner</h3>

        <div className="grid grid-cols-1 md:grid-cols-[2fr,auto] gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Instagram URL or username</label>
            <input
              type="text"
              value={apifyTestUrl}
              onChange={(event) => onApifyTestUrlChange(event.target.value)}
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
              onChange={(event) => onApifyTestLimitChange(Math.min(Math.max(Number(event.target.value) || 1, 1), 100))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onRunApifyTest()}
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
              onClick={() => onRunApifyTest(sample.url, 1)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:border-purple-500 hover:text-purple-600 disabled:opacity-60"
            >
              Sample: {sample.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Load existing Apify run</p>
          <div className="grid grid-cols-1 md:grid-cols-[2fr,auto] gap-3">
            <input
              type="text"
              value={apifyRunIdInput}
              onChange={(event) => onApifyRunIdChange(event.target.value)}
              placeholder="apify-run-id"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={apifyRunLimit}
              onChange={(event) => onApifyRunLimitChange(Math.min(Math.max(Number(event.target.value) || 1, 1), 100))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onFetchApifyRun}
              disabled={isFetchingApifyRun || isRunningApifyTest}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:border-purple-500 hover:text-purple-600 disabled:opacity-60 flex items-center gap-2"
            >
              <FileText className={`h-4 w-4 ${isFetchingApifyRun ? "animate-spin" : ""}`} />
              {isFetchingApifyRun ? "Loading run..." : "Fetch Apify run"}
            </button>
            <button
              onClick={onImportApifyRun}
              disabled={isImportingApifyRun || !apifyTestResult}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:bg-green-400 flex items-center gap-2"
            >
              <Download className={`h-4 w-4 ${isImportingApifyRun ? "animate-spin" : ""}`} />
              {isImportingApifyRun ? "Importing..." : "Import posts"}
            </button>
          </div>
          {apifyResultSummary && <p className="text-xs text-gray-500">{apifyResultSummary}</p>}
          {apifyTestError && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{apifyTestError}</span>
            </div>
          )}
        </div>

        {apifyTestResult && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                Runner: {apifyRunnerLabel ?? "—"} · Raw items: {apifyRawItemCount} · Unique usernames: {apifyUniqueUsernames.length}
              </p>
              {lastLoadedRunId && (
                <span className="text-xs text-gray-500">Loaded run: {lastLoadedRunId}</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="font-semibold text-gray-700">Usernames</p>
                <ul className="mt-2 space-y-1">
                  {apifyUniqueUsernames.map((username) => (
                    <li key={username}>@{username}</li>
                  ))}
                  {apifyUniqueUsernames.length === 0 && <li className="text-gray-500">No usernames returned.</li>}
                </ul>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="font-semibold text-gray-700">Instagram URLs</p>
                <ul className="mt-2 space-y-1 break-all">
                  {apifyDirectUrls.map((url) => (
                    <li key={url}>{url}</li>
                  ))}
                  {apifyDirectUrls.length === 0 && <li className="text-gray-500">No direct URLs provided.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
