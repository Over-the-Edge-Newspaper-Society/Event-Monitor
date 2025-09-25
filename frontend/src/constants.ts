import type { ApifyRunnerMode, FetcherMode } from "./types";
import { CheckCircle, Image as ImageIcon, Monitor, Settings } from "lucide-react";
import type { TabsConfig } from "./types";

export const FETCHER_LABELS: Record<FetcherMode, string> = {
  instaloader: "Instaloader only",
  apify: "Apify only",
};

export const APIFY_RUNNER_LABELS: Record<ApifyRunnerMode, string> = {
  disabled: "Disabled",
  unconfigured: "Missing token",
  rest: "REST polling",
  rest_fallback: "REST (Node unavailable)",
  node: "Node SDK",
};

export const APIFY_SAMPLE_ACCOUNTS = [
  { label: "humansofny", url: "https://www.instagram.com/humansofny/" },
  { label: "unbcpion", url: "https://www.instagram.com/unbcpion/" },
] as const;

export const DASHBOARD_TABS: TabsConfig[] = [
  { id: "setup", label: "Setup", icon: Settings },
  { id: "monitor", label: "Monitor", icon: Monitor },
  { id: "classify", label: "Classify", icon: ImageIcon },
  { id: "events", label: "Events", icon: CheckCircle },
];
