import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { LiveVideo } from "./LiveVideo";
import { LiveManageSheet } from "./LiveManageSheet";
import { LiveSummary } from "./LiveSummary";
import { CameraOffCover, LiveChatLines, LiveGiftPill, LiveHeader, LiveInputBar, LiveMetaLine, LiveStatusRow } from "./LiveOverlay";
import {
  endLiveStream,
  fetchEarningsCents,
  fetchGiftCount,
  fetchStream,
  liveError,
  publishLiveStream,
  type ChatMessage,
  type GiftEvent,
} from "@/lib/api/live";
import { useLiveRoom } from "@/lib/livekit/useLiveRoom";
import { useLiveChat } from "@/lib/hooks/useLiveChat";
import { useLiveGifts } from "@/lib/hooks/useLiveGifts";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";

const ORANGE = "#ec6a3a";
const VISIBLE_CHAT = 5;
const BANNER_MS = 5000;

/** Sample content for design review. Only available in development builds at /livestream/preview. */
const DEMO_CHAT: ChatMessage[] = [
  { id: "d1", userId: "d1", name: "Matteo_K", avatarUrl: null, body: "Sector 2 telemetry looked insane through Ascari!", createdAt: "" },
  { id: "d2", userId: "d2", name: "ApexHunter99", avatarUrl: null, body: "What tire compound are you starting tomorrow?", createdAt: "" },
  { id: "d3", userId: "d3", name: "ElenaMotorsport", avatarUrl: null, body: "Good luck in Q3 Elena!! Let's get P1 🏆", createdAt: "" },
  { id: "d4", userId: "d4", name: "SimRacer_Dave", avatarUrl: null, body: "Engine sounds crisp in the garage today 🔥", createdAt: "" },
];
const DEMO_GIFT = { event: { id: "g", senderId: "m", senderName: "Marcus_GT", senderAvatarUrl: null, giftId: "g", giftName: "Aero Helmet", giftSlug: null, tier: null, emoji: "🪖", amountCents: 500 } as GiftEvent, count: 3 };

const duration = (fromIso: string | null, toIso?: string | null) => {
  if (!fromIso) return "0:00";
  const secs = Math.max(0, Math.floor(((toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

type Banner = { event: GiftEvent; count: number };
type Summary = { duration: string; peak: number; earnedCents: number; gifts: number };

export function LiveRoom({ streamId, initialFacing = "user" }: { streamId: string; initialFacing?: "user" | "environment" }) {
  const demo = __DEV__ && streamId === "preview";
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const live = useLiveRoom({ streamId, role: "host", enabled: !demo, initialFacing });
  const chat = useLiveChat(streamId, !demo);

  const [published, setPublished] = useState(demo);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishAttempt, setPublishAttempt] = useState(0);
  const [peak, setPeak] = useState(demo ? 1842 : 0);
  const [banner, setBanner] = useState<Banner | null>(demo ? DEMO_GIFT : null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ending, setEnding] = useState(false);
  const [draft, setDraft] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const micBeforePause = useRef(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hideChat, setHideChat] = useState(false); // only on your own screen
  const [hideGifts, setHideGifts] = useState(false); // only on your own screen
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peakRef = useRef(peak);
  peakRef.current = peak;

  const stream = useQuery({ queryKey: ["liveStream", streamId], queryFn: () => fetchStream(streamId), enabled: !demo });
  const earnings = useQuery({ queryKey: ["liveEarnings", streamId], queryFn: () => fetchEarningsCents(streamId), enabled: !demo && published });
  const giftCount = useQuery({ queryKey: ["liveGifts", streamId], queryFn: () => fetchGiftCount(streamId), enabled: !demo && published });
  const earnedCents = demo ? 14350 : earnings.data ?? 0;
  const gifts = demo ? 27 : giftCount.data ?? 0;
  const viewers = demo ? 1842 : live.viewers;
  const messages = demo ? DEMO_CHAT : chat.messages;

  const title = demo ? "Monza // FP3 debrief" : stream.data?.title ?? "";
  const place = (profile?.location ?? (demo ? "Pit bay 04" : "Paddock")).split(",")[0];

  /* ---- video is flowing: only now go live and tell followers ---- */
  useEffect(() => {
    if (demo || published || live.status !== "connected") return;
    publishLiveStream(streamId)
      .then(() => {
        setPublished(true);
        qc.invalidateQueries({ queryKey: ["liveStream", streamId] });
      })
      .catch((e) => setPublishError(liveError(e)));
  }, [demo, published, live.status, streamId, qc, publishAttempt]);

  useEffect(() => {
    setPeak((p) => Math.max(p, viewers));
  }, [viewers]);

  const finish = (endedAt?: string | null) => {
    setSummary({ duration: duration(stream.data?.startedAt ?? (demo ? new Date(Date.now() - 42 * 60_000).toISOString() : null), endedAt), peak: peakRef.current, earnedCents, gifts });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /* ---- every gift in the room: banner + totals ---- */
  useLiveGifts(
    streamId,
    (event) => {
      setBanner((cur) => ({ event, count: cur && cur.event.senderId === event.senderId && cur.event.giftId === event.giftId ? cur.count + 1 : 1 }));
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
      qc.invalidateQueries({ queryKey: ["liveEarnings", streamId] });
      qc.invalidateQueries({ queryKey: ["liveGifts", streamId] });
    },
    !demo,
  );

  /* ---- the stream being ended elsewhere ---- */
  useEffect(() => {
    if (demo) return;
    const channel = newChannel(`room:${streamId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId}` }, (payload) => {
        const row = payload.new as { status?: string; ended_at?: string };
        if (row.status === "ended") {
          live.disconnect();
          finishRef.current(row.ended_at);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, demo, qc]);

  const end = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("End this stream?", "It will end for everyone watching.", [
      { text: "Keep streaming", style: "cancel" },
      {
        text: "End stream",
        style: "destructive",
        onPress: async () => {
          if (ending) return;
          setEnding(true);
          try {
            live.disconnect();
            if (!demo) await endLiveStream(streamId, peak);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            finish(new Date().toISOString());
          } catch (e) {
            Alert.alert("Couldn't end the stream", liveError(e));
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  };

  /** Leaving without ever having gone live (connection failed): just remove the draft. */
  const abandon = async () => {
    live.disconnect();
    if (!demo) await endLiveStream(streamId, 0).catch(() => {});
    router.replace("/dashboard");
  };

  const leave = () => router.replace("/dashboard");

  /** Pause = camera and microphone off together; viewers see a "Stream paused" cover. Resume puts both back as they were. */
  const togglePause = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!paused) {
      micBeforePause.current = live.micOn;
      setPaused(true);
      await live.setCamera(false);
      await live.setMic(false);
    } else {
      setPaused(false);
      await live.setCamera(true);
      if (micBeforePause.current) await live.setMic(true);
    }
  };

  /** The host talks to the room like anyone else. Chat only opens once the stream is actually live. */
  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = replyTo;
    setDraft("");
    setReplyTo(null);
    if (demo) return;
    const sent = await chat.send(text, target?.id);
    if (!sent) {
      setDraft(text); // give the text back so nothing is lost
      setReplyTo(target);
    }
  };

  /* ---- after the stream ---- */
  if (summary) {
    return <LiveSummary data={summary} title={title} streamId={streamId} startedAt={stream.data?.startedAt ?? null} demo={demo} onClose={leave} />;
  }

  if (!demo && stream.isPending) return <View className="flex-1 bg-black" />;
  if (!demo && (stream.isError || !stream.data)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paddock-bg px-10">
        <Text className="text-[18px] text-paddock-text">{stream.isError ? "Couldn't load this stream" : "Stream not found"}</Text>
        <Pressable onPress={leave} className="mt-6 h-12 items-center justify-center bg-paddock-orange px-8 active:opacity-80">
          <Text className="text-[15px] font-semibold text-paddock-text">Go home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  /* ---- couldn't connect to video ---- */
  if (!demo && (live.status === "error" || publishError)) {
    const needsBuild = live.error === "DEV_BUILD_REQUIRED";
    return (
      <SafeAreaView edges={["top", "bottom"]} className="flex-1 items-center justify-center bg-paddock-bg px-8">
        <Ionicons name={needsBuild ? "construct-outline" : "cloud-offline-outline"} size={44} color={ORANGE} />
        <Text className="mt-4 text-center text-[20px] text-paddock-text">{needsBuild ? "This needs a development build" : "Couldn't start your stream"}</Text>
        <Text className="mt-2 text-center text-[14px] leading-5 text-paddock-muted">
          {needsBuild
            ? "Live video uses native code that Expo Go doesn't include. Open the app from a development build (or the browser) to go live."
            : publishError ?? live.error}
        </Text>
        {!needsBuild && (
          <Pressable onPress={publishError ? () => { setPublishError(null); setPublishAttempt((n) => n + 1); } : live.retry} className="mt-6 h-12 w-full items-center justify-center bg-paddock-orange active:opacity-80">
            <Text className="text-[15px] font-semibold text-paddock-text">Try again</Text>
          </Pressable>
        )}
        <Pressable onPress={abandon} className="mt-4 active:opacity-70">
          <Text className="text-[14px] text-paddock-muted">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const connecting = !demo && (live.status === "connecting" || !published);

  return (
    <View className="flex-1 bg-black">
      {/* Your camera, as viewers see it */}
      <View className="absolute inset-0">
        <LiveVideo track={demo ? null : live.videoTrack} mirror={live.facing === "user"} />
        {!live.camOn && <CameraOffCover name={profile?.name ?? "You"} avatarUrl={profile?.avatar_url} label={paused ? "Stream paused" : "Your camera is off"} />}
        {paused && (
          <View className="absolute inset-x-0 bottom-[34%] items-center">
            <Pressable onPress={togglePause} accessibilityRole="button" accessibilityLabel="Resume stream" className="h-12 flex-row items-center bg-paddock-orange px-8 active:opacity-80">
              <Ionicons name="play" size={18} color="#0b0b0d" />
              <Text className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-[#0b0b0d]">Resume stream</Text>
            </Pressable>
          </View>
        )}
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-48" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0.7), rgba(11,11,13,0))" }} />
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[48%]" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0), rgba(11,11,13,0.78) 50%, #0b0b0d)" }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1 justify-between">
        <View>
          <LiveHeader
            name={profile?.name ?? "You"}
            avatarUrl={profile?.avatar_url}
            verified={profile?.is_verified}
            right={
              <>
                <Pressable
                  hitSlop={12}
                  onPress={togglePause}
                  disabled={connecting}
                  accessibilityLabel={paused ? "Resume stream" : "Pause stream"}
                  className={`mr-5 active:opacity-60 ${connecting ? "opacity-40" : ""}`}
                >
                  <Ionicons name={paused ? "play-circle-outline" : "pause-circle-outline"} size={27} color={paused ? ORANGE : "#f2f0ee"} />
                </Pressable>
                <Pressable
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    live.flipCamera();
                  }}
                  disabled={!live.camOn || connecting}
                  accessibilityLabel={live.facing === "user" ? "Switch to back camera" : "Switch to front camera"}
                  className={`mr-5 active:opacity-60 ${!live.camOn || connecting ? "opacity-40" : ""}`}
                >
                  <Ionicons name="camera-reverse-outline" size={26} color="#f2f0ee" />
                </Pressable>
                <Pressable
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setManageOpen(true);
                  }}
                  accessibilityLabel="Manage live"
                  className="mr-5 active:opacity-60"
                >
                  <Ionicons name="options-outline" size={24} color="#f2f0ee" />
                </Pressable>
                <Pressable hitSlop={12} onPress={connecting && !demo ? abandon : end} disabled={ending} accessibilityRole="button" accessibilityLabel={connecting ? "Cancel" : "End stream"} className="active:opacity-60">
                  <Text className="text-[16px] font-bold text-paddock-orange">{connecting && !demo ? "Cancel" : "End"}</Text>
                </Pressable>
              </>
            }
          />

          <LiveStatusRow
            connecting={connecting}
            viewers={viewers}
            right={
              <View accessibilityLabel={`${gifts} gifts received`} className="flex-row items-center rounded-full border border-white/15 bg-black/55 px-3 py-1.5">
                <Ionicons name="gift-outline" size={15} color="#f2f0ee" />
                <Text className="ml-2 text-[15px] font-bold text-paddock-orange">{gifts.toLocaleString("en-US")}</Text>
                <Text className="ml-1.5 text-[10px] font-bold uppercase tracking-[1px] text-paddock-text/70">{gifts === 1 ? "Gift" : "Gifts"}</Text>
              </View>
            }
          />

          <LiveMetaLine place={place} title={title} />

          {live.status === "reconnecting" && (
            <View className="mt-3 items-center">
              <View className="flex-row items-center bg-black/70 px-4 py-2">
                <ActivityIndicator size="small" color={ORANGE} />
                <Text className="ml-3 text-[14px] text-paddock-text">Connection lost. Reconnecting…</Text>
              </View>
            </View>
          )}

          {connecting && !demo && (
            <View className="mt-10 items-center">
              <ActivityIndicator color={ORANGE} />
              <Text className="mt-3 text-[14px] text-paddock-text/80">Starting your stream…</Text>
            </View>
          )}
        </View>

        <View>
          {banner && !hideGifts && <LiveGiftPill name={banner.event.senderName} avatarUrl={banner.event.senderAvatarUrl} giftName={banner.event.giftName} emoji={banner.event.emoji} count={banner.count} />}

          {!hideChat && <LiveChatLines messages={messages} max={VISIBLE_CHAT} onReply={setReplyTo} emptyText={connecting ? undefined : "Chat will show up here once people join."} />}

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
            disabled={connecting}
            replyingTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            placeholder={connecting ? "Chat opens when you're live" : "Say something to your viewers…"}
            actions={[
              {
                icon: live.camOn ? "videocam-outline" : "videocam-off-outline",
                label: live.camOn ? "Turn camera off" : "Turn camera on",
                off: !live.camOn,
                onPress: () => {
                  Haptics.selectionAsync();
                  live.setCamera(!live.camOn);
                },
              },
              {
                icon: live.micOn ? "mic-outline" : "mic-off-outline",
                label: live.micOn ? "Mute microphone" : "Turn microphone on",
                off: !live.micOn,
                onPress: () => {
                  Haptics.selectionAsync();
                  live.setMic(!live.micOn);
                },
              },
            ]}
          />
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>

      <LiveManageSheet
        visible={manageOpen}
        onClose={() => setManageOpen(false)}
        sections={[
          {
            title: "Camera and sound",
            items: [
              { key: "pause", icon: paused ? "play-outline" : "pause-outline", label: paused ? "Resume stream" : "Pause stream", hint: paused ? "Viewers see a paused cover" : "Camera and microphone off for a moment", onPress: () => { setManageOpen(false); togglePause(); } },
              { key: "cam", icon: live.camOn ? "videocam-outline" : "videocam-off-outline", label: "Camera", hint: live.camOn ? "On: viewers can see you" : "Off: viewers see a cover", value: live.camOn, onPress: () => live.setCamera(!live.camOn) },
              { key: "mic", icon: live.micOn ? "mic-outline" : "mic-off-outline", label: "Microphone", hint: live.micOn ? "On: viewers can hear you" : "Muted", value: live.micOn, onPress: () => live.setMic(!live.micOn) },
              { key: "flip", icon: "camera-reverse-outline", label: live.facing === "user" ? "Switch to back camera" : "Switch to front camera", disabled: !live.camOn || paused, onPress: () => live.flipCamera() },
            ],
          },
          {
            title: "On your screen only",
            items: [
              { key: "chat", icon: "chatbubbles-outline", label: "Show chat", hint: "Viewers can still chat", value: !hideChat, onPress: () => setHideChat((v) => !v) },
              { key: "gifts", icon: "gift-outline", label: "Show gift alerts", hint: "Gifts still count", value: !hideGifts, onPress: () => setHideGifts((v) => !v) },
            ],
          },
          {
            title: "Stream",
            items: [
              {
                key: "share",
                icon: "arrow-redo-outline",
                label: "Share stream",
                onPress: () => {
                  Share.share({ message: `${profile?.name ?? "I"} ${profile?.name ? "is" : "am"} live on Heatlap${title ? `: ${title}` : ""}` }).catch(() => {});
                },
              },
              { key: "end", icon: "stop-circle-outline", label: "End stream", destructive: true, disabled: ending, onPress: () => { setManageOpen(false); end(); } },
            ],
          },
        ]}
      />
    </View>
  );
}
