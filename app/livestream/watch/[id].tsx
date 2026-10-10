import React from "react";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams } from "expo-router";
import { WatchLive } from "@/components/livestream/WatchLive";

/** Watch someone else's live stream. */
export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <StatusBar style="light" />
      <WatchLive streamId={id} />
    </>
  );
}
