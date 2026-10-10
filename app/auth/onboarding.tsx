import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AuthField } from "@/components/auth/AuthField";
import { RoleSwitches } from "@/components/auth/RoleSwitches";
import { useAuth } from "@/contexts/AuthContext";
import { completeOnboarding, isUsernameAvailable } from "@/lib/api/profiles";
import { USERNAME_RE } from "@/lib/format";
import { AuthError, AuthHero, AuthNotice, AuthPrimaryButton, AuthTopBar } from "@/components/auth/AuthKit";

function ProgressRail() {
  return (
    <View className="mt-6 flex-row gap-2">
      {["Profile", "Class", "Grid"].map((label, index) => (
        <View key={label} className={`flex-1 border px-2 py-2 ${index < 2 ? "border-paddock-orange bg-[#24140f]" : "border-paddock-border bg-paddock-surface"}`}>
          <Text className={`text-[9px] font-extrabold uppercase tracking-[1px] ${index < 2 ? "text-paddock-orange" : "text-paddock-muted"}`}>0{index + 1}</Text>
          <Text className="mt-1 text-[10px] font-bold uppercase tracking-[0.7px] text-paddock-text">{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** First-run step for every new account: choose a username and account class. */
export default function Onboarding() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [username, setUsername] = useState((profile?.username ?? "").toLowerCase());
  const [isRacer, setIsRacer] = useState(profile?.is_racer ?? false);
  const [isTrack, setIsTrack] = useState(profile?.user_type === "track");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = username.trim().toLowerCase();
  const formatOk = USERNAME_RE.test(clean);

  useEffect(() => {
    if (!formatOk) return;
    const t = setTimeout(() => {
      isUsernameAvailable(clean).then(setAvailable).catch(() => setAvailable(null));
    }, 400);
    return () => clearTimeout(t);
  }, [clean, formatOk]);

  const valid = name.trim().length > 0 && formatOk && available !== false;

  const submit = async () => {
    if (!profile || !valid || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(profile.id, { name, username: clean, isRacer, isTrack });
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const usernameHint = !clean
    ? "3-24 characters: letters, numbers, dots, underscores."
    : !formatOk
      ? "Use 3-24 letters, numbers, dots or underscores."
      : available === false
        ? "That username is taken."
        : available === true
          ? "Username is available."
          : "Checking availability...";

  const updateUsername = (value: string) => {
    setUsername(value.replace(/^@/, ""));
    setAvailable(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-paddock-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <AuthTopBar
          title="Profile setup"
          right={
            <Pressable onPress={signOut} hitSlop={10} accessibilityLabel="Log out" className="h-9 w-9 items-center justify-center rounded-sm bg-paddock-surface active:opacity-70">
              <Ionicons name="log-out-outline" size={18} color="#9a928d" />
            </Pressable>
          }
        />
        <ScrollView contentContainerClassName="px-5 pb-10 pt-3" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHero eyebrow="Paddock pass · Step 2" title="Tune your profile" subtitle="Set the name, handle, and account class fans will see around the paddock." />

          <ProgressRail />

          <AuthField label={isTrack ? "Track / organisation name" : "Display name"} icon="person-outline" value={name} onChangeText={setName} placeholder={isTrack ? "Crandon International" : "Elena Rossi"} autoCapitalize="words" maxLength={40} />
          <AuthField
            label="Username"
            icon="at-outline"
            value={username}
            onChangeText={updateUsername}
            placeholder="elena.rossi"
            autoCapitalize="none"
            maxLength={24}
            hint={usernameHint}
            right={available === true ? <Ionicons name="checkmark-circle" size={21} color="#5cc8ff" /> : null}
          />

          <RoleSwitches isRacer={isRacer} isTrack={isTrack} onRacerChange={setIsRacer} onTrackChange={setIsTrack} />

          <AuthError message={error} />
          <AuthPrimaryButton label="Enter the paddock" onPress={submit} busy={busy} disabled={!valid} />

          <AuthNotice icon="shield-check" title="Profile can change later" body="Racer details, sponsor spots, team info and car photos are managed from your profile." />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
