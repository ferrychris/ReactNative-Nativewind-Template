import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfileCore, loadDecals, loadFan, loadPartners, loadRacer, loadTrack, loadWallet } from "@/lib/api/profiles";
import { fetchLiveStreamOf } from "@/lib/api/live";
import type { ProfileView } from "@/lib/types";
import { Profile } from "./Profile";

const STALE = 60_000;
// Sections nobody is looking at yet start after the first screen has painted.
const LATER_MS = 800;

/**
 * Loads a profile (yours when no username is given) in pieces: the core paints first, then each
 * section arrives on its own. Everything is keyed under ["profile"], so existing invalidations
 * (edit profile, new post, follow...) refresh all of it.
 */
export function ProfileScreen({ username }: { username?: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const viewerId = profile!.id;
  const qc = useQueryClient();

  const core = useQuery({
    queryKey: ["profile", "core", username ?? viewerId],
    queryFn: () => fetchProfileCore(username ? { username } : { id: viewerId }, viewerId),
    staleTime: STALE, // revisiting a profile shows it instantly; pull-to-refresh and mutations still refetch
  });
  const c = core.data ?? null;

  const [later, setLater] = useState(false);
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => setLater(true), LATER_MS);
    return () => clearTimeout(t);
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const id = c?.id ?? "";
  const isRacer = !!c?.isRacer;
  const isTrack = c?.userType === "track";
  const isMe = !!c?.isMe;
  const section = <T,>(name: string, enabled: boolean, fn: () => Promise<T>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({ queryKey: ["profile", "part", name, id], queryFn: fn, enabled: !!c && enabled, staleTime: STALE });

  // first tab of a racer is Car: header details, spots and partners come straight away; the rest waits
  const racer = section("racer", isRacer, () => loadRacer(id, new Date().getFullYear()));
  const decals = section("decals", isRacer || later, () => loadDecals(id));
  const partners = section("partners", isRacer, () => loadPartners(id));
  const live = section("live", !isMe, () => fetchLiveStreamOf(id));
  const track = section("track", isTrack, () => loadTrack({ id, name: c!.name, location: c!.location }, new Date().toISOString().slice(0, 10)));
  const fan = section("fan", !isTrack && later, () => loadFan(id));
  const wallet = section("wallet", isMe && later, () => loadWallet(id));

  const view: ProfileView | null = useMemo(() => {
    if (!c) return null;
    return {
      ...c,
      liveStreamId: live.data ?? null,
      decals: decals.data ?? [],
      racer: racer.data ? { ...racer.data, partners: partners.data ?? [] } : undefined,
      fan: fan.data,
      track: track.data,
      wallet: wallet.data,
      loading: { racer: isRacer && racer.isPending, decals: decals.isPending, fan: !isTrack && fan.isPending, track: isTrack && track.isPending },
    };
  }, [c, live.data, decals.data, decals.isPending, racer.data, racer.isPending, partners.data, fan.data, fan.isPending, track.data, track.isPending, wallet.data, isRacer, isTrack]);

  if (core.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg">
        <ActivityIndicator color="#e8582f" />
      </View>
    );
  }

  if (core.isError || !view) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg px-10">
        <Text className="text-[18px] text-paddock-text">{core.isError ? "Couldn't load this profile" : "User not found"}</Text>
        <Text className="mt-2 text-center text-[14px] text-paddock-muted">
          {core.isError ? "Check your connection and try again." : `We couldn't find @${username}.`}
        </Text>
        <Pressable
          onPress={() => (core.isError ? core.refetch() : router.back())}
          className="mt-6 h-12 items-center justify-center bg-paddock-orange px-8 active:opacity-80"
        >
          <Text className="text-[15px] font-semibold text-paddock-text">{core.isError ? "Retry" : "Go back"}</Text>
        </Pressable>
      </View>
    );
  }

  return <Profile view={view} refreshing={core.isRefetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["profile"] })} />;
}
