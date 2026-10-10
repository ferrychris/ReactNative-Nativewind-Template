// Browser version: livekit-client works as-is, no native setup needed.
// (The phone version is platform.ts; keeping them separate stops the web bundle importing native code.)

/** Browsers always have what livekit-client needs. */
export function nativeVideoAvailable(): boolean {
  return true;
}

export function getNative(): null {
  return null;
}

export async function prepareNative(): Promise<void> {}

export async function releaseNative(): Promise<void> {}
