import { supabase } from "@/lib/supabase";
import type { CommentItem, UserType } from "@/lib/types";

type Row = {
  id: string;
  post_id: string;
  parent_id: string | null;
  user_id: string;
  comment_text: string;
  likes_count: number;
  created_at: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  user_type: UserType;
  car_number: string | null;
  racing_class: string | null;
  is_post_author: boolean;
  is_racer: boolean;
};

function badgeFor(r: Row): CommentItem["badge"] {
  if (r.is_post_author) return { label: "Author", tone: "orange" };
  if (r.is_racer && r.car_number) return { label: `#${r.car_number}${r.racing_class ? ` ${r.racing_class}` : ""}`, tone: "neutral" };
  if (r.user_type === "track") return { label: "Track", tone: "neutral" };
  return null;
}

/** All comments of a post as threads (top-level comments with their replies). */
export async function fetchComments(postId: string, viewerId: string): Promise<CommentItem[]> {
  const { data, error } = await supabase
    .from("post_comments_enriched")
    .select("id, post_id, parent_id, user_id, comment_text, likes_count, created_at, name, username, avatar_url, user_type, car_number, racing_class, is_post_author, is_racer")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const ids = rows.map((r) => r.id);
  const { data: likes } = ids.length
    ? await supabase.from("comment_likes").select("comment_id").eq("user_id", viewerId).in("comment_id", ids)
    : { data: [] as { comment_id: string }[] };
  const liked = new Set((likes ?? []).map((l) => l.comment_id));

  const toItem = (r: Row): CommentItem => ({
    id: r.id,
    postId: r.post_id,
    parentId: r.parent_id,
    userId: r.user_id,
    name: r.name,
    username: r.username,
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    badge: badgeFor(r),
    text: r.comment_text,
    createdAt: r.created_at,
    likes: r.likes_count,
    liked: liked.has(r.id),
    replies: [],
  });

  const top = new Map<string, CommentItem>();
  for (const r of rows) if (!r.parent_id) top.set(r.id, toItem(r));
  for (const r of rows) if (r.parent_id) top.get(r.parent_id)?.replies.push(toItem(r));
  // newest top-level comments first, replies oldest first
  return [...top.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addComment(input: { postId: string; userId: string; text: string; parentId?: string | null }) {
  const { error } = await supabase.from("post_comments").insert({
    post_id: input.postId,
    user_id: input.userId,
    comment_text: input.text.trim(),
    parent_id: input.parentId ?? null,
  });
  if (error) throw error;
}

export async function setCommentLike(commentId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from("comment_likes").upsert({ comment_id: commentId, user_id: userId }, { onConflict: "comment_id,user_id", ignoreDuplicates: true })
    : await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
  if (error) throw error;
}
