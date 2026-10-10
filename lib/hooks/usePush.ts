import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { listenForTaps, registerForPush, setBadge, setupNotificationHandler, targetFor } from "@/lib/push";

/**
 * Mount once inside the signed-in app (the tabs layout does):
 *  - registers this phone for push after login (asks permission the first time)
 *  - opens the right screen when a notification is tapped
 *  - keeps the app-icon badge in step with the unread count
 */
export function usePush(unreadTotal: number) {
  const { profile } = useAuth();
  const router = useRouter();
  const me = profile?.id;

  useEffect(() => {
    if (!me) return;
    setupNotificationHandler();
    registerForPush().then((r) => {
      if (r.status === "error") console.warn("[push] couldn't register:", r.message);
    });
  }, [me]);

  useEffect(() => {
    if (!me) return;
    return listenForTaps((data) => {
      const t = targetFor(data);
      router.push(t as never);
    });
  }, [me, router]);

  useEffect(() => {
    if (me) setBadge(unreadTotal);
  }, [me, unreadTotal]);
}
