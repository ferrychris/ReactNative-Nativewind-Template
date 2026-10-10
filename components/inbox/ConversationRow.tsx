import React from "react";
import { Pressable, Text, View } from "react-native";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LiveRing } from "@/components/ui/LiveRing";
import { timeAgo } from "@/lib/format";
import type { Conversation } from "@/lib/api/messages";

export function ConversationRow({ chat, onPress }: { chat: Conversation; onPress: () => void }) {
  const unread = chat.unread > 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Chat with ${chat.name}`} className="flex-row items-center px-4 py-3 active:opacity-70">
      <LiveRing userId={chat.otherId} size={54} showOnline>
        <UserAvatar name={chat.name} url={chat.avatarUrl} size={54} />
      </LiveRing>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between">
          <Text numberOfLines={1} className={`shrink text-[16px] ${unread ? "font-semibold text-paddock-text" : "text-paddock-text"}`}>
            {chat.name}
          </Text>
          {chat.lastAt && <Text className="ml-2 text-[12px] text-paddock-muted">{timeAgo(chat.lastAt)}</Text>}
        </View>
        <View className="mt-0.5 flex-row items-center">
          <Text numberOfLines={1} className={`flex-1 text-[14px] ${unread ? "text-paddock-text" : "text-paddock-muted"}`}>
            {chat.lastMessage ?? "No messages yet"}
          </Text>
          {unread && (
            <View className="ml-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-paddock-orange px-1.5">
              <Text className="text-[11px] font-semibold text-paddock-text">{chat.unread > 99 ? "99+" : chat.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
