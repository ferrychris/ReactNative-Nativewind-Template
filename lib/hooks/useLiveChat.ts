import { useCallback, useEffect, useState } from "react";
import { fetchChat, lookupPerson, replyOf, sendLiveMessage, liveError, type ChatMessage } from "@/lib/api/live";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";

const KEEP = 60;

/** Live chat for one stream: loads the latest messages and receives new ones as they are sent. */
export function useLiveChat(streamId: string, enabled = true) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchChat(streamId)
      .then((m) => active && setMessages(m))
      .catch(() => {});

    const channel = newChannel(`livechat:${streamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `stream_id=eq.${streamId}` }, async (payload) => {
        const r = payload.new as { id: string; user_id: string; body: string; created_at: string; reply_to_id?: string | null; reply_to_name?: string | null; reply_to_body?: string | null };
        const person = await lookupPerson(r.user_id);
        if (!active) return;
        setMessages((prev) =>
          prev.some((m) => m.id === r.id)
            ? prev
            : [...prev, { id: r.id, userId: r.user_id, name: person.name, avatarUrl: person.avatarUrl, body: r.body, createdAt: r.created_at, replyTo: replyOf(r) }].slice(-KEEP),
        );
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "live_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id && active) setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [streamId, enabled]);

  const send = useCallback(
    async (text: string, replyToId?: string | null): Promise<boolean> => {
      if (!profile || sending) return false;
      setSending(true);
      setError(null);
      try {
        const saved = await sendLiveMessage(streamId, profile.id, text, replyToId);
        // Show our own message right away; the realtime echo is ignored because the id matches
        if (saved) {
          setMessages((prev) =>
            prev.some((m) => m.id === saved.id)
              ? prev
              : [...prev, { id: saved.id, userId: profile.id, name: profile.name, avatarUrl: profile.avatar_url, body: saved.body, createdAt: saved.createdAt, replyTo: saved.replyTo }].slice(-KEEP),
          );
        }
        return true;
      } catch (e) {
        setError(liveError(e));
        return false;
      } finally {
        setSending(false);
      }
    },
    [profile, sending, streamId],
  );

  return { messages, send, sending, error };
}
