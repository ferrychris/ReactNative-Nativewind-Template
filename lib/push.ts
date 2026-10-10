import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

/**
 * Push notifications on the phone: ask permission, get this device's Expo push token, hand it to the
 * database, and decide where a tapped notification should open. The sending side is the push-notify edge function.
 *
 * expo-notifications and expo-device are native modules. They are loaded lazily and only when the app was built
 * with them, so a development build made before they were added (and Expo Go, and the web) keep working, without push.
 */

const TOKEN_KEY = "heatlap.pushToken";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

/** True when this app binary can do push: a real build that includes the notification module. */
export function pushSupported(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === "storeClient") return false; // Expo Go has no remote push
  return !!requireOptionalNativeModule("ExpoPushTokenManager");
}

function load(): { N: NotificationsModule; Device: DeviceModule } | null {
  if (!pushSupported()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { N: require("expo-notifications"), Device: require("expo-device") };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ chat being looked at */

let activeChatId: string | null = null;
/** The open chat screen tells us, so a message push for that very chat doesn't pop up on top of it. */
export function setActiveChat(id: string | null) {
  activeChatId = id;
}

let handlerSet = false;
/** While the app is open, still show a banner and play a sound (the default is to show nothing). */
export function setupNotificationHandler() {
  if (handlerSet) return;
  const m = load();
  if (!m) return;
  handlerSet = true;
  m.N.setNotificationHandler({
    handleNotification: async (n) => {
      const data = n.request.content.data as { type?: string; conversationId?: string } | undefined;
      const showing = !(data?.type === "message" && data.conversationId && data.conversationId === activeChatId);
      return { shouldShowBanner: showing, shouldShowList: showing, shouldPlaySound: showing, shouldSetBadge: false };
    },
  });
}

/* ------------------------------------------------------------------ registering this device */

export type PushResult = { status: "registered"; token: string } | { status: "unsupported" | "denied" | "error"; message?: string };

/** Asks for permission (once) and saves this device's push token for the signed-in user. Safe to call on every launch. */
export async function registerForPush(): Promise<PushResult> {
  const m = load();
  if (!m) return { status: "unsupported" };
  const { N, Device } = m;
  try {
    if (!Device.isDevice) return { status: "unsupported", message: "Push needs a real phone, not an emulator." };

    if (Platform.OS === "android") {
      // Android 8+: the user can mute each kind on its own in system settings
      const common = { lightColor: "#e8582f", vibrationPattern: [0, 200, 100, 200] };
      await N.setNotificationChannelAsync("default", { name: "Activity", importance: N.AndroidImportance.DEFAULT, ...common });
      await N.setNotificationChannelAsync("messages", { name: "Messages", importance: N.AndroidImportance.HIGH, ...common });
      await N.setNotificationChannelAsync("live", { name: "Live streams", importance: N.AndroidImportance.HIGH, ...common });
    }

    let { status } = await N.getPermissionsAsync();
    if (status !== "granted") status = (await N.requestPermissionsAsync()).status;
    if (status !== "granted") return { status: "denied" };

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { status: "error", message: "Missing EAS project id." };
    const token = (await N.getExpoPushTokenAsync({ projectId })).data;

    const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: Platform.OS });
    if (error) return { status: "error", message: error.message };
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    return { status: "registered", token };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Log out: this phone stops getting the account's notifications (the next person to log in here gets their own). */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.rpc("unregister_push_token", { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // offline: the server drops dead tokens by itself the next time it tries one
  }
}

/** Lock-screen / icon badge number. */
export async function setBadge(count: number) {
  const m = load();
  if (!m) return;
  await m.N.setBadgeCountAsync(Math.max(0, count)).catch(() => {});
}

/* ------------------------------------------------------------------ where a tapped notification goes */

export type PushData = {
  type?: string;
  entityType?: string | null;
  entityId?: string | null;
  actorUsername?: string | null;
  conversationId?: string | null;
};

export type PushTarget = { pathname: string; params?: Record<string, string> };

export function targetFor(data: PushData | undefined): PushTarget {
  if (!data) return { pathname: "/inbox" };
  if (data.type === "message" && data.conversationId) return { pathname: "/chat/[id]", params: { id: data.conversationId } };
  if (data.entityType === "post" && data.entityId) return { pathname: "/post/[id]", params: { id: data.entityId } };
  if (data.entityType === "live_stream" && data.entityId) return { pathname: "/livestream/watch/[id]", params: { id: data.entityId } };
  if (data.entityType === "profile" && data.actorUsername) return { pathname: "/user/[username]", params: { username: data.actorUsername } };
  if (data.entityType === "sponsorship_bid" || data.entityType === "sponsorship_deal") return { pathname: "/sponsorship/offers" };
  return { pathname: "/inbox" };
}

/** Subscribes to taps on notifications (app in background or open) and the one that launched the app. */
export function listenForTaps(onTap: (data: PushData | undefined) => void): () => void {
  const m = load();
  if (!m) return () => {};
  const { N } = m;
  const sub = N.addNotificationResponseReceivedListener((r) => onTap(r.notification.request.content.data as PushData));
  // the app was closed and a notification opened it
  const initial = N.getLastNotificationResponse();
  if (initial) {
    onTap(initial.notification.request.content.data as PushData);
    N.clearLastNotificationResponse();
  }
  return () => sub.remove();
}
