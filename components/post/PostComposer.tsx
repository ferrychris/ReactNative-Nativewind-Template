import React, { useState } from "react";
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { createPost, type PickedMedia } from "@/lib/api/posts";

// Composer design tokens: one surface, one accent, one text color.
const BG = "#0E0E10";
const ACCENT = "#D85A30";
const FG = "#F7F5F1";
const MUTED = "#8B8B90";

const CAPTION_LIMIT = 150;
const COUNTER_FROM = 120;
const GALLERY_LIMIT = 10;
const { width: SCREEN_W } = Dimensions.get("window");

type Media = { kind: "photo" | "video" | "gallery"; uris: string[]; items: PickedMedia[] };

function VideoBackdrop({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ flex: 1 }} />;
}

function MediaBackdrop({ media }: { media: Media }) {
  if (media.kind === "video") return <VideoBackdrop uri={media.uris[0]} />;
  if (media.kind === "photo") return <Image source={{ uri: media.uris[0] }} contentFit="cover" style={{ flex: 1 }} />;
  return (
    <View className="flex-1">
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} className="flex-1">
        {media.uris.map((uri) => (
          <Image key={uri} source={{ uri }} contentFit="cover" style={{ width: SCREEN_W, height: "100%" }} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Thin outline rectangle switch; accent fill when on. */
function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={{ width: 46, height: 26, borderColor: value ? ACCENT : "#55555a", backgroundColor: value ? ACCENT : "transparent" }}
      className="justify-center rounded-sm border"
    >
      <View
        style={{ width: 18, height: 18, marginLeft: value ? 24 : 3, backgroundColor: value ? BG : FG }}
        className="rounded-[2px]"
      />
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="h-12 flex-row items-center justify-between">
      <Text style={{ color: FG }} className="text-[16px] font-normal">
        {label}
      </Text>
      <Switch value={value} onChange={onChange} label={label} />
    </View>
  );
}

export function PostComposer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState("");
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [posting, setPosting] = useState(false);
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const hasDraft = body.trim().length > 0 || caption.trim().length > 0 || media !== null;
  // a text-only post needs text; a media post may have no caption
  const canPost = !posting && (media !== null || body.trim().length > 0);

  const pick = async (kind: Media["kind"]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      allowsMultipleSelection: kind === "gallery",
      selectionLimit: kind === "gallery" ? GALLERY_LIMIT : 1,
      quality: 1,
      // iOS can re-encode on export: 720p H.264 is far smaller than the camera original
      ...(kind === "video" ? { videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720 } : {}),
    });
    if (result.canceled || result.assets.length === 0) return;
    setMedia({
      kind,
      uris: result.assets.map((a) => a.uri),
      items: result.assets.map((a) => ({ uri: a.uri, file: a.file, mimeType: a.mimeType, width: a.width, height: a.height, durationMs: a.duration })),
    });
  };

  const close = () => {
    if (!hasDraft) return router.back();
    Alert.alert("Discard post?", "Your draft will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const submit = async () => {
    if (!canPost || !profile) return;
    setPosting(true);
    try {
      await createPost({
        userId: profile.id,
        body,
        caption,
        visibility: followersOnly ? "followers_only" : "public",
        mediaKind: media?.kind ?? null,
        media: media?.items ?? [],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["userPosts"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't post", e instanceof Error ? e.message : "Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={{ backgroundColor: BG }} className="flex-1">
      {/* Media state: media fills the screen behind everything */}
      {media && (
        <View className="absolute inset-0">
          <MediaBackdrop media={media} />
        </View>
      )}

      <SafeAreaView edges={["top"]} className="z-10">
        {/* Top bar */}
        <View className="h-14 flex-row items-center justify-between px-4">
          <Pressable hitSlop={12} onPress={close} accessibilityLabel="Close" className="active:opacity-60">
            <Ionicons name="close" size={28} color={FG} />
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={!canPost}
            accessibilityRole="button"
            accessibilityLabel="Post"
            style={
              canPost
                ? { backgroundColor: ACCENT, borderColor: ACCENT }
                : { backgroundColor: "transparent", borderColor: "rgba(216,90,48,0.35)" }
            }
            className="h-9 min-w-[76px] items-center justify-center rounded-full border px-5 active:opacity-80"
          >
            {posting ? (
              <ActivityIndicator color={FG} />
            ) : (
              <Text style={{ color: canPost ? FG : "rgba(247,245,241,0.4)" }} className="text-[15px] font-medium">
                Post
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Remove media (inside the preview area, not the top bar) */}
      {media && (
        <Pressable
          hitSlop={12}
          onPress={() => setMedia(null)}
          accessibilityLabel="Remove media"
          style={{ top: insets.top + 64 }}
          className="absolute right-4 z-10 active:opacity-60"
        >
          <Ionicons name="close" size={22} color={FG} />
        </Pressable>
      )}

      {media?.kind === "gallery" && (
        <Text style={{ color: FG, top: insets.top + 66 }} className="absolute left-4 z-10 text-[13px] font-medium">
          {media.uris.length} photos
        </Text>
      )}

      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
        {/* Text-only state: large borderless text area, centered */}
        {!media && (
          <View className="flex-1 justify-center px-6">
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              placeholder="What's happening at the track?"
              placeholderTextColor={MUTED}
              selectionColor={FG}
              textAlign="center"
              textAlignVertical="center"
              style={{ color: FG, fontSize: 26, lineHeight: 34 }}
              className="max-h-[60%] font-normal"
            />
          </View>
        )}

        {/* Bottom panel */}
        <View
          style={media ? { experimental_backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.88) 38%)" } : undefined}
          className={`px-4 ${media ? "pt-24" : ""}`}
        >
          {!media && (
            <View className="flex-row justify-evenly pb-5">
              <Pressable hitSlop={12} onPress={() => pick("photo")} accessibilityLabel="Add photo" className="active:opacity-60">
                <Ionicons name="image-outline" size={28} color={FG} />
              </Pressable>
              <Pressable hitSlop={12} onPress={() => pick("video")} accessibilityLabel="Add video" className="active:opacity-60">
                <Ionicons name="videocam-outline" size={28} color={FG} />
              </Pressable>
              <Pressable hitSlop={12} onPress={() => pick("gallery")} accessibilityLabel="Add gallery" className="active:opacity-60">
                <Ionicons name="images-outline" size={28} color={FG} />
              </Pressable>
            </View>
          )}

          {caption.length >= COUNTER_FROM && (
            <Text style={{ color: MUTED }} className="mb-1 text-right text-[12px] font-normal">
              {caption.length}/{CAPTION_LIMIT}
            </Text>
          )}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={CAPTION_LIMIT}
            placeholder="Add a caption..."
            placeholderTextColor={MUTED}
            selectionColor={FG}
            style={{ color: FG, fontSize: 16, maxHeight: 96 }}
            className="py-2 font-normal"
          />

          <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="mt-1">
            <ToggleRow label="Followers only" value={followersOnly} onChange={setFollowersOnly} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
