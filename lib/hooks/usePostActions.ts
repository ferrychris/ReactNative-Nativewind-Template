import { useCallback } from "react";
import { Alert } from "react-native";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { blockUser, deletePost, reportPost, setFollow, setLike, setSaved, setVisibility, type PostsPage } from "@/lib/api/posts";
import type { FeedPost, ReportReason, Visibility } from "@/lib/types";

type Patch = (p: FeedPost) => FeedPost;

/** Optimistic like / follow / delete shared by the feed, single-post screen and profile grid. */
export function usePostActions() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile?.id;

  /** Applies `fn` to every cached copy of every post matching `match`. */
  const patchPosts = useCallback(
    (match: (p: FeedPost) => boolean, fn: Patch) => {
      const apply: Patch = (p) => (match(p) ? fn(p) : p);
      const mapPages = (old: InfiniteData<PostsPage> | undefined) =>
        old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map(apply) })) };
      qc.setQueriesData<InfiniteData<PostsPage>>({ queryKey: ["feed"] }, mapPages);
      qc.setQueriesData<InfiniteData<PostsPage>>({ queryKey: ["userPosts"] }, mapPages);
      qc.setQueriesData<InfiniteData<PostsPage>>({ queryKey: ["saved"] }, mapPages);
      qc.setQueriesData<FeedPost | null>({ queryKey: ["post"] }, (old) => (old ? apply(old) : old));
    },
    [qc],
  );

  const toggleLike = useCallback(
    async (post: FeedPost) => {
      if (!me) return;
      const next = !post.liked;
      patchPosts((p) => p.id === post.id, (p) => ({ ...p, liked: next, likes: Math.max(0, p.likes + (next ? 1 : -1)) }));
      try {
        await setLike(post.id, me, next);
      } catch {
        patchPosts((p) => p.id === post.id, (p) => ({ ...p, liked: post.liked, likes: post.likes }));
      }
    },
    [me, patchPosts],
  );

  const toggleSave = useCallback(
    async (post: FeedPost) => {
      if (!me) return;
      const next = !post.saved;
      patchPosts((p) => p.id === post.id, (p) => ({ ...p, saved: next }));
      try {
        await setSaved(post.id, me, next);
        qc.invalidateQueries({ queryKey: ["saved"] });
      } catch {
        patchPosts((p) => p.id === post.id, (p) => ({ ...p, saved: post.saved }));
        Alert.alert("Couldn't update saved posts", "Check your connection and try again.");
      }
    },
    [me, patchPosts, qc],
  );

  const changeAudience = useCallback(
    async (post: FeedPost, visibility: Visibility) => {
      patchPosts((p) => p.id === post.id, (p) => ({ ...p, visibility }));
      try {
        await setVisibility(post.id, visibility);
      } catch {
        patchPosts((p) => p.id === post.id, (p) => ({ ...p, visibility: post.visibility }));
        Alert.alert("Couldn't change audience", "Check your connection and try again.");
      }
    },
    [patchPosts],
  );

  const report = useCallback(
    async (post: FeedPost, reason: ReportReason) => {
      if (!me) return;
      try {
        await reportPost(post.id, me, reason);
        Alert.alert("Thanks for letting us know", "We'll review this post.");
      } catch {
        Alert.alert("Couldn't send report", "Check your connection and try again.");
      }
    },
    [me],
  );

  const block = useCallback(
    (post: FeedPost, onDone?: () => void) => {
      Alert.alert(`Block ${post.author.name}?`, "You won't see each other's posts or comments, and they won't be able to message you.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            if (!me) return;
            try {
              await blockUser(me, post.author.id);
              qc.invalidateQueries({ queryKey: ["feed"] });
              qc.invalidateQueries({ queryKey: ["saved"] });
              qc.invalidateQueries({ queryKey: ["profile"] });
              onDone?.();
            } catch (e) {
              Alert.alert("Couldn't block", e instanceof Error ? e.message : "Try again.");
            }
          },
        },
      ]);
    },
    [me, qc],
  );

  const toggleFollow = useCallback(
    async (post: FeedPost) => {
      if (!me || post.isMine) return;
      const next = !post.following;
      patchPosts((p) => p.author.id === post.author.id, (p) => ({ ...p, following: next }));
      try {
        await setFollow(post.author.id, me, next);
        qc.invalidateQueries({ queryKey: ["feed", "following"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
      } catch {
        patchPosts((p) => p.author.id === post.author.id, (p) => ({ ...p, following: post.following }));
      }
    },
    [me, patchPosts, qc],
  );

  const confirmDelete = useCallback(
    (post: FeedPost, onDone?: () => void) => {
      Alert.alert("Delete post?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePost(post.id);
              qc.invalidateQueries({ queryKey: ["feed"] });
              qc.invalidateQueries({ queryKey: ["userPosts"] });
              qc.invalidateQueries({ queryKey: ["profile"] });
              onDone?.();
            } catch (e) {
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again.");
            }
          },
        },
      ]);
    },
    [qc],
  );

  return { toggleLike, toggleSave, toggleFollow, changeAudience, report, block, confirmDelete };
}
