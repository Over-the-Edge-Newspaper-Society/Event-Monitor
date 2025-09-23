import { CheckCircle, FileText, Zap, Trash2 } from "lucide-react";

import type { PostRecord } from "../types";
import { formatTimestamp } from "../utils/format";
import { getPostImageUrl } from "../utils/image";

const parseEventPayload = (payload: unknown): Record<string, unknown> | null => {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch (error) {
      console.warn("Failed to parse event JSON payload", error);
      return null;
    }
  }
  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  return null;
};

const getEventSummary = (
  payload: Record<string, unknown> | null,
): {
  title: string | null;
  startDate: string | null;
  startTime: string | null;
  venueName: string | null;
} | null => {
  if (!payload) {
    return null;
  }

  const eventsRaw = (payload as { events?: unknown }).events;
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];
  const firstEvent = events.find((event) => event && typeof event === "object") as
    | Record<string, unknown>
    | undefined;

  if (!firstEvent) {
    return null;
  }

  const venueRaw = (firstEvent as { venue?: unknown }).venue;
  const venue = typeof venueRaw === "object" && venueRaw !== null
    ? (venueRaw as Record<string, unknown>)
    : null;

  const venueNameRaw = venue ? (venue as { name?: unknown }).name : null;

  const titleRaw = (firstEvent as { title?: unknown }).title;
  const startDateRaw = (firstEvent as { startDate?: unknown }).startDate;
  const startTimeRaw = (firstEvent as { startTime?: unknown }).startTime;

  const title = typeof titleRaw === "string" ? titleRaw : null;
  const startDate = typeof startDateRaw === "string" ? startDateRaw : null;
  const startTime = typeof startTimeRaw === "string" ? startTimeRaw : null;
  const venueName = typeof venueNameRaw === "string" ? venueNameRaw : null;

  if (!title && !startDate && !startTime && !venueName) {
    return null;
  }

  return {
    title,
    startDate,
    startTime,
    venueName,
  };
};

const formatEventStart = (startDate: string | null, startTime: string | null): string | null => {
  if (!startDate) {
    return null;
  }

  const trimmedDate = startDate.trim();
  const trimmedTime = startTime?.trim();

  if (!trimmedTime) {
    const formatted = formatTimestamp(trimmedDate);
    return formatted !== trimmedDate ? formatted : trimmedDate;
  }

  const isoCandidate = trimmedDate.includes("T") ? trimmedDate : `${trimmedDate}T${trimmedTime}`;
  const formatted = formatTimestamp(isoCandidate);
  const fallback = `${trimmedDate} ${trimmedTime}`.trim();
  return formatted !== isoCandidate ? formatted : fallback;
};

interface ReviewQueueItem {
  post: PostRecord;
  source: "ai" | "manual";
}

type VoidOrPromise = void | Promise<void>;

interface ClassifySectionProps {
  reviewQueue: ReviewQueueItem[];
  eventPosts: PostRecord[];
  deletingPostId: number | null;
  onManualClassification: (post: PostRecord, isEvent: boolean) => VoidOrPromise;
  onOpenEventModal: (post: PostRecord) => VoidOrPromise;
  onDeletePost: (post: PostRecord) => VoidOrPromise;
}

export const ClassifySection = ({
  reviewQueue,
  eventPosts,
  deletingPostId,
  onManualClassification,
  onOpenEventModal,
  onDeletePost,
}: ClassifySectionProps) => (
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
            const imageUrl = getPostImageUrl(post);
            const badgeLabel = source === "ai"
              ? `AI${post.classification_confidence ? ` · ${Math.round(post.classification_confidence * 100)}%` : ""}`
              : "Manual";
            const badgeClasses = source === "ai" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700";
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
                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-red-500 text-sm py-12">Failed to load image</span>';
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
                        onClick={() => onOpenEventModal(post)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Zap className="h-4 w-4" />
                        Attach Event JSON
                      </button>
                      <button
                        onClick={() => onManualClassification(post, false)}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onManualClassification(post, true)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Mark Event
                      </button>
                      <button
                        onClick={() => onManualClassification(post, false)}
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
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-600" />
          Ready for Extraction
        </h2>
        <span className="text-sm text-gray-500">{eventPosts.length} posts marked as events</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {eventPosts.map((post) => {
          const imageUrl = getPostImageUrl(post);
          const eventPayload = parseEventPayload(post.extracted_event?.event_data_json);
          const eventSummary = getEventSummary(eventPayload);
          const eventStart = eventSummary ? formatEventStart(eventSummary.startDate, eventSummary.startTime) : null;
          const eventJsonPretty = eventPayload ? JSON.stringify(eventPayload, null, 2) : null;
          return (
            <article key={post.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-100 h-44 flex items-center justify-center text-gray-500 text-sm">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={post.caption || 'Instagram post'}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => window.open(imageUrl, '_blank')}
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
                  {eventStart && <p>Event start: {eventStart}</p>}
                </div>
                {eventSummary && (
                  <div className="text-xs bg-purple-50 border border-purple-100 rounded-md p-3 space-y-1 text-purple-800">
                    {eventSummary.title && (
                      <p>
                        <span className="font-semibold">Event:</span> {eventSummary.title}
                      </p>
                    )}
                    {eventSummary.venueName && (
                      <p>
                        <span className="font-semibold">Venue:</span> {eventSummary.venueName}
                      </p>
                    )}
                    {eventSummary.startDate && !eventStart && (
                      <p>
                        <span className="font-semibold">Starts:</span> {eventSummary.startDate}
                        {eventSummary.startTime ? ` ${eventSummary.startTime}` : ""}
                      </p>
                    )}
                  </div>
                )}
                {eventJsonPretty && (
                  <details className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
                    <summary className="cursor-pointer font-medium text-gray-700">
                      View event JSON
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] max-h-48 overflow-auto text-gray-700">
                      {eventJsonPretty}
                    </pre>
                  </details>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onOpenEventModal(post)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    {post.extracted_event ? "Edit Event JSON" : "Add Event JSON"}
                  </button>
                  <button
                    onClick={() => onDeletePost(post)}
                    disabled={deletingPostId === post.id}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Trash2 className={`h-4 w-4 ${deletingPostId === post.id ? "animate-spin" : ""}`} />
                    {deletingPostId === post.id ? "Deleting..." : "Delete post"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {eventPosts.length === 0 && (
          <div className="text-center text-gray-500 py-12 border border-dashed border-gray-200 rounded-lg">
            No event posts available yet—monitor or classify to add more.
          </div>
        )}
      </div>
    </section>
  </div>
);
