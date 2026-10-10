import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { AuthField } from "@/components/auth/AuthField";
import { useAuth } from "@/contexts/AuthContext";
import { AuthError, AuthFooter, AuthHero, AuthNotice, AuthPrimaryButton, AuthTopBar } from "@/components/auth/AuthKit";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8;

  const submit = async () => {
    if (!valid || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    const res = await signUp({ email, password, name });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.needsConfirmation) {
      Alert.alert("Confirm your email", "We sent you a link. Open it, then log in to finish setting up your profile.", [
        { text: "OK", onPress: () => router.replace("/auth/login") },
      ]);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paddock-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <AuthTopBar title="Create Profile" onBack={() => router.back()} />
        <ScrollView contentContainerClassName="px-5 pb-10 pt-3" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHero eyebrow="Paddock pass · Step 1" title="Claim your garage" subtitle="Start with the basics. Your username and racer details come next." />

          <AuthField label="Display name" icon="person-outline" value={name} onChangeText={setName} placeholder="Elena Rossi" autoCapitalize="words" maxLength={40} />
          <AuthField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <AuthField
            label="Passphrase"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            hint={password.length > 0 && password.length < 8 ? "Use at least 8 characters." : undefined}
            right={
              <Pressable hitSlop={10} onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? "Hide password" : "Show password"} className="ml-2 active:opacity-60">
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#9a928d" />
              </Pressable>
            }
          />

          <AuthError message={error} />
          <AuthPrimaryButton label="Create account" onPress={submit} busy={busy} disabled={!valid} />

          <AuthNotice icon="card-account-details-outline" title="One account, every role" body="Fan, racer, sponsor or track: you choose your handle and racing status next." />

          <AuthFooter prompt="Already have a paddock pass?" action="Log in" onPress={() => router.replace("/auth/login")} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
