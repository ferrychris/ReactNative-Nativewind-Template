import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LiveRing } from "@/components/ui/LiveRing";
import { compact } from "@/lib/format";
import type { Person } from "@/lib/api/people";

type Props = {
  person: Person;
  onOpen: () => void;
  onToggleFollow: () => void;
  onMessage: () => void;
  messaging?: boolean;
};

/** One person in Friends / search results: open profile, follow back, message. */
export function PersonRow({ person, onOpen, onToggleFollow, onMessage, messaging }: Props) {
  const badge = person.isRacer ? `${person.carNumber ? `#${person.carNumber} ` : ""}${person.racingClass ?? "Racer"}`.trim() : person.userType === "track" ? "Track" : null;
  const followLabel = person.iFollow ? (person.followsMe ? "Friends" : "Following") : person.followsMe ? "Follow back" : "Follow";

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${person.name}'s profile`} className="flex-row items-center px-4 py-3 active:opacity-70">
      <LiveRing userId={person.id} size={50} showOnline>
        <UserAvatar name={person.name} url={person.avatarUrl} size={50} />
      </LiveRing>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="shrink text-[16px] text-paddock-text">
            {person.name}
          </Text>
          {person.isVerified && <Ionicons name="checkmark-circle" size={15} color="#e8582f" style={{ marginLeft: 5 }} />}
          {badge && (
            <View className="ml-2 rounded border border-paddock-border bg-paddock-surface px-1.5 py-[1px]">
              <Text className="text-[10.5px] uppercase tracking-[0.5px] text-paddock-muted">{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-[13px] text-paddock-muted">
          @{person.username} • {compact(person.followers)} {person.followers === 1 ? "follower" : "followers"}
        </Text>
      </View>

      <Pressable
        onPress={onMessage}
        hitSlop={8}
        accessibilityLabel={`Message ${person.name}`}
        className="mr-2 h-9 w-9 items-center justify-center border border-paddock-border active:opacity-60"
      >
        {messaging ? <ActivityIndicator size="small" color="#f2f0ee" /> : <Ionicons name="chatbubble-outline" size={17} color="#f2f0ee" />}
      </Pressable>
      <Pressable
        onPress={onToggleFollow}
        hitSlop={6}
        accessibilityRole="button"
        className={`h-9 min-w-[92px] items-center justify-center px-3 active:opacity-80 ${person.iFollow ? "border border-paddock-border bg-paddock-surface" : "bg-paddock-orange"}`}
      >
        <Text className="text-[13px] font-semibold text-paddock-text">{followLabel}</Text>
      </Pressable>
    </Pressable>
  );
}
