import { Platform } from "react-native";
import { VideoPresets, type RoomOptions } from "livekit-client";

/**
 * What the host sends. Phones capture portrait, browsers capture the usual landscape webcam picture.
 * 720p30 is reliable on mobile data; raise it here if you want sharper video (and more bandwidth).
 */
export const STREAM_QUALITY = {
  label: "720p30",
  maxBitrate: 2_500_000,
  maxFramerate: 30,
};

const captureResolution = Platform.OS === "web" ? VideoPresets.h720.resolution : { width: 720, height: 1280, frameRate: STREAM_QUALITY.maxFramerate };

export const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true, // viewers only download as much video as their screen shows
  dynacast: true, // the host stops sending layers nobody watches
  videoCaptureDefaults: { resolution: captureResolution, facingMode: "user" },
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  publishDefaults: {
    simulcast: true, // several qualities, so weak connections still get a picture
    videoEncoding: { maxBitrate: STREAM_QUALITY.maxBitrate, maxFramerate: STREAM_QUALITY.maxFramerate },
  },
};
