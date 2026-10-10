import type { AudioPlayer } from "expo-audio";

export type GiftTier = "cheer" | "support" | "big";

export const TIERS: { id: GiftTier; label: string; hint: string }[] = [
  { id: "cheer", label: "Cheer", hint: "A quick shout-out" },
  { id: "support", label: "Support", hint: "Help the team" },
  { id: "big", label: "Big", hint: "Go all out" },
];

// One cue per gift: light and short for Cheer, mid-weight for Support, rising in size for Big.
// These files are synthesized placeholders; drop in final recordings under the same names.
const SOUNDS: Record<string, number> = {
  "checkered-flag": require("@/assets/sounds/checkered-flag.wav"),
  "air-horn": require("@/assets/sounds/air-horn.wav"),
  tire: require("@/assets/sounds/tire.wav"),
  "fuel-can": require("@/assets/sounds/fuel-can.wav"),
  "fresh-tires": require("@/assets/sounds/fresh-tires.wav"),
  "pit-stop": require("@/assets/sounds/pit-stop.wav"),
  trophy: require("@/assets/sounds/trophy.wav"),
  podium: require("@/assets/sounds/podium.wav"),
  championship: require("@/assets/sounds/championship.wav"),
};

const players = new Map<string, AudioPlayer>();
let modeSet = false;

/** Plays a gift's cue. Never throws: a missing or blocked sound must not break the stream. */
export async function playGiftSound(slug: string | null | undefined) {
  try {
    const source = slug ? SOUNDS[slug] : undefined;
    if (!source) return;
    // Loaded on demand: a development build made before expo-audio was added has no native module,
    // and importing it at the top of the file would take the whole live screen down with it.
    const { createAudioPlayer, setAudioModeAsync } = require("expo-audio") as typeof import("expo-audio");
    if (!modeSet) {
      modeSet = true;
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
    }
    let player = players.get(slug!);
    if (!player) {
      player = createAudioPlayer(source);
      players.set(slug!, player);
    }
    await player.seekTo(0);
    player.play();
  } catch {
    // sound is a nicety
  }
}

export function formatPrice(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
