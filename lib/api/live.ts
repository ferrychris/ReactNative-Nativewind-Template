import { supabase } from "@/lib/supabase";
import type { GiftTier } from "@/lib/gifts";

export type LiveStream = {
  id: string;
  hostId: string;
  title: string;
  status: "scheduled" | "live" | "ended";
  startedAt: string | null;
  endedAt: string | null;
  allowGifts: boolean;
  peakViewers: number;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  /** The message this one answers (name and text are kept by the database). */
  replyTo?: { id: string | null; name: string; body: string } | null;
};

export type GiftEvent = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  giftId: string;
  giftName: string;
  giftSlug: string | null;
  tier: GiftTier | null;
  emoji: string;
  amountCents: number;
};

export type Gift = { id: string; slug: string; name: string; emoji: string; tier: GiftTier; priceCents: number };

export const CHAT_LIMIT = 300;

export function liveError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (m.includes("invalid_title")) return "Give your stream a title (up to 80 characters).";
  if (m.includes("row-level security")) return "This stream isn't open for chat.";
  if (m.includes("stream_ended")) return "This stream has ended.";
  if (m.includes("insufficient_funds")) return "Your wallet balance is too low for that gift. Add funds first.";
  if (m.includes("gifts_not_allowed")) return "This streamer isn't taking gifts right now.";
  if (m.includes("gift_unavailable")) return "That gift isn't available.";
  if (m.includes("blocked")) return "You can't send gifts to this streamer.";
  if (m.includes("stream_not_found")) return "This stream isn't available.";
  return m || "Something went wrong. Try again.";
}

/** Step 1: create the stream (nobody is told yet). */
export async function prepareLiveStream(input: { title: string; allowGifts: boolean; followersOnly: boolean; notify: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc("prepare_live_stream", {
    p_title: input.title,
    p_allow_gifts: input.allowGifts,
    p_followers_only: input.followersOnly,
    p_notify: input.notify,
  });
  if (error) throw new Error(liveError(error));
  return data as string;
}

/** Step 2: video is being sent. Goes live and notifies followers. */
export async function publishLiveStream(id: string) {
  const { error } = await supabase.rpc("publish_live_stream", { p_id: id });
  if (error) throw new Error(liveError(error));
}

export async function endLiveStream(id: string, peakViewers: number) {
  const { error } = await supabase.rpc("end_live_stream", { p_id: id, p_peak_viewers: peakViewers });
  if (error) throw new Error(liveError(error));
}

export async function fetchStream(id: string): Promise<LiveStream | null> {
  const { data, error } = await supabase
    .from("live_streams")
    .select("id, host_id, title, status, started_at, ended_at, allow_tips, peak_viewers")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    hostId: data.host_id,
    title: data.title,
    status: data.status,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    allowGifts: data.allow_tips,
    peakViewers: data.peak_viewers,
  };
}

export async function fetchEarningsCents(streamId: string): Promise<number> {
  const { data, error } = await supabase.rpc("live_stream_earnings", { p_id: streamId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** How many gifts have landed on a stream. Dollars are worked out once it ends. */
export async function fetchGiftCount(streamId: string): Promise<number> {
  const { count, error } = await supabase.from("gift_transactions").select("id", { count: "exact", head: true }).eq("stream_id", streamId);
  if (error) throw error;
  return count ?? 0;
}

type ChatRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_to_name?: string | null;
  reply_to_body?: string | null;
  author: { name: string; avatar_url: string | null } | null;
};

export const replyOf = (r: { reply_to_id?: string | null; reply_to_name?: string | null; reply_to_body?: string | null }): ChatMessage["replyTo"] =>
  r.reply_to_name ? { id: r.reply_to_id ?? null, name: r.reply_to_name, body: r.reply_to_body ?? "" } : null;

/** The latest chat messages, oldest first. */
export async function fetchChat(streamId: string, limit = 40): Promise<ChatMessage[]> {
  const author = "author:profiles!live_messages_user_id_fkey(name, avatar_url)";
  const base = "id, user_id, body, created_at";
  const run = (cols: string) => supabase.from("live_messages").select(`${cols}, ${author}`).eq("stream_id", streamId).order("created_at", { ascending: false }).limit(limit);
  let res = await run(`${base}, reply_to_id, reply_to_name, reply_to_body`);
  // the reply columns arrive with the live-replies migration; until then, plain chat still loads
  if (res.error) res = await run(base);
  if (res.error) throw res.error;
  return ((res.data ?? []) as unknown as ChatRow[])
    .map((r) => ({ id: r.id, userId: r.user_id, name: r.author?.name ?? "Someone", avatarUrl: r.author?.avatar_url ?? null, body: r.body, createdAt: r.created_at, replyTo: replyOf(r) }))
    .reverse();
}

/** Posts to the stream's chat (hosts and viewers alike). Returns the saved message, or null if there was nothing to send. */
export async function sendLiveMessage(streamId: string, userId: string, body: string, replyToId?: string | null): Promise<{ id: string; body: string; createdAt: string; replyTo: ChatMessage["replyTo"] } | null> {
  const text = body.trim().slice(0, CHAT_LIMIT);
  if (!text) return null;
  const cols = "id, body, created_at, reply_to_id, reply_to_name, reply_to_body";
  let res = await supabase.from("live_messages").insert({ stream_id: streamId, user_id: userId, body: text, ...(replyToId ? { reply_to_id: replyToId } : {}) }).select(cols).single();
  // before the migration there is no reply column: send it as a normal message instead of failing
  if (res.error && replyToId) res = await supabase.from("live_messages").insert({ stream_id: streamId, user_id: userId, body: text }).select(cols).single();
  if (res.error) throw new Error(liveError(res.error));
  const d = res.data as unknown as ChatRow;
  return { id: d.id, body: d.body, createdAt: d.created_at, replyTo: replyOf(d) };
}

export async function removeLiveMessage(messageId: string) {
  await supabase.from("live_messages").delete().eq("id", messageId);
}

/** Resolves a sender's name/avatar (realtime rows only carry ids). Cached per session. */
const profileCache = new Map<string, { name: string; avatarUrl: string | null }>();
export async function lookupPerson(id: string) {
  const hit = profileCache.get(id);
  if (hit) return hit;
  const { data } = await supabase.from("profiles").select("name, avatar_url").eq("id", id).maybeSingle();
  const person = { name: data?.name ?? "Someone", avatarUrl: data?.avatar_url ?? null };
  profileCache.set(id, person);
  return person;
}

type GiftInfo = { name: string; emoji: string; slug: string | null; tier: GiftTier | null };
const giftCache = new Map<string, GiftInfo>();
export async function lookupGift(id: string): Promise<GiftInfo> {
  const hit = giftCache.get(id);
  if (hit) return hit;
  const { data } = await supabase.from("virtual_gifts").select("name, emoji, slug, tier").eq("id", id).maybeSingle();
  const gift: GiftInfo = { name: data?.name ?? "a gift", emoji: data?.emoji ?? "🎁", slug: data?.slug ?? null, tier: (data?.tier as GiftTier | null) ?? null };
  giftCache.set(id, gift);
  return gift;
}

/** The active gift catalog, cheapest first within each tier. */
export async function fetchGifts(): Promise<Gift[]> {
  const { data, error } = await supabase
    .from("virtual_gifts")
    .select("id, slug, name, emoji, tier, price_cents")
    .eq("is_active", true)
    .not("slug", "is", null)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((g) => ({ id: g.id, slug: g.slug as string, name: g.name, emoji: g.emoji, tier: g.tier as GiftTier, priceCents: g.price_cents as number }));
}

/** Sends a gift to the host of a live stream, paid from the viewer's wallet. */
export async function sendGift(streamId: string, giftId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("send_gift", { p_stream_id: streamId, p_gift_id: giftId });
  if (error) throw new Error(liveError(error));
  return typeof data === "string" ? data : null; // the gift's id, so the sender's own banner isn't shown twice
}

export async function fetchMyBalanceCents(userId: string): Promise<number> {
  const { data } = await supabase.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle();
  return Number(data?.balance_cents ?? 0);
}

/* ------------------------------------------------------------ finding streams to watch */

export type LiveNow = {
  id: string;
  hostId: string;
  title: string;
  startedAt: string | null;
  hostName: string;
  hostUsername: string | null;
  hostAvatarUrl: string | null;
};

/** Streams that are live right now and that I am allowed to watch. */
export async function fetchLiveNow(): Promise<LiveNow[]> {
  const { data, error } = await supabase
    .from("live_now")
    .select("id, host_id, title, started_at, host_name, host_username, host_avatar_url")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    hostId: r.host_id,
    title: r.title,
    startedAt: r.started_at,
    hostName: r.host_name,
    hostUsername: r.host_username,
    hostAvatarUrl: r.host_avatar_url,
  }));
}

export type StreamWithHost = LiveStream & { host: { id: string; name: string; username: string | null; avatarUrl: string | null; isVerified: boolean; location: string | null } };

export async function fetchStreamWithHost(id: string): Promise<StreamWithHost | null> {
  const { data, error } = await supabase
    .from("live_streams")
    .select("id, host_id, title, status, started_at, ended_at, allow_tips, peak_viewers, host:profiles!live_streams_host_id_fkey(id, name, username, avatar_url, is_verified, location)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const host = data.host as unknown as { id: string; name: string; username: string | null; avatar_url: string | null; is_verified: boolean | null; location: string | null } | null;
  return {
    id: data.id,
    hostId: data.host_id,
    title: data.title,
    status: data.status,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    allowGifts: data.allow_tips,
    peakViewers: data.peak_viewers,
    host: { id: host?.id ?? data.host_id, name: host?.name ?? "Host", username: host?.username ?? null, avatarUrl: host?.avatar_url ?? null, isVerified: !!host?.is_verified, location: host?.location?.split(",")[0] ?? null },
  };
}

/** The stream someone is live with right now, if I can see it (for the "Watch live" button on profiles). */
export async function fetchLiveStreamOf(hostId: string): Promise<string | null> {
  const { data } = await supabase
    .from("live_streams")
    .select("id")
    .eq("host_id", hostId)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type StreamRecap = {
  newFollowers: number;
  chatMessages: number;
  supporters: { userId: string; name: string; username: string | null; avatarUrl: string | null; totalCents: number; gifts: number; topGift: string | null }[];
};

/** Extras for the "stream ended" screen: followers gained, chat volume and who gifted the most. */
export async function fetchStreamRecap(streamId: string, hostId: string, startedAt: string | null): Promise<StreamRecap> {
  const followers = startedAt
    ? supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", hostId).gte("created_at", startedAt)
    : Promise.resolve({ count: 0, error: null });
  const [f, chat, gifts] = await Promise.all([
    followers,
    supabase.from("live_messages").select("id", { count: "exact", head: true }).eq("stream_id", streamId),
    supabase
      .from("gift_transactions")
      .select("sender_id, amount_cents, gift:virtual_gifts(name), sender:profiles!gift_transactions_sender_id_fkey(name, username, avatar_url)")
      .eq("stream_id", streamId)
      .limit(500),
  ]);

  type Row = { sender_id: string; amount_cents: number | null; gift: { name: string } | null; sender: { name: string; username: string | null; avatar_url: string | null } | null };
  const bySender = new Map<string, StreamRecap["supporters"][number] & { byGift: Map<string, number> }>();
  for (const r of (gifts.data ?? []) as unknown as Row[]) {
    const cur =
      bySender.get(r.sender_id) ??
      { userId: r.sender_id, name: r.sender?.name ?? "Someone", username: r.sender?.username ?? null, avatarUrl: r.sender?.avatar_url ?? null, totalCents: 0, gifts: 0, topGift: null, byGift: new Map<string, number>() };
    cur.totalCents += r.amount_cents ?? 0;
    cur.gifts += 1;
    if (r.gift?.name) cur.byGift.set(r.gift.name, (cur.byGift.get(r.gift.name) ?? 0) + 1);
    bySender.set(r.sender_id, cur);
  }
  const supporters = [...bySender.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 5)
    .map(({ byGift, ...rest }) => ({ ...rest, topGift: [...byGift.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));

  return { newFollowers: f.count ?? 0, chatMessages: chat.count ?? 0, supporters };
}
