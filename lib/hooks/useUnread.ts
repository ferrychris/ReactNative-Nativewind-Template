import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchUnreadCounts, type UnreadCounts } from "@/lib/api/messages";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";

/** Unread numbers for the Inbox badge and header. Just reads the numbers: any screen may call this. */
export function useUnread(): UnreadCounts {
  const { profile } = useAuth();
  const me = profile?.id;

  const { data } = useQuery({
    queryKey: ["unread", me],
    queryFn: fetchUnreadCounts,
    enabled: !!me,
    refetchInterval: 60_000, // safety net if realtime isn't connected
    staleTime: 10_000,
  });

  return data ?? { messages: 0, requests: 0, notifications: 0 };
}

/**
 * Listens for new messages and notifications and refreshes the inbox lists and badge.
 * Call this ONCE for the whole app (the tab bar does); it must not be called from every screen.
 */
export function useInboxRealtime() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile?.id;

  useEffect(() => {
    if (!me) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["unread"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    };
    const channel = newChannel(`inbox:${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, qc]);
}
