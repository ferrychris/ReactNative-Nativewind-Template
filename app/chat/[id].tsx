import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LiveRing } from "@/components/ui/LiveRing";
import {
  acceptRequest,
  fetchChatInfo,
  fetchMessages,
  leaveChat,
  markRead,
  MAX_MESSAGE_LENGTH,
  MESSAGE_PAGE,
  messageError,
  sendMessage,
  type Message,
} from "@/lib/api/messages";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";
import { setActiveChat } from "@/lib/push";

const ORANGE = "#e8582f";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

type Pages = InfiniteData<Message[], string | null>;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // while this chat is open, its own message pushes stay quiet
  useEffect(() => {
    setActiveChat(id);
    return () => setActiveChat(null);
  }, [id]);
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile!.id;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const info = useQuery({ queryKey: ["chat", id], queryFn: () => fetchChatInfo(id, me) });

  const messages = useInfiniteQuery({
    queryKey: ["messages", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMessages(id, pageParam),
    getNextPageParam: (last) => (last.length === MESSAGE_PAGE ? last[last.length - 1].createdAt : undefined),
  });
  const list = useMemo(() => messages.data?.pages.flat() ?? [], [messages.data]);

  /** Adds a message at the top of the newest page (ignores duplicates, e.g. our own echo from realtime). */
  const addToCache = useCallback(
    (m: Message) => {
      qc.setQueryData<Pages>(["messages", id], (old) => {
        if (!old) return old;
        if (old.pages.some((p) => p.some((x) => x.id === m.id))) return old;
        const [first, ...rest] = old.pages;
        return { ...old, pages: [[m, ...(first ?? [])], ...rest] };
      });
    },
    [qc, id],
  );

  const refreshBadges = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["unread"] });
    qc.invalidateQueries({ queryKey: ["inbox"] });
  }, [qc]);

  // Opening the chat marks it read.
  useEffect(() => {
    markRead(id, me).then(refreshBadges);
  }, [id, me, refreshBadges]);

  // New messages arrive live.
  useEffect(() => {
    const channel = newChannel(`dm:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, (payload) => {
        const r = payload.new as { id: string; conversation_id: string; sender_id: string; body: string | null; created_at: string };
        addToCache({ id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, createdAt: r.created_at });
        if (r.sender_id !== me) markRead(id, me).then(refreshBadges);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, me, addToCache, refreshBadges]);

  const send = useMutation({
    mutationFn: (text: string) => sendMessage(id, me, text),
    onSuccess: (m) => {
      addToCache(m);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["chat", id] }); // sending accepts a request
    },
    onError: (e, text) => {
      setError(messageError(e));
      setDraft(text); // give the text back so nothing is lost
    },
  });

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    setDraft("");
    send.mutate(text);
  };

  const other = info.data?.other;
  const openProfile = () => other?.username && router.push({ pathname: "/user/[username]", params: { username: other.username } });

  const menu = () => {
    Haptics.selectionAsync();
    Alert.alert(other?.name ?? "Chat", undefined, [
      { text: "View profile", onPress: openProfile },
      {
        text: "Delete chat",
        style: "destructive",
        onPress: async () => {
          await leaveChat(id, me).catch(() => {});
          refreshBadges();
          router.back();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const accept = async () => {
    try {
      await acceptRequest(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["chat", id] });
      refreshBadges();
    } catch {
      Alert.alert("Couldn't accept", "Check your connection and try again.");
    }
  };

  const decline = async () => {
    await leaveChat(id, me).catch(() => {});
    refreshBadges();
    router.back();
  };

  const canSend = draft.trim().length > 0 && !send.isPending;
  const pending = info.data?.pendingForMe ?? false;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="h-14 flex-row items-center border-b border-paddock-surface px-3">
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/inbox"))} accessibilityLabel="Back" className="mr-2 active:opacity-60">
          <Ionicons name="arrow-back" size={24} color="#f2f0ee" />
        </Pressable>
        <Pressable onPress={openProfile} disabled={!other} className="flex-1 flex-row items-center active:opacity-70">
          <LiveRing userId={other?.id} size={36} showOnline>
            <UserAvatar name={other?.name ?? "?"} url={other?.avatarUrl} size={36} />
          </LiveRing>
          <View className="ml-3 flex-1">
            <Text numberOfLines={1} className="text-[16px] font-semibold text-paddock-text">
              {other?.name ?? " "}
            </Text>
            {other?.username ? (
              <Text numberOfLines={1} className="text-[12px] text-paddock-muted">
                @{other.username}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable hitSlop={12} onPress={menu} accessibilityLabel="Chat options" className="ml-2 active:opacity-60">
          <Ionicons name="ellipsis-horizontal" size={24} color="#f2f0ee" />
        </Pressable>
      </View>

      {pending && (
        <View className="border-b border-paddock-surface bg-paddock-surface px-4 py-3">
          <Text className="text-[14px] leading-5 text-paddock-text">
            {other?.name ?? "Someone"} isn't someone you follow, so this is a message request. They can't see when you read it.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable onPress={accept} className="h-10 flex-1 items-center justify-center bg-paddock-orange active:opacity-80">
              <Text className="text-[14px] font-semibold text-paddock-text">Accept</Text>
            </Pressable>
            <Pressable onPress={decline} className="h-10 flex-1 items-center justify-center border border-paddock-border active:opacity-70">
              <Text className="text-[14px] font-semibold text-paddock-text">Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1">
        {messages.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={ORANGE} />
          </View>
        ) : messages.isError ? (
          <Pressable onPress={() => messages.refetch()} className="flex-1 items-center justify-center active:opacity-70">
            <Text className="text-[15px] text-paddock-muted">Couldn't load messages. Tap to retry.</Text>
          </Pressable>
        ) : (
          <FlatList
            data={list}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 py-3"
            onEndReachedThreshold={0.4}
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
            ListFooterComponent={messages.isFetchingNextPage ? <ActivityIndicator color={ORANGE} className="py-4" /> : null}
            ListEmptyComponent={
              <View className="items-center px-10 py-20" style={{ transform: [{ scaleY: -1 }] }}>
                <Text className="text-center text-[15px] text-paddock-muted">{other ? `Say hi to ${other.name}.` : "No messages yet."}</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const mine = item.senderId === me;
              // list is newest-first, so the "previous" message in time is index + 1
              const older = list[index + 1];
              const newDay = !older || new Date(older.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
              return (
                <View>
                  {newDay && <Text className="my-3 text-center text-[12px] uppercase tracking-[1px] text-paddock-muted">{dayLabel(item.createdAt)}</Text>}
                  <View className={`my-0.5 max-w-[80%] ${mine ? "self-end" : "self-start"}`}>
                    <View className={`px-3.5 py-2.5 ${mine ? "bg-paddock-orange" : "bg-paddock-surface"}`}>
                      <Text className="text-[16px] leading-[22px] text-paddock-text">{item.body}</Text>
                    </View>
                    <Text className={`mt-0.5 text-[11px] text-paddock-muted ${mine ? "text-right" : "text-left"}`}>{clock(item.createdAt)}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {error && (
          <Text accessibilityRole="alert" className="px-4 pb-2 text-[13px] text-[#ff7a5c]">
            {error}
          </Text>
        )}

        <SafeAreaView edges={["bottom"]} className="border-t border-paddock-surface bg-paddock-bg">
          <View className="flex-row items-end px-3 py-2.5">
            <View className="mr-2 min-h-[46px] flex-1 justify-center border border-paddock-border bg-paddock-surface px-4">
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  if (error) setError(null);
                }}
                multiline
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Message..."
                placeholderTextColor="#6b6561"
                selectionColor={ORANGE}
                className="max-h-[110px] py-2.5 text-[16px] text-paddock-text"
                onKeyPress={(e) => {
                  // web: Enter sends, Shift+Enter adds a line
                  const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (Platform.OS === "web" && ev.key === "Enter" && !ev.shiftKey) {
                    (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                    submit();
                  }
                }}
              />
            </View>
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityLabel="Send message"
              className="h-[46px] w-[46px] items-center justify-center bg-paddock-orange active:opacity-80"
              style={{ opacity: canSend ? 1 : 0.5 }}
            >
              {send.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={22} color="#fff" />}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
