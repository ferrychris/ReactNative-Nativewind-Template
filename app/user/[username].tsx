import React from "react";
import { useLocalSearchParams } from "expo-router";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

/** Another user's public profile, as seen by a visitor. */
export default function PublicProfileRoute() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileScreen username={username} />;
}
