import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPost, type PostsPage } from "@/lib/api/posts";
import { addComment, fetchComments, setCommentLike } from "@/lib/api/comments";
import { compact, initialsOf, timeAgo } from "@/lib/format";
import type { CommentItem, FeedPost } from "@/lib/types";

const ORANGE = "#e8582f";
const MUTED = "#9a928d";
const MAX_LEN = 1000;

function Avatar({ name, url, size = 46, tone = "neutral" }: { name: string; url: string | null; size?: number; tone?: "neutral" | "orange" }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={`items-center justify-center overflow-hidden border ${tone === "orange" ? "border-[#5a2a1c] bg-[#2a1a14]" : "border-paddock-border bg-[#26262b]"}`}
    >
      {url ? (
        <Image source={{ uri: url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text className={tone === "orange" ? "text-paddock-orange" : "text-paddock-text"} style={{ fontSize: size * 0.32 }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

type ItemRowProps = {
  item: CommentItem;
  size?: "lg" | "sm";
  onToggleLike: () => void;
  onReply: () => void;
  children?: React.ReactNode;
};

function ItemRow({ item, size = "lg", onToggleLike, onReply, children }: ItemRowProps) {
  const sm = size === "sm";
  const isAuthor = item.badge?.tone === "orange";
  return (
    <View className="flex-row">
      <Avatar name={item.name} url={item.avatarUrl} size={sm ? 38 : 46} tone={isAuthor ? "orange" : "neutral"} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="shrink text-[15px] text-paddock-text">
            {item.name}
          </Text>
          {item.badge && (
            <View className={`ml-2 rounded border px-1.5 py-[1px] ${isAuthor ? "border-[#7a3a24]" : "border-paddock-border bg-paddock-surface"}`}>
              <Text className={`text-[11px] tracking-[0.5px] ${isAuthor ? "text-paddock-orange" : "uppercase text-paddock-muted"}`}>{item.badge.label}</Text>
            </View>
          )}
        </View>
        <Text className="mt-0.5 text-[16px] leading-[22px] text-paddock-text">{item.text}</Text>
        <View className="mt-1.5 flex-row items-center">
          <Text className="text-[14px] text-paddock-muted">{timeAgo(item.createdAt)}</Text>
          <Pressable hitSlop={8} onPress={onReply} className="ml-4 active:opacity-60">
            <Text className="text-[14px] text-paddock-muted">Reply</Text>
          </Pressable>
        </View>
        {children}
      </View>
      <Pressable
        hitSlop={8}
        onPress={onToggleLike}
        accessibilityLabel={item.liked ? "Unlike" : "Like"}
        className="ml-2 w-10 items-center pt-1 active:opacity-60"
      >
        <Ionicons name={item.liked ? "heart" : "heart-outline"} size={22} color={item.liked ? ORANGE : MUTED} />
        <Text className={`mt-1 text-[13px] ${item.liked ? "text-paddock-orange" : "text-paddock-muted"}`}>{compact(item.likes)}</Text>
      </Pressable>
    </View>
  );
}

function Hero({ post, compact }: { post: FeedPost | null | undefined; compact: boolean }) {
  const router = useRouter();
  const photo = post?.media.find((m) => m.kind === "photo");
  const title = post ? `${post.author.username ? `@${post.author.username}` : post.author.name} // ${post.caption ?? post.sessionLabel ?? "post"}` : "Comments";
  if (compact) {
    return (
      <SafeAreaView edges={["top"]} className="bg-[#1a1411]">
        <View className="h-12 flex-row items-center px-4">
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close comments" className="mr-3 active:opacity-60">
            <Ionicons name="chevron-down" size={24} color="#f2f0ee" />
          </Pressable>
          <View className="mr-2 h-3 w-3 rounded-full bg-[#d64541]" />
          <Text numberOfLines={1} className="flex-1 text-[16px] uppercase tracking-[0.5px] text-paddock-text">
            {title}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <View className="h-[33%] bg-[#1a1411]">
      {photo ? <Image source={{ uri: photo.url }} contentFit="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
      <View className="absolute inset-0 bg-black/40" />
      {!photo && post?.content ? (
        <View className="absolute inset-x-0 bottom-6 top-20 justify-center px-6">
          <Text numberOfLines={4} className="text-[18px] leading-[26px] text-paddock-text/80">
            “{post.content}”
          </Text>
        </View>
      ) : null}
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center px-4 pt-2">
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close comments" className="mr-3 active:opacity-60">
            <Ionicons name="chevron-down" size={24} color="#f2f0ee" />
          </Pressable>
          <View className="mr-2 h-3 w-3 rounded-full bg-[#d64541]" />
          <Text numberOfLines={1} className="flex-1 text-[16px] uppercase tracking-[0.5px] text-paddock-text">
            {title}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function CommentsSheet({ postId }: { postId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile!;
  const inputRef = useRef<TextInput>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  // Replies always attach to the top-level comment, whichever row was tapped.
  const [replyTo, setReplyTo] = useState<{ commentId: string; name: string } | null>(null);

  const post = useQuery({ queryKey: ["post", postId], queryFn: () => fetchPost(postId, me.id) });
  const comments = useQuery({ queryKey: ["comments", postId], queryFn: () => fetchComments(postId, me.id) });

  // Track the keyboard so the sheet can use the full height and the input never sits underneath it.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const total = useMemo(() => (comments.data ?? []).reduce((n, c) => n + 1 + c.replies.length, 0), [comments.data]);

  const send = useMutation({
    mutationFn: (v: { text: string; parentId: string | null }) => addComment({ postId, userId: me.id, text: v.text, parentId: v.parentId }),
    onSuccess: async (_d, v) => {
      if (v.parentId) setExpanded((prev) => ({ ...prev, [v.parentId!]: true }));
      await Promise.all([comments.refetch(), post.refetch()]);
      // keep the comment counter on the feed in sync
      qc.setQueriesData<InfiniteData<PostsPage>>({ queryKey: ["feed"] }, (old) =>
        old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)) })) },
      );
    },
    onError: (e) => Alert.alert("Couldn't post comment", e instanceof Error ? e.message : "Try again."),
  });

  const toggleLike = (item: CommentItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !item.liked;
    const flip = (c: CommentItem): CommentItem => (c.id === item.id ? { ...c, liked: next, likes: Math.max(0, c.likes + (next ? 1 : -1)) } : c);
    const patch = (list: CommentItem[] | undefined) => list?.map((c) => ({ ...flip(c), replies: c.replies.map(flip) }));
    qc.setQueryData<CommentItem[]>(["comments", postId], patch);
    setCommentLike(item.id, me.id, next).catch(() => qc.setQueryData<CommentItem[]>(["comments", postId], (list) => list?.map((c) => ({ ...(c.id === item.id ? { ...c, liked: item.liked, likes: item.likes } : c), replies: c.replies.map((r) => (r.id === item.id ? { ...r, liked: item.liked, likes: item.likes } : r)) }))));
  };

  const startReply = (commentId: string, name: string) => {
    setReplyTo({ commentId, name });
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    send.mutate({ text, parentId: replyTo?.commentId ?? null });
    setDraft("");
    setReplyTo(null);
  };

  const canSend = draft.trim().length > 0 && !send.isPending;

  return (
    <View className="flex-1 bg-black">
      <Hero post={post.data} compact={keyboardOpen} />

      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className={`flex-1 rounded-t-3xl bg-paddock-bg ${keyboardOpen ? "" : "-mt-3"}`}>
        <View className="items-center pt-3">
          <View className="h-1 w-10 rounded-full bg-paddock-border" />
        </View>
        <View className="flex-row items-center justify-center py-4">
          <Text className="text-[18px] text-paddock-text">
            {total} {total === 1 ? "comment" : "comments"}
          </Text>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close" className="absolute right-4 active:opacity-60">
            <Ionicons name="close" size={26} color="#f2f0ee" />
          </Pressable>
        </View>

        {comments.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={ORANGE} />
          </View>
        ) : comments.isError ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-[16px] text-paddock-text">Couldn't load comments</Text>
            <Pressable onPress={() => comments.refetch()} className="mt-4 active:opacity-70">
              <Text className="text-[15px] font-semibold text-paddock-orange">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={comments.data}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="items-center px-10 pt-16">
                <Ionicons name="chatbubble-outline" size={36} color={MUTED} />
                <Text className="mt-3 text-[16px] text-paddock-text">No comments yet</Text>
                <Text className="mt-1 text-center text-[14px] text-paddock-muted">Start the conversation.</Text>
              </View>
            }
            renderItem={({ item: c }) => {
              const n = c.replies.length;
              const open = !!expanded[c.id];
              return (
                <View className="mx-4 border-b border-paddock-surface py-4">
                  <ItemRow item={c} onToggleLike={() => toggleLike(c)} onReply={() => startReply(c.id, c.name)}>
                    {n > 0 && open && (
                      <View className="-ml-1 mt-4 border-l border-paddock-border pl-5">
                        {c.replies.map((r) => (
                          <View key={r.id} className="mb-5">
                            <ItemRow item={r} size="sm" onToggleLike={() => toggleLike(r)} onReply={() => startReply(c.id, r.name)} />
                          </View>
                        ))}
                      </View>
                    )}
                    {n > 0 && (
                      <Pressable onPress={() => setExpanded((prev) => ({ ...prev, [c.id]: !open }))} className="mt-3 flex-row items-center active:opacity-60">
                        {!open && <View className="mr-3 h-px w-5 bg-paddock-border" />}
                        <Text className="text-[14px] text-paddock-muted">
                          {open ? "Hide replies" : `View ${n} ${n === 1 ? "reply" : "replies"}`} {open ? "▴" : "▾"}
                        </Text>
                      </Pressable>
                    )}
                  </ItemRow>
                </View>
              );
            }}
          />
        )}

        {/* Composer */}
        <SafeAreaView edges={keyboardOpen ? [] : ["bottom"]} className="border-t border-paddock-surface bg-paddock-bg">
          {replyTo && (
            <View className="flex-row items-center justify-between px-4 pt-3">
              <Text className="text-[16px] text-paddock-muted">
                Replying to <Text className="text-paddock-text">{replyTo.name}</Text>
              </Text>
              <Pressable hitSlop={10} onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply" className="active:opacity-60">
                <Ionicons name="close" size={22} color={MUTED} />
              </Pressable>
            </View>
          )}
          <View className="flex-row items-center px-4 py-3">
            <Avatar name={me.name} url={me.avatar_url} size={40} />
            <View className="ml-3 h-14 flex-1 flex-row items-center rounded-full border border-paddock-border bg-paddock-surface pl-5 pr-2">
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                maxLength={MAX_LEN}
                placeholder={replyTo ? "Add reply..." : "Add comment..."}
                placeholderTextColor="#6b6561"
                selectionColor={ORANGE}
                className="flex-1 text-[16px] text-paddock-text"
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={submit}
              />
              <Pressable
                onPress={submit}
                disabled={!canSend}
                accessibilityLabel="Send"
                className="h-10 w-10 items-center justify-center rounded-full bg-paddock-orange active:opacity-80"
                style={{ opacity: canSend ? 1 : 0.5 }}
              >
                {send.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={22} color="#fff" />}
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}
