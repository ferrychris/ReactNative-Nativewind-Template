import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ConversationRow } from "@/components/inbox/ConversationRow";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { fetchActivity, fetchInbox, markActivityRead, type Activity } from "@/lib/api/messages";
import { timeAgo } from "@/lib/format";
import { useUnread } from "@/lib/hooks/useUnread";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  follow: "person-add-outline",
  like: "heart-outline",
  comment: "chatbubble-outline",
  reply: "return-down-forward-outline",
  gift: "gift-outline",
  bid: "pricetag-outline",
  bid_accepted: "checkmark-circle-outline",
  bid_rejected: "close-circle-outline",
  live: "radio-outline",
};

function ActivityRow({ item, onPress }: { item: Activity; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-row items-center px-4 py-3 active:opacity-70 ${item.read ? "" : "bg-paddock-surface"}`}>
      <View>
        <UserAvatar name={item.actor?.name ?? item.title} url={item.actor?.avatarUrl} size={46} />
        <View className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full border-2 border-paddock-bg bg-paddock-orange">
          <Ionicons name={ICONS[item.type] ?? "notifications-outline"} size={11} color="#0b0b0d" />
        </View>
      </View>
      <View className="ml-3 flex-1">
        <Text numberOfLines={2} className="text-[15px] leading-[21px] text-paddock-text">
          {item.message}
        </Text>
        <Text className="mt-0.5 text-[12px] text-paddock-muted">{timeAgo(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile!.id;
  const counts = useUnread();
  const [tab, setTab] = useState<"messages" | "activity">("messages");

  const inbox = useQuery({ queryKey: ["inbox", me], queryFn: fetchInbox });
  const activity = useQuery({ queryKey: ["activity", me], queryFn: fetchActivity, enabled: tab === "activity" });

  const chats = useMemo(() => (inbox.data ?? []).filter((c) => !c.isRequest), [inbox.data]);
  const requests = useMemo(() => (inbox.data ?? []).filter((c) => c.isRequest), [inbox.data]);

  // Looking at Activity marks it as read (the list keeps its highlight until you leave).
  useEffect(() => {
    if (tab !== "activity" || !activity.data?.some((a) => !a.read)) return;
    const t = setTimeout(() => {
      markActivityRead(me).then(() => qc.invalidateQueries({ queryKey: ["unread"] }));
    }, 1500);
    return () => clearTimeout(t);
  }, [tab, activity.data, me, qc]);

  const openActivity = (a: Activity) => {
    if ((a.type === "live" || a.entityType === "live_stream") && a.entityId) return router.push({ pathname: "/livestream/watch/[id]", params: { id: a.entityId } });
    if (a.type === "follow" && a.actor?.username) return router.push({ pathname: "/user/[username]", params: { username: a.actor.username } });
    if (a.entityType === "post" && a.entityId) return router.push({ pathname: "/post/[id]", params: { id: a.entityId } });
    if (a.type.startsWith("bid")) return router.push("/profile");
  };

  const segments: { key: "messages" | "activity"; label: string; badge: number }[] = [
    { key: "messages", label: "Messages", badge: counts.messages + counts.requests },
    { key: "activity", label: "Activity", badge: counts.notifications },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="px-4 pb-1 pt-3">
        <Text className="text-[26px] font-semibold text-paddock-text">Inbox</Text>
        <View className="mt-3 flex-row border-b border-paddock-surface">
          {segments.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => {
                Haptics.selectionAsync();
                setTab(s.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === s.key }}
              className="flex-1 flex-row items-center justify-center py-3 active:opacity-70"
            >
              <Text className={`text-[14px] font-semibold uppercase tracking-[2px] ${tab === s.key ? "text-paddock-text" : "text-paddock-muted"}`}>{s.label}</Text>
              {s.badge > 0 && (
                <View className="ml-2 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-paddock-orange px-1">
                  <Text className="text-[10.5px] font-semibold text-paddock-text">{s.badge > 99 ? "99+" : s.badge}</Text>
                </View>
              )}
              {tab === s.key && <View className="absolute bottom-0 h-[2px] w-16 bg-paddock-orange" />}
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "messages" ? (
        inbox.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#e8582f" />
          </View>
        ) : inbox.isError ? (
          <Pressable onPress={() => inbox.refetch()} className="flex-1 items-center justify-center px-10 active:opacity-70">
            <Text className="text-center text-[15px] text-paddock-muted">Couldn't load your messages. Tap to retry.</Text>
          </Pressable>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(c) => c.id}
            refreshing={inbox.isRefetching}
            onRefresh={() => inbox.refetch()}
            ListHeaderComponent={
              requests.length > 0 ? (
                <Pressable onPress={() => router.push("/chat/requests")} className="flex-row items-center border-b border-paddock-surface px-4 py-3.5 active:opacity-70">
                  <View className="h-[54px] w-[54px] items-center justify-center bg-paddock-surface">
                    <Ionicons name="mail-unread-outline" size={24} color="#e8582f" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] text-paddock-text">Message requests</Text>
                    <Text className="mt-0.5 text-[13px] text-paddock-muted">
                      {requests.length} {requests.length === 1 ? "person" : "people"} you don't follow
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9a928d" />
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => <ConversationRow chat={item} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })} />}
            ListEmptyComponent={
              <View className="items-center px-10 pt-16">
                <Ionicons name="chatbubbles-outline" size={42} color="#9a928d" />
                <Text className="mt-4 text-[18px] text-paddock-text">No messages yet</Text>
                <Text className="mt-2 text-center text-[14px] text-paddock-muted">Message a friend or another racer to start a conversation.</Text>
                <Pressable onPress={() => router.push("/friends")} className="mt-6 h-11 items-center justify-center bg-paddock-orange px-6 active:opacity-80">
                  <Text className="text-[14px] font-semibold text-paddock-text">Find people</Text>
                </Pressable>
              </View>
            }
          />
        )
      ) : activity.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8582f" />
        </View>
      ) : activity.isError ? (
        <Pressable onPress={() => activity.refetch()} className="flex-1 items-center justify-center px-10 active:opacity-70">
          <Text className="text-center text-[15px] text-paddock-muted">Couldn't load activity. Tap to retry.</Text>
        </Pressable>
      ) : (
        <FlatList
          data={activity.data}
          keyExtractor={(a) => a.id}
          refreshing={activity.isRefetching}
          onRefresh={() => activity.refetch()}
          renderItem={({ item }) => <ActivityRow item={item} onPress={() => openActivity(item)} />}
          ListEmptyComponent={
            <View className="items-center px-10 pt-16">
              <Ionicons name="notifications-outline" size={42} color="#9a928d" />
              <Text className="mt-4 text-[18px] text-paddock-text">Nothing yet</Text>
              <Text className="mt-2 text-center text-[14px] text-paddock-muted">Follows, likes, comments and sponsorship bids show up here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
