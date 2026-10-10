import { useSyncExternalStore } from "react";

/**
 * Whether feed videos play with sound. One shared setting for every video, so muting once mutes the
 * whole feed (like other short-video apps). Sound is ON by default: videos are uploaded with their
 * audio, and a feed that is always silent looks like the sound was lost.
 */
let muted = false;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setMuted = (next: boolean) => {
  if (muted === next) return;
  muted = next;
  listeners.forEach((fn) => fn());
};

export function useMuted(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, () => muted, () => muted);
  return [value, () => setMuted(!muted)];
}
