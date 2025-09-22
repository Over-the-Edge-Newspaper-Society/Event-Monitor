import { Download, FileText, Trash2, Zap } from "lucide-react";

import type { PostRecord } from "../types";
import { formatTimestamp } from "../utils/format";
import { getPostImageUrl } from "../utils/image";

type VoidOrPromise = void | Promise<void>;

interface EventsSectionProps {
  eventPosts: PostRecord[];
  deletingPostId: number | null;
  isExporting: boolean;
  onExportEvents: () => VoidOrPromise;
  onOpenEventModal: (post: PostRecord) => VoidOrPromise;
  onDeletePost: (post: PostRecord) => VoidOrPromise;
}

export const EventsSection = ({
  eventPosts,
  deletingPostId,
  isExporting,
  onExportEvents,
  onOpenEventModal,
  onDeletePost,
}: EventsSectionProps) => (
  <div className="bg-white rounded-xl shadow-sm p-6">
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-purple-600" />
        Ready for Extraction
      </h2>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{eventPosts.length} posts marked as events</span>
        <button
          onClick={onExportEvents}
          disabled={isExporting || eventPosts.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-purple-200 text-sm font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
        >
          <Download className={`h-4 w-4 ${isExporting ? "animate-spin" : ""}`} />
          {isExporting ? "Exporting..." : "Export events"}
        </button>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {eventPosts.map((post) => {
        const imageUrl = getPostImageUrl(post);
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
              </div>
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
  </div>
);
