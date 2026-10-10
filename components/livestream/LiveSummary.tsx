import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStreamRecap, type StreamRecap } from "@/lib/api/live";
import { compact, initialsOf, usd } from "@/lib/format";

const ORANGE = "#e8582f";
const MUTED = "#9a928d";

export type LiveSummaryData = { duration: string; peak: number; earnedCents: number; gifts: number };

const DEMO_RECAP: StreamRecap = {
  newFollowers: 148,
  chatMessages: 1290,
  supporters: [
    { userId: "1", name: "Marcus_GT", username: "marcus_gt", avatarUrl: null, totalCents: 4200, gifts: 10, topGift: "Aero Helmet" },
    { userId: "2", name: "Matteo_K", username: "matteo_k", avatarUrl: null, totalCents: 2500, gifts: 10, topGift: "Turbo Boost" },
    { userId: "3", name: "ApexHunter99", username: null, avatarUrl: null, totalCents: 1800, gifts: 18, topGift: "Pit Pass" },
  ],
};

function Stat({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: keyof typeof Ionicons.glyphMap; accent?: boolean }) {
  return (
    <View className="flex-1 border border-paddock-border bg-paddock-surface/70 p-4">
      <View className="flex-row items-center justify-between">
        <Text className={`text-[10px] font-bold uppercase tracking-[1.5px] ${accent ? "text-paddock-orange" : "text-paddock-muted"}`}>{label}</Text>
        <Ionicons name={icon} size={16} color={accent ? ORANGE : MUTED} />
      </View>
      <Text className={`mt-3 text-[28px] font-bold ${accent ? "text-paddock-peach" : "text-paddock-text"}`}>{value}</Text>
      <Text className="mt-1 text-[11px] text-paddock-muted">{sub}</Text>
    </View>
  );
}

function Supporter({ rank, s }: { rank: number; s: StreamRecap["supporters"][number] }) {
  return (
    <View className="flex-row items-center border-b border-paddock-border px-4 py-3">
      <Text className="w-7 text-[11px] font-bold text-paddock-orange">{String(rank).padStart(2, "0")}</Text>
      <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-paddock-border bg-paddock-bg">
        {s.avatarUrl ? <Image source={{ uri: s.avatarUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} /> : <Text className="text-[13px] font-semibold text-paddock-muted">{initialsOf(s.name).slice(0, 1)}</Text>}
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Text numberOfLines={1} className="text-[14px] font-semibold text-paddock-text">
          {s.name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-paddock-muted">
          {s.topGift ? `${s.topGift} · ` : ""}
          {s.gifts} {s.gifts === 1 ? "gift" : "gifts"}
        </Text>
      </View>
      <Text className="text-[14px] font-bold text-paddock-peach">{usd(s.totalCents).replace(/\.00$/, "")}</Text>
    </View>
  );
}

/** What the host sees after ending a stream: how it went, who supported it, and one button back. */
export function LiveSummary({
  data,
  title,
  streamId,
  startedAt,
  demo,
  onClose,
}: {
  data: LiveSummaryData;
  title: string;
  streamId: string;
  startedAt: string | null;
  demo?: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const recapQuery = useQuery({
    queryKey: ["liveRecap", streamId],
    queryFn: () => fetchStreamRecap(streamId, profile!.id, startedAt),
    enabled: !demo && !!profile,
  });
  const recap = demo ? DEMO_RECAP : recapQuery.data;
  const date = (startedAt ? new Date(startedAt) : new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const place = profile?.location?.split(",")[0];
  const handle = profile?.username ? `@${profile.username}` : "";

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-paddock-bg">
      <View className="flex-row items-center justify-between px-5 py-3">
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full bg-paddock-orange" />
          <Text className="ml-2.5 text-[11px] font-bold uppercase tracking-[2px] text-paddock-muted">Stream summary</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" className="h-8 w-8 items-center justify-center bg-paddock-surface active:opacity-60">
          <Ionicons name="close" size={18} color="#f2f0ee" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-6" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center border border-paddock-border bg-paddock-surface/70 p-3">
          <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-paddock-border bg-paddock-bg">
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} /> : <Text className="text-[18px] font-semibold text-paddock-muted">{initialsOf(profile?.name ?? "You")}</Text>}
          </View>
          <View className="ml-3 flex-1">
            <View className="flex-row items-center">
              <Text numberOfLines={1} className="flex-shrink text-[17px] font-bold text-paddock-text">
                {profile?.name ?? "You"}
              </Text>
              {profile?.is_verified && <Ionicons name="checkmark-circle" size={15} color={ORANGE} style={{ marginLeft: 5 }} />}
            </View>
            {handle ? (
              <Text numberOfLines={1} className="mt-0.5 text-[12.5px] text-paddock-muted">
                {handle}
              </Text>
            ) : null}
          </View>
        </View>

        <Text numberOfLines={3} className="mt-5 text-[26px] font-bold leading-[32px] text-paddock-text">
          {title || "Live stream"}
        </Text>
        <View className="mt-3 flex-row flex-wrap items-center gap-x-5 gap-y-1">
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={14} color={MUTED} />
            <Text className="ml-1.5 text-[12.5px] text-paddock-muted">{data.duration}</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={14} color={MUTED} />
            <Text className="ml-1.5 text-[12.5px] text-paddock-muted">{date}</Text>
          </View>
          {place ? (
            <View className="flex-row items-center">
              <Ionicons name="location-outline" size={14} color={MUTED} />
              <Text className="ml-1.5 text-[12.5px] text-paddock-muted">{place}</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-5 gap-3">
          <View className="flex-row gap-3">
            <Stat label="Peak viewers" value={compact(data.peak)} sub="Most watching at once" icon="eye-outline" />
            <Stat label="Earned" value={usd(data.earnedCents).replace(/\.00$/, "")} sub={`${compact(data.gifts)} ${data.gifts === 1 ? "gift" : "gifts"} · after fees`} icon="wallet-outline" accent />
          </View>
          <View className="flex-row gap-3">
            <Stat label="New followers" value={recap ? `+${compact(recap.newFollowers)}` : "—"} sub="Gained during the stream" icon="person-add-outline" />
            <Stat label="Chat" value={recap ? compact(recap.chatMessages) : "—"} sub="Messages sent" icon="chatbubbles-outline" />
          </View>
        </View>

        <View className="mt-6">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-paddock-muted">Top supporters</Text>
            {recap && recap.supporters.length > 0 && (
              <Text className="text-[11px] font-bold text-paddock-orange">
                {recap.supporters.length} {recap.supporters.length === 1 ? "supporter" : "supporters"}
              </Text>
            )}
          </View>
          <View className="border border-paddock-border bg-paddock-surface/70">
            {!recap && !demo && recapQuery.isPending ? (
              <View className="items-center py-8">
                <ActivityIndicator color={ORANGE} />
              </View>
            ) : recap && recap.supporters.length > 0 ? (
              recap.supporters.map((s, i) => <Supporter key={s.userId} rank={i + 1} s={s} />)
            ) : (
              <Text className="px-4 py-6 text-center text-[13px] text-paddock-muted">No gifts this time. They show up here when people send them.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      <View className="px-5 pb-2 pt-1">
        <Pressable onPress={onClose} accessibilityRole="button" className="h-12 flex-row items-center justify-center rounded-lg bg-paddock-orange active:opacity-80">
          <Text className="text-[13px] font-bold uppercase tracking-[1.5px] text-[#0b0b0d]">Back to Heatlap</Text>
          <Ionicons name="arrow-forward" size={16} color="#0b0b0d" style={{ marginLeft: 8 }} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
