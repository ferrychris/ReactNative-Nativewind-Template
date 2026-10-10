import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraPreview, type Facing } from "./CameraPreview";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { liveError, prepareLiveStream } from "@/lib/api/live";
import { STREAM_QUALITY } from "@/lib/livekit/config";
import { nativeVideoAvailable } from "@/lib/livekit/platform";

const ORANGE = "#e8582f";
const TITLE_MAX = 80;

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
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
      style={{ width: 58, height: 34, backgroundColor: value ? "#ec6a3a" : "#3a3a40" }}
      className="justify-center rounded-full"
    >
      <View style={{ width: 26, height: 26, marginLeft: value ? 29 : 4, backgroundColor: "#e6e0dd" }} className="rounded-full" />
    </Pressable>
  );
}

function SettingRow({ title, hint, value, onChange }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="mt-5 flex-row items-center">
      <View className="flex-1 pr-4">
        <Text className="text-[19px] text-paddock-text">{title}</Text>
        <Text className="mt-0.5 text-[15px] leading-[21px] text-paddock-peach/80">{hint}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

export function GoLive() {
  const router = useRouter();
  const { profile } = useAuth();
  const [facing, setFacing] = useState<Facing>("user");
  const [camGranted, setCamGranted] = useState(false);

  const [title, setTitle] = useState("");
  const [allowGifts, setAllowGifts] = useState(true);
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [starting, setStarting] = useState(false);

  const ready = camGranted && title.trim().length > 0 && !starting;
  // "SESSION STREAM TITLE / MONZA PIT 04": the second part is where you are
  const place = (profile?.location ?? "Paddock").split(",")[0].toUpperCase();

  const goLive = async () => {
    if (!ready) return;
    if (!nativeVideoAvailable()) {
      Alert.alert(
        "Live video needs a development build",
        "Expo Go doesn't include the video engine. Open the app from a development build (or in the browser) to go live. Nothing was created and nobody was notified.",
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStarting(true);
    try {
      // Creates the stream quietly. The live room connects to LiveKit and only then publishes it,
      // which is the moment followers are notified.
      const id = await prepareLiveStream({ title, allowGifts, followersOnly, notify: notifyFollowers });
      router.replace({ pathname: "/livestream/[id]", params: { id, facing } });
    } catch (e) {
      Alert.alert("Couldn't go live", liveError(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-paddock-bg">
      {/* Camera preview fills the top of the screen */}
      <View className="absolute inset-x-0 top-0 h-[74%] bg-black">
        <CameraPreview facing={facing} onGrantedChange={setCamGranted} />
        {/* fades the picture into the dark panel */}
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[55%]" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0), rgba(11,11,13,0.55) 45%, #0b0b0d)" }} />
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-32" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(11,11,13,0.55), rgba(11,11,13,0))" }} />
      </View>

      {/* Top bar */}
      <SafeAreaView edges={["top"]} className="z-10">
        <View className="flex-row items-start justify-between px-5 pt-3">
          <Pressable hitSlop={14} onPress={() => router.back()} accessibilityLabel="Close" className="active:opacity-60">
            <Ionicons name="close" size={30} color="#f2f0ee" />
          </Pressable>
          <View className="items-end">
            <Pressable
              hitSlop={14}
              onPress={() => {
                Haptics.selectionAsync();
                setFacing((f) => (f === "user" ? "environment" : "user"));
              }}
              accessibilityLabel="Flip camera"
              className="active:opacity-60"
            >
              <Ionicons name="camera-reverse-outline" size={30} color="#f2f0ee" />
            </Pressable>
            <View className="mt-3 flex-row items-center">
              <View className="mr-2 h-2 w-2 rounded-full bg-paddock-orange" />
              <Text className="text-[13px] font-semibold uppercase tracking-[2px] text-paddock-peach/80">{STREAM_QUALITY.label.toUpperCase()} // STANDBY</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Settings panel */}
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end">
        <SafeAreaView edges={["bottom"]}>
          <View className="px-6 pb-[12%]">
            <Text className="text-[13px] font-semibold uppercase tracking-[1.5px] text-paddock-peach">
              Session stream title <Text className="text-paddock-peach/70">/ {place}</Text>
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
              placeholder="Name your stream"
              placeholderTextColor="#7d7772"
              selectionColor={ORANGE}
              returnKeyType="done"
              className="mt-2 text-[24px] font-medium leading-[32px] text-paddock-text"
              multiline
              blurOnSubmit
              accessibilityLabel="Stream title"
            />

            <SettingRow title="Allow gifts during this stream" hint="Fans can send telemetry boosts and pit badges" value={allowGifts} onChange={setAllowGifts} />
            <SettingRow title="Followers get notified" hint="Push notification sent to garage subscribers" value={notifyFollowers} onChange={setNotifyFollowers} />

            <Pressable
              onPress={goLive}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel="Go live"
              className="mt-7 h-[60px] flex-row items-center justify-center active:opacity-85"
              style={{ backgroundColor: ready ? "#ec6a3a" : "#3a2a24", opacity: ready ? 1 : 0.7 }}
            >
              <View className="mr-3 h-3 w-3 rounded-full bg-paddock-text" />
              <Text className="text-[22px] font-medium text-paddock-text">Go Live</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setFollowersOnly((v) => !v);
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="mt-4 items-center active:opacity-70"
            >
              <Text className="text-[16px] text-paddock-peach/80">{followersOnly ? "Only followers can watch this stream" : "Anyone can watch this stream"}</Text>
              <Text className="mt-0.5 text-[12px] text-paddock-muted">Tap to change</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}
