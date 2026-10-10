import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { FULL_IMAGE_WIDTH, MAX_VIDEO_BYTES, THUMB_IMAGE_WIDTH, assertStoredCorrectly, localFileSize, prepareImage, readBytes, uploadFromDisk } from "@/lib/media";
import type { FeedPost, PostType, ReportReason, UserType, Visibility } from "@/lib/types";

const POST_SELECT = `
  id, author_id, content, caption, headline, source_label, session_label, telemetry, media_urls,
  post_type, visibility, likes_count, comments_count, views_count, created_at,
  author:profiles!posts_author_id_fkey(id, name, username, avatar_url, user_type, is_verified),
  post_media(id, kind, url, thumbnail_url, position)
`;

const SIGNED_URL_TTL = 3 * 60 * 60; // 3h
const REFRESH_BEFORE_MS = 30 * 60 * 1000; // re-sign when less than 30 min are left
export const PAGE_SIZE = 8;

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  caption: string | null;
  headline: string | null;
  source_label: string | null;
  session_label: string | null;
  media_urls: unknown;
  telemetry: { track_temp?: string; grip_idx?: string; trackTemp?: string; gripIdx?: string } | null;
  post_type: PostType;
  visibility: Visibility;
  likes_count: number;
  comments_count: number;
  views_count: number | null;
  created_at: string;
  author: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
    user_type: UserType;
    is_verified: boolean;
  } | null;
  post_media: { id: string; kind: "photo" | "video"; url: string; thumbnail_url: string | null; position: number }[];
};

type RawMedia = PostRow["post_media"][number];

/** post_media rows are the source of truth; fall back to the posts.media_urls list if there are none. */
function mediaOf(r: PostRow): RawMedia[] {
  if (r.post_media.length > 0) return r.post_media;
  if (!Array.isArray(r.media_urls)) return [];
  return r.media_urls
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((url, i) => ({ id: `${r.id}-${i}`, kind: r.post_type === "video" ? "video" : "photo", url, thumbnail_url: null, position: i }));
}

/**
 * Signed URLs are cached per path and reused until close to expiry. A new URL string means a new
 * entry in the image cache, so handing out a fresh URL on every fetch made every image re-download.
 */
const signedCache = new Map<string, { url: string; expiresAt: number }>();

async function signMedia(paths: string[]): Promise<{ urls: Map<string, string>; errors: Map<string, string> }> {
  const out = new Map<string, string>();
  const errors = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = signedCache.get(path);
    if (hit && hit.expiresAt - now > REFRESH_BEFORE_MS) out.set(path, hit.url);
    else missing.push(path);
  }
  if (missing.length === 0) return { urls: out, errors };

  const { data, error } = await supabase.storage.from("post-media").createSignedUrls(missing, SIGNED_URL_TTL);
  if (error) {
    console.warn("[post-media] could not sign URLs:", error.message);
    for (const path of missing) errors.set(path, error.message);
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      out.set(item.path, item.signedUrl);
      signedCache.set(item.path, { url: item.signedUrl, expiresAt: now + SIGNED_URL_TTL * 1000 });
    } else {
      console.warn("[post-media] no signed URL for", item.path, item.error);
      if (item.path) errors.set(item.path, item.error ?? "no signed URL returned");
    }
  }
  for (const path of missing) if (!out.has(path) && !errors.has(path)) errors.set(path, "file not found in the post-media bucket");
  return { urls: out, errors };
}

/** Forget cached links (used on sign-out so another account never reuses them). */
export function clearSignedUrlCache() {
  signedCache.clear();
}

/** Turns raw rows into UI-ready posts: signed media URLs, "did I like it", "do I follow the author". */
async function hydrate(rows: PostRow[], viewerId: string): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const postIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];

  const [likes, saves, follows, signedResult] = await Promise.all([
    supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    supabase.from("saved_posts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    supabase.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", authorIds),
    signMedia(rows.flatMap((r) => mediaOf(r).flatMap((m) => (m.thumbnail_url ? [m.url, m.thumbnail_url] : [m.url])))),
  ]);
  const likedSet = new Set((likes.data ?? []).map((l) => l.post_id as string));
  const signed = signedResult.urls;
  const savedSet = new Set((saves.data ?? []).map((l) => l.post_id as string));
  const followingSet = new Set((follows.data ?? []).map((f) => f.following_id as string));

  return rows.map((r) => ({
    id: r.id,
    author: {
      id: r.author_id,
      name: r.author?.name ?? "Unknown",
      username: r.author?.username ?? null,
      avatarUrl: r.author?.avatar_url ?? null,
      userType: r.author?.user_type ?? "fan",
      isVerified: r.author?.is_verified ?? false,
    },
    content: r.content,
    caption: r.caption,
    headline: r.headline,
    sourceLabel: r.source_label,
    sessionLabel: r.session_label,
    telemetry: {
      trackTemp: r.telemetry?.trackTemp ?? r.telemetry?.track_temp,
      gripIdx: r.telemetry?.gripIdx ?? r.telemetry?.grip_idx,
    },
    postType: r.post_type,
    visibility: r.visibility,
    likes: r.likes_count,
    views: r.views_count ?? 0,
    comments: r.comments_count,
    createdAt: r.created_at,
    media: [...mediaOf(r)]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        url: signed.get(m.url) ?? "",
        thumbnailUrl: m.thumbnail_url ? signed.get(m.thumbnail_url) ?? null : null,
        error: signed.has(m.url) ? null : signedResult.errors.get(m.url) ?? "no link",
      })),
    liked: likedSet.has(r.id),
    saved: savedSet.has(r.id),
    following: followingSet.has(r.author_id),
    isMine: r.author_id === viewerId,
  }));
}

export type PostsPage = { items: FeedPost[]; nextCursor: string | null };

type FetchPostsOptions = {
  viewerId: string;
  /** Only posts by this author (profile grid). */
  authorId?: string;
  /** Only posts by people the viewer follows (Friends tab). */
  followingOnly?: boolean;
  cursor?: string | null;
  limit?: number;
};

export async function fetchPosts({ viewerId, authorId, followingOnly, cursor, limit = PAGE_SIZE }: FetchPostsOptions): Promise<PostsPage> {
  let query = supabase.from("posts").select(POST_SELECT).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);

  if (authorId) query = query.eq("author_id", authorId);
  if (cursor) query = query.lt("created_at", cursor);

  if (followingOnly) {
    const { data: follows, error } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId);
    if (error) throw error;
    const ids = (follows ?? []).map((f) => f.following_id as string);
    if (ids.length === 0) return { items: [], nextCursor: null };
    query = query.in("author_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as PostRow[];
  const items = await hydrate(rows, viewerId);
  return { items, nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null };
}

export async function fetchPost(id: string, viewerId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await hydrate([data as unknown as PostRow], viewerId);
  return post ?? null;
}

export async function setLike(postId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from("post_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (error) throw error;
}

export async function setFollow(targetId: string, viewerId: string, follow: boolean) {
  if (targetId === viewerId) throw new Error("You can't follow yourself.");
  const { error } = follow
    ? await supabase.from("follows").upsert({ follower_id: viewerId, following_id: targetId }, { onConflict: "follower_id,following_id", ignoreDuplicates: true })
    : await supabase.from("follows").delete().eq("follower_id", viewerId).eq("following_id", targetId);
  if (error) throw error;
}

export async function setSaved(postId: string, userId: string, saved: boolean) {
  const { error } = saved
    ? await supabase.from("saved_posts").upsert({ user_id: userId, post_id: postId }, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await supabase.from("saved_posts").delete().eq("user_id", userId).eq("post_id", postId);
  if (error) throw error;
}

/** Posts the viewer saved, most recently saved first. */
export async function fetchSavedPosts({ viewerId, cursor, limit = 18 }: { viewerId: string; cursor?: string | null; limit?: number }): Promise<PostsPage> {
  let q = supabase.from("saved_posts").select("post_id, created_at").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(limit);
  if (cursor) q = q.lt("created_at", cursor);
  const { data: saves, error } = await q;
  if (error) throw error;
  if (!saves || saves.length === 0) return { items: [], nextCursor: null };

  const { data, error: postsError } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("id", saves.map((s) => s.post_id))
    .is("deleted_at", null);
  if (postsError) throw postsError;
  const hydrated = await hydrate((data ?? []) as unknown as PostRow[], viewerId);
  const byId = new Map(hydrated.map((p) => [p.id, p]));
  // posts that were deleted or became invisible simply drop out of the list
  const items = saves.map((s) => byId.get(s.post_id)).filter((p): p is FeedPost => !!p);
  return { items, nextCursor: saves.length === limit ? saves[saves.length - 1].created_at : null };
}

/** Posts the viewer liked, most recently liked first. */
export async function fetchLikedPosts({ viewerId, cursor, limit = 18 }: { viewerId: string; cursor?: string | null; limit?: number }): Promise<PostsPage> {
  let q = supabase.from("post_likes").select("post_id, created_at").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(limit);
  if (cursor) q = q.lt("created_at", cursor);
  const { data: likes, error } = await q;
  if (error) throw error;
  if (!likes || likes.length === 0) return { items: [], nextCursor: null };

  const { data, error: postsError } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("id", likes.map((l) => l.post_id))
    .is("deleted_at", null);
  if (postsError) throw postsError;
  const hydrated = await hydrate((data ?? []) as unknown as PostRow[], viewerId);
  const byId = new Map(hydrated.map((p) => [p.id, p]));
  const items = likes.map((l) => byId.get(l.post_id)).filter((p): p is FeedPost => !!p);
  return { items, nextCursor: likes.length === limit ? likes[likes.length - 1].created_at : null };
}

export async function setVisibility(postId: string, visibility: Visibility) {
  const { error } = await supabase.from("posts").update({ visibility }).eq("id", postId);
  if (error) throw error;
}

export async function reportPost(postId: string, reporterId: string, reason: ReportReason) {
  const { error } = await supabase.from("reports").insert({ reporter_id: reporterId, target_type: "post", target_id: postId, reason });
  // 23505: you already reported this post, which is fine
  if (error && error.code !== "23505") throw error;
}

export async function blockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from("blocks").upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) throw error;
  // blocking someone also unfollows them
  await supabase.from("follows").delete().eq("follower_id", blockerId).eq("following_id", blockedId);
}

export async function deletePost(postId: string) {
  // Soft delete: the row stays for moderation, RLS hides it from everyone.
  const { error } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  if (error) throw error;
}

/* ---------------------------------------------------------------- create */

export type PickedMedia = {
  uri: string;
  /** The browser File (web only), the most reliable source of the picked bytes. */
  file?: Blob | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
  durationMs?: number | null;
};

export type CreatePostInput = {
  userId: string;
  /** Large text of a text-only post. */
  body: string;
  caption: string;
  visibility: Visibility;
  mediaKind: "photo" | "video" | "gallery" | null;
  media: PickedMedia[];
};

const randomId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const extFor = (m: PickedMedia, kind: "photo" | "video") => {
  const fromMime = m.mimeType?.split("/")[1]?.replace("quicktime", "mov").replace("jpeg", "jpg");
  const fromUri = m.uri.split("?")[0].split(".").pop();
  return (fromMime || (fromUri && fromUri.length <= 4 ? fromUri : null) || (kind === "video" ? "mp4" : "jpg")).toLowerCase();
};

const contentTypeFor = (m: PickedMedia, kind: "photo" | "video", ext: string) =>
  m.mimeType ?? (kind === "video" ? (ext === "mov" ? "video/quicktime" : "video/mp4") : ext === "png" ? "image/png" : "image/jpeg");

export async function createPost(input: CreatePostInput): Promise<string> {
  const { userId, body, caption, visibility, mediaKind, media } = input;
  const kind: "photo" | "video" = mediaKind === "video" ? "video" : "photo";
  const uploaded: { path: string; thumbPath?: string; width?: number; height?: number; durationMs?: number | null }[] = [];
  /** every file we put in storage, so a failed post can clean up after itself */
  const files: string[] = [];

  const putBytes = async (path: string, bytes: ArrayBuffer, contentType: string) => {
    if (bytes.byteLength === 0) throw new Error("Couldn't read the selected file. Try picking it again.");
    console.log(`[post-media] uploading ${path} (${bytes.byteLength} bytes, ${contentType})`);
    const { error } = await supabase.storage.from("post-media").upload(path, bytes, { contentType });
    if (error) {
      console.warn("[post-media] upload failed:", error.message);
      throw new Error(error.message.toLowerCase().includes("bucket not found") ? "Media storage isn't set up yet (the post-media bucket is missing)." : error.message);
    }
    files.push(path);

    // Read the file back and make sure it was stored as sent (type + size) before building a post on it.
    const { data: check } = await supabase.storage.from("post-media").createSignedUrl(path, 120);
    if (check?.signedUrl) await assertStoredCorrectly(check.signedUrl, contentType, bytes.byteLength);
  };

  /**
   * Videos go from disk to storage without being loaded into memory (a 100 MB+ video used to be read
   * into JS as an ArrayBuffer and crash the app). The web has no disk path, so it keeps the old route.
   */
  const putFile = async (path: string, source: PickedMedia, contentType: string) => {
    if (Platform.OS === "web") return putBytes(path, await readBytes(source), contentType);
    const size = await localFileSize(source.uri);
    if (size !== null && size > MAX_VIDEO_BYTES) {
      throw new Error(`That video is ${Math.round(size / 1048576)} MB. The limit is ${Math.round(MAX_VIDEO_BYTES / 1048576)} MB: pick a shorter clip or a lower quality.`);
    }
    console.log(`[post-media] streaming ${path} from disk (${size ?? "unknown"} bytes, ${contentType})`);
    const { data, error: signError } = await supabase.storage.from("post-media").createSignedUploadUrl(path);
    if (signError || !data) throw new Error(signError?.message ?? "Couldn't start the upload.");
    await uploadFromDisk(data.signedUrl, source.uri, contentType);
    files.push(path);
    const { data: check } = await supabase.storage.from("post-media").createSignedUrl(path, 120);
    if (check?.signedUrl && size) await assertStoredCorrectly(check.signedUrl, contentType, size);
  };

  try {
    for (const m of media) {
      const id = randomId();
      if (kind === "photo") {
        // Cameras produce 3-8 MB originals. Upload a screen-sized copy and a small thumbnail instead.
        const full = await prepareImage(m, FULL_IMAGE_WIDTH, m.width, 0.8);
        const thumb = await prepareImage(m, THUMB_IMAGE_WIDTH, m.width, 0.7);
        const path = `${userId}/${id}.jpg`;
        const thumbPath = `${userId}/${id}_thumb.jpg`;
        await putBytes(path, full.bytes, "image/jpeg");
        await putBytes(thumbPath, thumb.bytes, "image/jpeg");
        uploaded.push({ path, thumbPath, width: full.width, height: full.height });
      } else {
        const ext = extFor(m, kind);
        const path = `${userId}/${id}.${ext}`;
        await putFile(path, m, contentTypeFor(m, kind, ext));
        uploaded.push({ path, width: m.width, height: m.height, durationMs: m.durationMs });
      }
    }

    const postType: PostType = mediaKind === null ? "text" : mediaKind;
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        author_id: userId,
        content: mediaKind === null ? body.trim() : "",
        caption: caption.trim() || null,
        post_type: postType,
        visibility,
        allow_tips: false, // gifting is paused until the live feature
      })
      .select("id")
      .single();
    if (postError) throw postError;

    if (uploaded.length > 0) {
      const { error: mediaError } = await supabase.from("post_media").insert(
        uploaded.map((u, i) => ({
          post_id: post.id,
          kind,
          url: u.path,
          thumbnail_url: u.thumbPath ?? null,
          width: u.width ?? null,
          height: u.height ?? null,
          duration_ms: u.durationMs ? Math.round(u.durationMs) : null,
          position: i,
        })),
      );
      if (mediaError) {
        await supabase.from("posts").delete().eq("id", post.id);
        throw mediaError;
      }
      // Mirror the paths into posts.media_urls (the older list column the web app reads).
      // A database trigger does this too; failing here is harmless.
      await supabase.from("posts").update({ media_urls: uploaded.map((u) => u.path) }).eq("id", post.id);
    }
    return post.id as string;
  } catch (e) {
    // Don't leave orphaned files behind if the post itself failed.
    if (files.length > 0) await supabase.storage.from("post-media").remove(files);
    throw e;
  }
}
