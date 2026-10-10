import { useCallback, useEffect, useRef } from "react";
import { lookupGift, lookupPerson, type GiftEvent } from "@/lib/api/live";
import { playGiftSound } from "@/lib/gifts";
import { supabase } from "@/lib/supabase";
import { newChannel } from "@/lib/realtime";

type Row = { id: string; sender_id: string; gift_id: string; amount_cents?: number };

/**
 * Calls `onGift` for every gift sent in a stream, for everyone in the room (plays its sound too).
 *
 * Listens to live_gift_events, which every viewer may read. It also listens to gift_transactions,
 * which only the sender and the host can read: that keeps the host's banner working on a database
 * where the events table doesn't exist yet. The same gift arriving twice is ignored.
 */
export function useLiveGifts(streamId: string, onGift: (event: GiftEvent) => void, enabled = true) {
  const seenRef = useRef(new Set<string>());
  const latest = useRef(onGift);
  useEffect(() => {
    latest.current = onGift;
  }, [onGift]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const seen = seenRef.current;

    const handle = async (r: Row) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      const [person, gift] = await Promise.all([lookupPerson(r.sender_id), lookupGift(r.gift_id)]);
      if (!active) return;
      playGiftSound(gift.slug);
      latest.current({
        id: r.id,
        senderId: r.sender_id,
        senderName: person.name,
        senderAvatarUrl: person.avatarUrl,
        giftId: r.gift_id,
        giftName: gift.name,
        giftSlug: gift.slug,
        tier: gift.tier,
        emoji: gift.emoji,
        amountCents: r.amount_cents ?? 0,
      });
    };

    const channel = newChannel(`gifts:${streamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_gift_events", filter: `stream_id=eq.${streamId}` }, (p) => handle(p.new as Row))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gift_transactions", filter: `stream_id=eq.${streamId}` }, (p) => handle(p.new as Row))
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [streamId, enabled]);

  /**
   * The sender's own gift: show it at once instead of waiting for the database round trip.
   * Its realtime echo (same id) is then ignored, so the banner and sound happen once.
   */
  return useCallback((event: GiftEvent) => {
    if (seenRef.current.has(event.id)) return;
    seenRef.current.add(event.id);
    playGiftSound(event.giftSlug);
    latest.current(event);
  }, []);
}
