import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isUsernameAvailable, updateProfile } from "@/lib/api/profiles";
import { USERNAME_RE } from "@/lib/format";
import type { ProfileView } from "@/lib/types";

const TEXT = "#f2f0ee";
const ORANGE = "#e8582f";

function Field({
  label,
  value,
  onChangeText,
  multiline,
  prefix,
  keyboardType,
  maxLength,
  hint,
  hintError,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  prefix?: string;
  keyboardType?: "default" | "number-pad";
  maxLength?: number;
  hint?: string;
  hintError?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">{label}</Text>
      <View className="flex-row items-start bg-paddock-surface px-4">
        {prefix && <Text className="py-3.5 text-[16px] text-paddock-muted">{prefix}</Text>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? (prefix ? "none" : "sentences")}
          autoCorrect={!prefix}
          selectionColor={ORANGE}
          placeholderTextColor="#6b6561"
          style={{ minHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? "top" : "center" }}
          className="flex-1 py-3.5 text-[16px] text-paddock-text"
        />
      </View>
      {hint ? <Text className={`mt-1.5 text-[12.5px] ${hintError ? "text-[#ff7a5c]" : "text-paddock-muted"}`}>{hint}</Text> : null}
    </View>
  );
}

export function EditProfile({ view }: { view: ProfileView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();

  const [isRacer, setIsRacer] = useState(view.isRacer);
  const [name, setName] = useState(view.name);
  const [username, setUsername] = useState(view.username ?? "");
  const [bio, setBio] = useState(view.bio ?? "");
  const [location, setLocation] = useState(view.track?.location ?? view.location ?? "");
  const [carNumber, setCarNumber] = useState(view.racer?.carNumber ?? "");
  const [racingClass, setRacingClass] = useState(view.racer?.racingClass ?? "");
  const [teamName, setTeamName] = useState(view.racer?.teamName ?? "");
  const [favoriteClasses, setFavoriteClasses] = useState((view.fan?.favoriteClasses ?? []).join(", "));
  const [capacity, setCapacity] = useState(view.track?.capacity ? String(view.track.capacity) : "");
  const [available, setAvailable] = useState<boolean | null>(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = username.trim().toLowerCase();
  const usernameOk = USERNAME_RE.test(clean);
  const changedUsername = clean !== (view.username ?? "");

  useEffect(() => {
    if (!changedUsername || !usernameOk) {
      setAvailable(true);
      return;
    }
    setAvailable(null);
    const t = setTimeout(() => {
      isUsernameAvailable(clean).then(setAvailable).catch(() => setAvailable(null));
    }, 400);
    return () => clearTimeout(t);
  }, [clean, changedUsername, usernameOk]);

  const canSave = !saving && name.trim().length > 0 && usernameOk && available !== false;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(view.id, view.userType, {
        name,
        username: clean,
        bio,
        location,
        isRacer,
        carNumber,
        racingClass,
        teamName,
        favoriteClasses: favoriteClasses
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 8),
        capacity: capacity.trim() ? Math.max(0, parseInt(capacity, 10) || 0) : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([refreshProfile(), qc.invalidateQueries({ queryKey: ["profile"] })]);
      qc.invalidateQueries({ queryKey: ["feed"] }); // author names / handles on posts
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    Alert.alert("Discard changes?", undefined, [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const usernameHint = !usernameOk
    ? "3-24 characters: letters, numbers, dots or underscores."
    : changedUsername && available === false
      ? "That username is taken."
      : changedUsername && available === null
        ? "Checking..."
        : undefined;

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-paddock-bg">
      <View className="h-14 flex-row items-center justify-between px-4">
        <Pressable hitSlop={12} onPress={cancel} accessibilityLabel="Cancel" className="active:opacity-60">
          <Ionicons name="close" size={28} color={TEXT} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-paddock-text">Edit profile</Text>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          className="h-9 min-w-[72px] items-center justify-center rounded-full bg-paddock-orange px-5 active:opacity-80"
          style={{ opacity: canSave ? 1 : 0.4 }}
        >
          {saving ? <ActivityIndicator color={TEXT} /> : <Text className="text-[15px] font-semibold text-paddock-text">Save</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-10 pt-4" showsVerticalScrollIndicator={false}>
          {error && (
            <Text accessibilityRole="alert" className="mb-4 text-[14px] text-[#ff7a5c]">
              {error}
            </Text>
          )}

          <Field label={view.userType === "track" ? "Track name" : "Name"} value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
          <Field
            label="Username"
            value={username}
            onChangeText={(v) => setUsername(v.replace(/^@/, ""))}
            prefix="@"
            maxLength={24}
            hint={usernameHint}
            hintError={!usernameOk || (changedUsername && available === false)}
          />
          <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={160} />

          {view.userType !== "track" && (
            <>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: isRacer }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsRacer((v) => !v);
                }}
                className="mb-5 flex-row items-center bg-paddock-surface px-4 py-3.5 active:opacity-80"
              >
                <View className="flex-1 pr-4">
                  <Text className="text-[16px] text-paddock-text">I race</Text>
                  <Text className="mt-0.5 text-[13px] text-paddock-muted">Show a car number, class, team and season stats on your profile</Text>
                </View>
                <View
                  style={{ width: 46, height: 26, borderColor: isRacer ? ORANGE : "#55555a", backgroundColor: isRacer ? ORANGE : "transparent" }}
                  className="justify-center rounded-sm border"
                >
                  <View style={{ width: 18, height: 18, marginLeft: isRacer ? 24 : 3, backgroundColor: isRacer ? "#0b0b0d" : TEXT }} className="rounded-[2px]" />
                </View>
              </Pressable>

              {isRacer && (
                <>
                  <Field label="Car number" value={carNumber} onChangeText={setCarNumber} keyboardType="number-pad" maxLength={3} />
                  <Field label="Racing class" value={racingClass} onChangeText={setRacingClass} maxLength={30} />
                  <Field label="Team" value={teamName} onChangeText={setTeamName} maxLength={40} autoCapitalize="words" />
                </>
              )}
              <Field label="Location" value={location} onChangeText={setLocation} maxLength={60} autoCapitalize="words" />
              <Field label="Favorite classes" value={favoriteClasses} onChangeText={setFavoriteClasses} hint="Separate with commas, e.g. Pro, Endurance, GT3" />
            </>
          )}
          {view.userType === "track" && (
            <>
              <Field label="Location" value={location} onChangeText={setLocation} maxLength={60} autoCapitalize="words" />
              <Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={7} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
