import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/**
 * Route access by auth state, using protected routes: screens that need a profile simply
 * don't exist for the router until `profile` has loaded, so they can never render without it.
 *   signed out         -> auth/login, auth/register
 *   new account        -> auth/onboarding
 *   ready              -> the app
 */
function Routes() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth();

  // Signed in but the profile row couldn't be loaded (offline, server error).
  if (!loading && session && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg px-8">
        <Text className="text-center text-[18px] text-paddock-text">Couldn't load your profile</Text>
        <Text className="mt-2 text-center text-[14px] text-paddock-muted">Check your connection and try again.</Text>
        <Pressable onPress={refreshProfile} className="mt-6 h-12 w-full items-center justify-center bg-paddock-orange active:opacity-80">
          <Text className="text-[15px] font-semibold text-paddock-text">Retry</Text>
        </Pressable>
        <Pressable onPress={signOut} className="mt-4 active:opacity-70">
          <Text className="text-[14px] text-paddock-muted">Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const signedOut = !session;
  const needsOnboarding = !!profile && !profile.profile_complete;
  const ready = !!profile && profile.profile_complete;

  // The navigator is always mounted (Expo Router needs one on the first render to resolve the launch URL);
  // while sign-in is being worked out, the loading screen simply covers it. The launch splash hides by itself.
  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b0b0d" } }}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
      </Stack.Protected>

      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="auth/onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={ready}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/create" />
        <Stack.Screen name="post/comments" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="sponsorship/offers" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="chat/requests" />
        <Stack.Screen name="livestream/go-live" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="livestream/[id]" options={{ gestureEnabled: false, animation: "fade" }} />
        <Stack.Screen name="livestream/watch/[id]" options={{ animation: "fade" }} />
        <Stack.Screen name="user/[username]" />
      </Stack.Protected>
    </Stack>
    {loading && (
      <View style={StyleSheet.absoluteFill} className="bg-paddock-bg">
        <LoadingScreen />
      </View>
    )}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
