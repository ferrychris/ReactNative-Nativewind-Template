import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { setFollow } from "@/lib/api/posts";
import { LiveVideo } from "./LiveVideo";
import { CameraOffCover, LiveChatLines, LiveGiftPill, LiveHeader, LiveInputBar, LiveMetaLine, LiveStatusRow } from "./LiveOverlay";
import { GiftSheet } from "./GiftSheet";
import { fetchStreamWithHost, type ChatMessage } from "@/lib/api/live";
import { useLiveRoom } from "@/lib/livekit/useLiveRoom";
import { useLiveChat } from "@/lib/hooks/useLiveChat";
import { useLiveGifts } from "@/lib/hooks/useLiveGifts";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";

const ORANGE = "#ec6a3a";
const VISIBLE_CHAT = 6;
const BANNER_MS = 4000;

/** The viewer's side of a live stream: watch, chat, chat, and send gifts. */
export function WatchLive({ streamId }: { streamId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [banner, setBanner] = useState<{ id: string; name: string; avatarUrl: string | null; giftName: string; emoji: string; key: string; count: number } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stream = useQuery({ queryKey: ["watchStream", streamId], queryFn: () => fetchStreamWithHost(streamId) });
  const streamOpen = stream.data?.status === "live";
  const live = useLiveRoom({ streamId, role: "viewer", enabled: streamOpen });
  const chat = useLiveChat(streamId, streamOpen);

  // follow the host from the header
  const qc = useQueryClient();
  const { profile } = useAuth();
  const hostId = stream.data?.host.id;
  const followQ = useQuery({
    queryKey: ["followsHost", profile?.id, hostId],
    enabled: !!profile && !!hostId && profile.id !== hostId,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", profile!.id).eq("following_id", hostId!).maybeSingle();
      return !!data;
    },
  });
  const isFollowing = followQ.data;
  const toggleFollow = async () => {
    if (!profile || !hostId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const next = !isFollowing;
    qc.setQueryData(["followsHost", profile.id, hostId], next);
    try {
      await setFollow(hostId, profile.id, next);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["feed", "following"] });
    } catch {
      qc.setQueryData(["followsHost", profile.id, hostId], !next);
      Alert.alert("Couldn't update follow", "Check your connection and try again.");
    }
  };
  const shareStream = async () => {
    try {
      await Share.share({ message: `${stream.data?.host.name ?? "Someone"} is live on Heatlap: ${stream.data?.title ?? ""}`.trim() });
    } catch {
      // cancelled
    }
  };

  // everyone in the room sees each gift as it lands (the same sender giving the same gift again adds to the count)
  const announceGift = useLiveGifts(streamId, (e) => {
    setBanner((cur) => ({ id: e.id, name: e.senderName, avatarUrl: e.senderAvatarUrl, giftName: e.giftName, emoji: e.emoji, key: `${e.senderId}:${e.giftId}`, count: cur && cur.key === `${e.senderId}:${e.giftId}` ? cur.count + 1 : 1 }));
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  });

  // The host pressing End (or the webhook closing a dead stream) arrives as a status change
  useEffect(() => {
    const channel = newChannel(`watch:${streamId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId}` }, (payload) => {
        if ((payload.new as { status?: string }).status === "ended") setEnded(true);
      })
      .subscribe();
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/dashboard"));
  const openHost = () => {
    const username = stream.data?.host.username;
    if (username) router.push({ pathname: "/user/[username]", params: { username } });
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = replyTo;
    setDraft("");
    setReplyTo(null);
    const sent = await chat.send(text, target?.id);
    if (!sent) {
      setDraft(text);
      setReplyTo(target);
    }
  };

  /* ---- states without a picture ---- */
  if (stream.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  const message = (title: string, body: string, action = "Back") => (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 items-center justify-center bg-paddock-bg px-10">
      <Ionicons name="radio-outline" size={44} color={ORANGE} />
      <Text className="mt-4 text-center text-[22px] font-semibold text-paddock-text">{title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-5 text-paddock-muted">{body}</Text>
      <Pressable onPress={close} className="mt-6 h-12 w-full items-center justify-center bg-paddock-orange active:opacity-80">
        <Text className="text-[15px] font-semibold text-paddock-text">{action}</Text>
      </Pressable>
    </SafeAreaView>
  );

  if (stream.isError) return message("Couldn't load this stream", "Check your connection and try again.");
  if (!stream.data) return message("Stream not available", "It may have ended, or it's only for followers.");
  if (ended || stream.data.status === "ended" || live.hostLeft) return message("This stream has ended", `${stream.data.host.name} is no longer live.`);
  if (stream.data.status === "scheduled") return message("Not live yet", `${stream.data.host.name} is getting ready. Try again in a moment.`);
  if (live.status === "error") {
    const needsBuild = live.error === "DEV_BUILD_REQUIRED";
    return message(
      needsBuild ? "This needs a development build" : "Couldn't join the stream",
      needsBuild ? "Live video uses native code that Expo Go doesn't include. Open the app from a development build (or the browser) to watch." : live.error ?? "Try again.",
    );
  }

  const host = stream.data.host;
  const waitingForVideo = live.status === "connecting" || !live.videoTrack;

  return (
    <View className="flex-1 bg-black">
      <View className="absolute inset-0">
        <LiveVideo track={live.videoTrack} />
        {live.hostCameraOff && <CameraOffCover name={host.name} avatarUrl={host.avatarUrl} label={live.hostMicOff ? "Stream paused" : `${host.name.split(" ")[0]}'s camera is off`} />}
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-48" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0.7), rgba(11,11,13,0))" }} />
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[55%]" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0), rgba(11,11,13,0.8) 50%, #0b0b0d)" }} />
      </View>

      <SafeAreaView edges={["top"]} className="z-10">
        <LiveHeader
          name={host.name}
          avatarUrl={host.avatarUrl}
          verified={host.isVerified}
          onPressHost={openHost}
          follow={profile && profile.id !== host.id ? { following: !!isFollowing, onPress: toggleFollow } : null}
          right={
            <Pressable hitSlop={14} onPress={close} accessibilityLabel="Leave stream" className="active:opacity-60">
              <Ionicons name="close" size={26} color="#f2f0ee" />
            </Pressable>
          }
        />
        <LiveStatusRow connecting={waitingForVideo} viewers={live.viewers} />
        <LiveMetaLine place={host.location} title={stream.data.title} />

        {live.status === "reconnecting" && (
          <View className="mt-3 items-center">
            <View className="flex-row items-center bg-black/70 px-4 py-2">
              <ActivityIndicator size="small" color={ORANGE} />
              <Text className="ml-3 text-[14px] text-paddock-text">Reconnecting…</Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {waitingForVideo && (
        <View pointerEvents="none" className="absolute inset-x-0 top-[38%] items-center">
          <ActivityIndicator color={ORANGE} />
          <Text className="mt-3 text-[14px] text-paddock-text/80">Joining the stream…</Text>
        </View>
      )}

      {/* Browsers keep the sound off until you tap */}
      {live.audioBlocked && (
        <View className="absolute inset-x-0 top-[30%] items-center">
          <Pressable onPress={live.startAudio} accessibilityRole="button" className="flex-row items-center bg-paddock-orange px-5 py-3 active:opacity-80">
            <Ionicons name="volume-high" size={20} color="#f2f0ee" />
            <Text className="ml-2 text-[15px] font-semibold text-paddock-text">Tap to turn sound on</Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end" pointerEvents="box-none">
        <SafeAreaView edges={["bottom"]}>
          {banner && <LiveGiftPill key={banner.id} name={banner.name} avatarUrl={banner.avatarUrl} giftName={banner.giftName} emoji={banner.emoji} count={banner.count} />}

          <LiveChatLines messages={chat.messages} max={VISIBLE_CHAT} onReply={setReplyTo} />

          {chat.error && (
            <Text accessibilityRole="alert" className="px-4 pb-1 text-[13px] text-[#ff7a5c]">
              {chat.error}
            </Text>
          )}

          <LiveInputBar
            draft={draft}
            setDraft={setDraft}
            onSubmit={submit}
            sending={chat.sending}
            replyingTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            placeholder="Say something…"
            actions={[
              {
                icon: "gift-outline",
                label: "Send a gift",
                onPress: () => {
                  Haptics.selectionAsync();
                  if (stream.data?.allowGifts) setGiftsOpen(true);
                  else Alert.alert("Gifts are off", `${host.name} isn't taking gifts on this stream.`);
                },
              },
              { icon: "arrow-redo-outline", label: "Share stream", onPress: shareStream },
            ]}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
      <GiftSheet
        streamId={streamId}
        hostName={host.name}
        visible={giftsOpen}
        onClose={() => setGiftsOpen(false)}
        onSent={(gift, txId) => {
          if (!profile) return;
          // my own gift shows for me straight away, as "<my name> gave ..." like everyone else sees it
          announceGift({ id: txId ?? `local-${Date.now()}`, senderId: profile.id, senderName: profile.name, senderAvatarUrl: profile.avatar_url, giftId: gift.id, giftName: gift.name, giftSlug: gift.slug, tier: gift.tier, emoji: gift.emoji, amountCents: gift.priceCents });
        }}
      />
    </View>
  );
}
