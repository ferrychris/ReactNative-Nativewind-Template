import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useIsOnline, useLiveStreams } from "@/lib/presence";

/**
 * Wraps an avatar to show who is around:
 *  - live now: an orange ring and a LIVE tag; tapping the avatar opens the stream
 *  - online (when `showOnline`): a small green dot
 * Not live and not online: renders the avatar untouched.
 */
export function LiveRing({ userId, size, showOnline = false, children }: { userId?: string | null; size: number; showOnline?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const streams = useLiveStreams();
  const online = useIsOnline(userId);
  const streamId = userId ? streams.get(userId) : undefined;

  if (streamId) {
    const pad = Math.max(2, Math.round(size * 0.06));
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          router.push({ pathname: "/livestream/watch/[id]", params: { id: streamId } });
        }}
        accessibilityRole="button"
        accessibilityLabel="Live now: watch"
        className="items-center active:opacity-80"
      >
        <View style={{ borderRadius: (size + pad * 2 + 4) / 2, padding: pad }} className="border-2 border-paddock-orange">
          {children}
        </View>
        <View className="-mt-2 rounded-sm bg-paddock-orange px-1.5 py-[1px]">
          <Text style={{ fontSize: Math.max(8, Math.round(size * 0.18)) }} className="font-extrabold uppercase tracking-[0.8px] text-white">
            Live
          </Text>
        </View>
      </Pressable>
    );
  }

  if (showOnline && online) {
    const dot = Math.max(10, Math.round(size * 0.26));
    return (
      <View>
        {children}
        <View
          accessibilityLabel="Online"
          style={{ width: dot, height: dot, borderRadius: dot / 2, right: 0, bottom: 0 }}
          className="absolute border-2 border-paddock-bg bg-[#22c55e]"
        />
      </View>
    );
  }

  return <>{children}</>;
}
