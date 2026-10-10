import React from "react";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams } from "expo-router";
import { LiveRoom } from "@/components/livestream/LiveRoom";

/** The host's live room. In development builds, /livestream/preview shows it with sample content. */
export default function LiveRoomScreen() {
  const { id, facing } = useLocalSearchParams<{ id: string; facing?: string }>();
  return (
    <>
      <StatusBar style="light" />
      <LiveRoom streamId={id} initialFacing={facing === "environment" ? "environment" : "user"} />
    </>
  );
}
