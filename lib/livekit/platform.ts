/* eslint-disable @typescript-eslint/no-require-imports */
// Phones (iOS / Android). The web version of this file is platform.web.ts.
//
// @livekit/react-native contains native video code. Expo Go does not include it, so it is loaded
// lazily inside try/catch: in Expo Go the app keeps working and shows "needs a development build"
// instead of crashing when this file is imported.

import { NativeModules } from "react-native";

type Native = typeof import("@livekit/react-native");

let cached: Native | null | undefined;
let globalsRegistered = false;

/**
 * True when this build contains LiveKit's native video code (a development or release build).
 * Same test the WebRTC package itself runs on load; doing it first means that in Expo Go the
 * package is never loaded, so nothing throws and nothing shows up as a red error.
 */
export function nativeVideoAvailable(): boolean {
  return NativeModules.WebRTCModule != null;
}

export function getNative(): Native | null {
  if (cached !== undefined) return cached;
  if (!nativeVideoAvailable()) {
    cached = null;
    return cached;
  }
  try {
    cached = require("@livekit/react-native") as Native;
  } catch {
    cached = null;
  }
  return cached;
}

/** Registers WebRTC globals and starts the audio session. Throws "DEV_BUILD_REQUIRED" in Expo Go. */
export async function prepareNative(): Promise<void> {
  const lk = getNative();
  if (!lk) throw new Error("DEV_BUILD_REQUIRED");
  if (!globalsRegistered) {
    lk.registerGlobals();
    globalsRegistered = true;
  }
  await lk.AudioSession.startAudioSession();
}

export async function releaseNative(): Promise<void> {
  try {
    await getNative()?.AudioSession.stopAudioSession();
  } catch {
    // nothing to release
  }
}
