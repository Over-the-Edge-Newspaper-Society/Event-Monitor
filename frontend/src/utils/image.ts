import { STATIC_BASE } from "../config";
import type { PostRecord } from "../types";

export const getPostImageUrl = (post: PostRecord): string | null => {
  if (post.local_image_path) {
    const prefix = STATIC_BASE ? `${STATIC_BASE}` : "";
    return `${prefix}/static/images/${post.local_image_path}`;
  }
  return post.image_url || null;
};
