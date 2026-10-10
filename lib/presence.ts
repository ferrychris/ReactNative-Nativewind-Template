import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchLiveNow } from "@/lib/api/live";
import { supabase } from "@/lib/supabase";

/* ---------------------------------------------------------------- online (realtime presence) */

let online: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const setOnline = (next: Set<string>) => {
  online = next;
  listeners.forEach((fn) => fn());
};

/**
 * Mount ONCE (the tabs layout does): says "I'm online" while the app is open, and keeps the list of who else is.
 * Everyone joins the same, fixed channel name (presence only works when the name is shared), so this
 * deliberately doesn't use newChannel(). Leaving the app or losing the connection drops you from the list.
 */
export function usePresenceTracker() {
  const { profile } = useAuth();
  const me = profile?.id;

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel("presence:online", { config: { presence: { key: me } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
      setOnline(new Set());
    };
  }, [me]);
}

export function useIsOnline(userId?: string | null): boolean {
  const set = useSyncExternalStore(subscribe, () => online, () => online);
  return !!userId && set.has(userId);
}

/* ---------------------------------------------------------------- live right now */

/** Who is live right now (that I may watch): userId -> stream id. One shared query, refreshed live. */
export function useLiveStreams(): Map<string, string> {
  const { data } = useQuery({ queryKey: ["liveNow"], queryFn: fetchLiveNow, refetchInterval: 30_000, staleTime: 15_000 });
  const map = new Map<string, string>();
  for (const s of data ?? []) map.set(s.hostId, s.id);
  return map;
}

/** Mount ONCE (tabs layout): when any stream starts or ends, refresh the live list straight away. */
export function useLiveStatusRealtime() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile?.id;
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`livestatus:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, () => qc.invalidateQueries({ queryKey: ["liveNow"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, qc]);
}
