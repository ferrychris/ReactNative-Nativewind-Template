import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useMuted } from "@/lib/soundPref";
import { LiveRing } from "@/components/ui/LiveRing";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePostActions } from "@/lib/hooks/usePostActions";
import { diagnoseImage } from "@/lib/media";
import { PostMenu } from "./PostMenu";
import { compact, initialsOf, timeAgoLong } from "@/lib/format";
import type { FeedPost } from "@/lib/types";

type Props = {
  post: FeedPost;
  /** True when this card is the one on screen (controls video playback). */
  active?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  /** Rendered above the tab bar, which already covers the bottom safe area. */
  insideTabs?: boolean;
};

function Avatar({ post, size, className = "" }: { post: FeedPost; size: number; className?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className={`items-center justify-center overflow-hidden border border-[#2b2f3a] bg-[#1a1c22] ${className}`}>
      {post.author.avatarUrl ? (
        <Image source={{ uri: post.author.avatarUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text className="font-semibold text-[#8a92a0]" style={{ fontSize: size * 0.34 }}>
          {initialsOf(post.author.name)}
        </Text>
      )}
    </View>
  );
}

// the player is an imperative native object: set its flag outside the component body
const applyMuted = (player: { muted: boolean }, value: boolean) => {
  player.muted = value;
};

function PostVideo({ uri, active }: { uri: string; active: boolean }) {
  const [muted] = useMuted();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  useEffect(() => {
    applyMuted(player, muted);
  }, [muted, player]);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ width: "100%", height: "100%" }} />;
}

function MediaBackground({ post, active }: { post: FeedPost; active: boolean }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const first = post.media[0];
  if (!first) return null;
  if (!first.url || loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-[#12141a] px-10">
        <Ionicons name="image-outline" size={40} color="#4a5163" />
        <Text className="mt-3 text-[13px] text-[#6b7385]">Media unavailable</Text>
        <Text selectable className="mt-3 text-center text-[12px] leading-[17px] text-[#c3c8d2]">
          {first.url ? `Image failed to load: ${loadError}${detail ? `\n${detail}` : ""}` : `Couldn't create a link: ${first.error ?? "unknown reason"}`}
        </Text>
      </View>
    );
  }

  if (first.kind === "video") return <PostVideo uri={first.url} active={active} />;
  if (post.media.length === 1) {
    return (
      <Image
        source={{ uri: first.url }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
        priority="high"
        onError={(e) => {
          setLoadError(String(e.error ?? "unknown error"));
          diagnoseImage(first.url).then((d) => {
            setDetail(d);
            console.warn("[post-media] image failed to load:", d, first.url.split("?")[0]);
          });
        }}
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {post.media.map((m) => (
          <Image key={m.id} source={{ uri: m.url }} contentFit="cover" cachePolicy="memory-disk" transition={200} style={{ width, height: "100%" }} />
        ))}
      </ScrollView>
      <View className="absolute left-0 right-0 top-[18%] flex-row justify-center gap-1.5">
        {post.media.map((m, i) => (
          <View key={m.id} className={`h-1.5 rounded-full ${i === page ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
        ))}
      </View>
    </View>
  );
}

export function PostCard({ post, active = true, showBackButton = false, onBack, insideTabs = false }: Props) {
  const router = useRouter();
  const { toggleLike, toggleSave, toggleFollow } = usePostActions();
  const [muted, toggleMuted] = useMuted();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const hasMedia = post.media.length > 0;

  const openProfile = () => {
    if (post.author.username) router.push({ pathname: "/user/[username]", params: { username: post.author.username } });
  };

  const share = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: `${post.author.name} on Heatlap${post.content ? `: “${post.content.slice(0, 140)}”` : ""}` });
    } catch {
      // cancelled
    }
  };

  const hasTelemetry = !!(post.telemetry.trackTemp || post.telemetry.gripIdx);

  return (
    <View className="flex-1 bg-[#090a0d]">
      {hasMedia && (
        <View className="absolute inset-0">
          <MediaBackground post={post} active={active} />
          {/* scrims keep the text legible on any photo */}
          <View pointerEvents="none" className="absolute inset-x-0 top-0 h-40" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(9,10,13,0.75), rgba(9,10,13,0))" }} />
          <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[55%]" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(9,10,13,0), rgba(9,10,13,0.92))" }} />
        </View>
      )}

      {/* Window insets, not <SafeAreaView>: that one measures its own position on screen, so cards inside the
          paging list got the wrong top inset while sliding in. The tab bar already covers the bottom edge. */}
      <View className="flex-1 justify-between" style={{ paddingTop: insets.top, paddingBottom: insideTabs ? 0 : insets.bottom }}>
        {/* Top header row */}
        <View className={`flex-row items-start justify-between px-6 ${insideTabs ? "pt-14" : "pt-3"}`}>
          <View className="flex-row items-center">
            {showBackButton && (
              <Pressable
                hitSlop={12}
                onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace("/dashboard"))}
                accessibilityLabel="Back"
                className="mr-3 active:opacity-60"
              >
                <Ionicons name="arrow-back" size={22} color="#c3c8d2" />
              </Pressable>
            )}
          </View>
          <View className="flex-row items-center">
            {post.visibility === "followers_only" && <Ionicons name="lock-closed" size={13} color="#6b7385" style={{ marginRight: 6 }} />}
            <Text className="text-[13px] font-semibold uppercase tracking-[2px] text-[#6b7385]">{timeAgoLong(post.createdAt)}</Text>
          </View>
        </View>

        {/* Text posts: the bulletin quote */}
        {!hasMedia ? (
          <View className="my-auto px-7 pr-20">
            <View className="mb-3 h-[3.5px] w-6 rounded-full bg-[#e8582f]" />
            {post.headline ? <Text className="mb-5 text-[15px] font-bold uppercase tracking-[2px] text-[#ffb4a0]">{post.headline}</Text> : <View className="mb-5" />}
            <Text className="text-[21px] font-normal leading-[33px] text-[#f2f4f8]" numberOfLines={12}>
              “{post.content}”
            </Text>
            <View className="mt-8 flex-row items-center">
              <View className="h-[1px] flex-1 bg-[#1f222a]" />
              <Text className="mx-4 text-[10.5px] font-bold uppercase tracking-[2px] text-[#5b6272]">{post.sourceLabel ?? post.author.name}</Text>
              <View className="h-[1px] flex-1 bg-[#1f222a]" />
            </View>
          </View>
        ) : (
          <View />
        )}

        {/* Right action rail */}
        <View className="absolute bottom-0 right-5 z-20 items-center gap-4">
          <View className="mb-1 items-center">
            <Pressable onPress={openProfile} accessibilityLabel={`Open ${post.author.name}'s profile`}>
              <LiveRing userId={post.author.id} size={46}>
                <Avatar post={post} size={46} />
              </LiveRing>
            </Pressable>
            {!post.isMine && (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  toggleFollow(post);
                }}
                accessibilityLabel={post.following ? "Unfollow" : "Follow"}
                className={`absolute -bottom-2 h-5 w-5 items-center justify-center rounded-full border-2 border-[#090a0d] active:scale-90 ${
                  post.following ? "bg-[#22c55e]" : "bg-[#e8582f]"
                }`}
              >
                <Ionicons name={post.following ? "checkmark" : "add"} size={12} color="#ffffff" />
              </Pressable>
            )}
          </View>

          <Pressable
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              toggleLike(post);
            }}
            accessibilityLabel={post.liked ? "Unlike" : "Like"}
            className="items-center active:scale-90"
          >
            <Ionicons name={post.liked ? "heart" : "heart-outline"} size={32} color={post.liked ? "#ff4d3d" : "#e8582f"} />
            <Text className="mt-1 text-[12px] font-semibold text-[#f0f2f6]">{compact(post.likes)}</Text>
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/post/comments", params: { id: post.id } });
            }}
            accessibilityLabel="Comments"
            className="items-center active:scale-90"
          >
            <Ionicons name="chatbubble-outline" size={27} color="#ffffff" />
            <Text className="mt-1 text-[12px] font-semibold text-[#f0f2f6]">{compact(post.comments)}</Text>
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleSave(post);
            }}
            accessibilityLabel={post.saved ? "Remove from saved" : "Save post"}
            className="items-center active:scale-90"
          >
            <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={27} color={post.saved ? "#e8582f" : "#ffffff"} />
          </Pressable>

          {post.media[0]?.kind === "video" && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                Haptics.selectionAsync();
                toggleMuted();
              }}
              accessibilityLabel={muted ? "Turn sound on" : "Mute"}
              className="items-center active:scale-90"
            >
              <Ionicons name={muted ? "volume-mute" : "volume-high"} size={27} color="#ffffff" />
            </Pressable>
          )}

          <Pressable hitSlop={10} onPress={share} accessibilityLabel="Share" className="items-center active:scale-90">
            <Ionicons name="arrow-redo-outline" size={28} color="#ffffff" />
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => {
              Haptics.selectionAsync();
              setMenuOpen(true);
            }}
            accessibilityLabel="More options"
            className="items-center active:scale-90"
          >
            <Ionicons name="ellipsis-horizontal" size={26} color="#ffffff" />
          </Pressable>
        </View>

        <PostMenu
          post={post}
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          onRemoved={() => (showBackButton ? router.back() : undefined)}
        />

        {/* Bottom info */}
        <View className="px-6 pb-4 pr-20">
          <Pressable onPress={openProfile} className="flex-row items-center active:opacity-70">
            <Avatar post={post} size={28} className="mr-2.5" />
            <Text className="mr-2 text-[15px] font-bold text-white">{post.author.name}</Text>
            {post.author.userType === "racer" && (
              <View className="mr-2 flex-row items-center rounded-full border border-[#e8582f]/50 bg-[#e8582f]/15 px-2 py-0.5">
                <Ionicons name="speedometer" size={11} color="#e8582f" />
                <Text className="ml-1 text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#e8582f]">Racer</Text>
              </View>
            )}
            {post.visibility === "followers_only" && (
              <View className="flex-row items-center">
                <Ionicons name="lock-closed" size={11} color="#8a91a0" />
                <Text className="ml-1 text-[12px] font-medium text-[#8a91a0]">Followers only</Text>
              </View>
            )}
          </Pressable>

          {post.caption ? <Text className="mt-1.5 text-[14.5px] font-medium text-[#d3d7e0]">{post.caption}</Text> : null}

          <View className="mt-1.5 flex-row items-center">
            <Text className="text-[13px] text-[#717786]">{timeAgoLong(post.createdAt)}</Text>
            {post.sessionLabel ? (
              <>
                <Text className="mx-2 text-[12px] text-[#424855]">•</Text>
                <Text className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#e8582f]">{post.sessionLabel}</Text>
              </>
            ) : null}
          </View>

          {hasTelemetry && (
            <View className="mt-2.5 flex-row items-center justify-between pr-4">
              {post.telemetry.trackTemp ? (
                <Text className="text-[13.5px] font-bold uppercase tracking-[1.5px] text-[#4a5163]">TRK.TEMP: {post.telemetry.trackTemp}</Text>
              ) : (
                <View />
              )}
              {post.telemetry.gripIdx ? (
                <Text className="text-[13.5px] font-bold uppercase tracking-[1.5px] text-[#4a5163]">GRIP IDX: {post.telemetry.gripIdx}</Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
