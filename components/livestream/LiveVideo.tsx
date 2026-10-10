import React from "react";
import { View } from "react-native";
import type { VideoTrack } from "livekit-client";
import { getNative } from "@/lib/livekit/platform";

type Props = { track: VideoTrack | null; mirror?: boolean };

/** Phones: LiveKit's native video view. (The browser version is LiveVideo.web.tsx.) */
export function LiveVideo({ track, mirror }: Props) {
  const native = getNative();
  if (!native || !track) return <View style={{ flex: 1, backgroundColor: "#0b0b0d" }} />;
  const { VideoView } = native;
  return <VideoView videoTrack={track} objectFit="cover" mirror={mirror} style={{ flex: 1 }} />;
}
