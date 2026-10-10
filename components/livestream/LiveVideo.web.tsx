import React, { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";

type Props = { track: VideoTrack | null; mirror?: boolean };

/** Browser: a plain <video> element that LiveKit attaches the track to. */
export function LiveVideo({ track, mirror }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return React.createElement("video", {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: true, // sound comes from separate audio elements; the picture itself is silent
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      backgroundColor: "#0b0b0d",
      transform: mirror ? "scaleX(-1)" : undefined,
    },
  });
}
