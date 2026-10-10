import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { AuthField } from "@/components/auth/AuthField";
import { AuthCheckbox, AuthDivider, AuthError, AuthFooter, AuthHero, AuthNotice, AuthPrimaryButton, AuthProviderRow, AuthTopBar } from "@/components/auth/AuthKit";

const REMEMBER_KEY = "heatlap.lastIdentifier";

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </Svg>
  );
}

export default function Login() {
  const router = useRouter();
  const { signInWithPassword, signInWithGoogle } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Remember this device": bring back the last email / handle used here (never the password)
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY)
      .then((v) => v && setIdentifier(v))
      .catch(() => {});
  }, []);

  const isFormValid = identifier.trim().length > 0 && password.length > 0;

  const handleLogin = async () => {
    if (!isFormValid || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithPassword(identifier, password);
    setBusy(false);
    if (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err);
      return;
    }
    (remember ? AsyncStorage.setItem(REMEMBER_KEY, identifier.trim()) : AsyncStorage.removeItem(REMEMBER_KEY)).catch(() => {});
  };

  const handleGoogle = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithGoogle();
    setBusy(false);
    if (err) setError(err);
  };

  const handleForgotPassword = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const email = identifier.trim();
    if (!email.includes("@")) {
      Alert.alert("Reset password", "Enter the email address on your account, then tap forgot password again.");
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.toLowerCase());
    Alert.alert(err ? "Could not send email" : "Check your inbox", err ? err.message : "If an account exists for that email, a reset link is on its way.");
  };

  return (
    <SafeAreaView className="flex-1 bg-paddock-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <AuthTopBar title="Log In" onBack={() => router.canGoBack() && router.back()} />
        <ScrollView contentContainerClassName="px-5 pb-10 pt-3" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AuthHero eyebrow="Pit wall gateway" title="Log in to Heatlap" subtitle="Access your driver telemetry, paddock feed, and live broadcast stream" />

          <AuthField
            label="Email or Username"
            icon="card-outline"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="e.g. elena_rossi or you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="username"
          />

          <AuthField
            label="Passphrase"
            icon="lock-closed-outline"
            labelRight={
              <Pressable hitSlop={8} onPress={handleForgotPassword} className="active:opacity-70">
                <Text className="text-[15px] font-medium text-paddock-orange">Forgot password?</Text>
              </Pressable>
            }
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            right={
              <Pressable hitSlop={10} onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? "Hide password" : "Show password"} className="ml-2 active:opacity-60">
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#9a928d" />
              </Pressable>
            }
          />

          <AuthCheckbox
            checked={remember}
            onChange={setRemember}
            label="Remember this device"
            right={
              <View className="flex-row items-center">
                <View className="mr-2 h-[7px] w-[7px] rounded-full bg-[#5cc8ff]" />
                <Text className="text-[13px] font-bold tracking-[1px] text-paddock-muted">SECURE</Text>
              </View>
            }
          />

          <AuthError message={error} />
          <AuthPrimaryButton label="Log in to Cockpit" onPress={handleLogin} busy={busy} disabled={!isFormValid} />

          <AuthDivider label="Or continue with" />

          <AuthProviderRow
            icon={<MaterialCommunityIcons name="fingerprint" size={24} color="#ec6a3a" />}
            label="Face ID / Passkey"
            tag="SOON"
            onPress={() => Alert.alert("Coming soon", "Passkey and Face ID sign-in are not available yet.")}
          />
          <AuthProviderRow icon={<GoogleIcon />} label="Continue with Google Account" onPress={handleGoogle} />

          <AuthNotice icon="flag-checkered" title="Race control online" body="Sponsor offers, inbox, posts and livestream tools unlock after login." />

          <AuthFooter
            prompt="Don't have a paddock pass?"
            action="Sign up"
            onPress={() => router.push("/auth/register")}
            legal="By continuing, you agree to use Heatlap respectfully and follow race-day safety rules."
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
