// Supabase Edge Function: push-notify
//
// Sends a phone push (through Expo's push service) when something happens. It is called by Supabase
// Database Webhooks, one per table:
//   public.notifications  INSERT  -> follows, likes, comments, replies, gifts, bids, "is live now"...
//   public.messages       INSERT  -> new chat messages (and message requests)
//
// Setup, once:
//   1. supabase secrets set PUSH_WEBHOOK_SECRET=<a long random string>
//      (optional) supabase secrets set EXPO_ACCESS_TOKEN=<token>   // only if "enhanced push security" is on in Expo
//   2. supabase functions deploy push-notify --no-verify-jwt
//   3. Dashboard > Database > Webhooks > Create webhook, twice (notifications, messages):
//        Events: Insert · Type: Supabase Edge Functions · Function: push-notify
//        HTTP header: x-webhook-secret = <the same string>
//
// The webhook sends no Supabase login, so the shared secret is what proves the request is ours.

import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100; // Expo accepts up to 100 messages per request

type Push = { to: string; title: string; body: string; data: Record<string, unknown>; sound: "default"; channelId: string; priority: "high" };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** Compares secrets without leaking where they differ. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tokensOf(userIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const { data } = await db.from("push_tokens").select("user_id, token").in("user_id", userIds);
  for (const r of data ?? []) out.set(r.user_id, [...(out.get(r.user_id) ?? []), r.token]);
  return out;
}

async function send(messages: Push[]) {
  const bad: string[] = [];
  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    const access = Deno.env.get("EXPO_ACCESS_TOKEN");
    if (access) headers.authorization = `Bearer ${access}`;
    const res = await fetch(EXPO_URL, { method: "POST", headers, body: JSON.stringify(batch) });
    if (!res.ok) {
      console.error("expo push failed", res.status, await res.text());
      continue;
    }
    const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    (data ?? []).forEach((ticket, idx) => {
      // the phone no longer has this app installed (or the token changed): stop sending to it
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") bad.push(batch[idx].to);
    });
  }
  if (bad.length > 0) await db.from("push_tokens").delete().in("token", bad);
}

/** One row of `notifications` -> one push to its owner. */
async function fromNotification(n: Record<string, string | null>): Promise<Push[]> {
  if (!n.user_id) return [];
  const tokens = (await tokensOf([n.user_id])).get(n.user_id) ?? [];
  if (tokens.length === 0) return [];
  let actorUsername: string | null = null;
  if (n.actor_id) {
    const { data } = await db.from("profiles").select("username").eq("id", n.actor_id).maybeSingle();
    actorUsername = data?.username ?? null;
  }
  const channelId = n.type === "live" ? "live" : "default";
  return tokens.map((to) => ({
    to,
    title: n.title ?? "Heatlap",
    body: n.message ?? "",
    data: { type: n.type, entityType: n.entity_type, entityId: n.entity_id, actorUsername, notificationId: n.id },
    sound: "default",
    channelId,
    priority: "high",
  }));
}

/** A new chat message -> a push to everyone else in the conversation (skips muted chats and blocked people). */
async function fromMessage(m: Record<string, string | null>): Promise<Push[]> {
  if (!m.conversation_id || !m.sender_id || m.kind === "system") return [];
  const { data: members } = await db.from("conversation_members").select("user_id, muted, accepted").eq("conversation_id", m.conversation_id).neq("user_id", m.sender_id);
  const targets = (members ?? []).filter((x) => !x.muted);
  if (targets.length === 0) return [];

  const { data: blocks } = await db
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${m.sender_id},blocked_id.in.(${targets.map((t) => t.user_id).join(",")})),and(blocked_id.eq.${m.sender_id},blocker_id.in.(${targets.map((t) => t.user_id).join(",")}))`);
  const blocked = new Set((blocks ?? []).flatMap((b) => [b.blocker_id, b.blocked_id]));

  const { data: sender } = await db.from("profiles").select("name").eq("id", m.sender_id).maybeSingle();
  const name = sender?.name ?? "Someone";
  const preview = (m.body ?? "").trim().slice(0, 140) || "Sent a photo";

  const recipients = targets.filter((t) => !blocked.has(t.user_id));
  const tokens = await tokensOf(recipients.map((r) => r.user_id));
  const out: Push[] = [];
  for (const r of recipients) {
    for (const to of tokens.get(r.user_id) ?? []) {
      out.push({
        to,
        title: r.accepted === false ? "New message request" : name,
        // a request shows no text until it is accepted
        body: r.accepted === false ? `${name} wants to message you` : preview,
        data: { type: "message", conversationId: m.conversation_id },
        sound: "default",
        channelId: "messages",
        priority: "high",
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expected) return new Response("not configured", { status: 500 });
  if (!sameSecret(req.headers.get("x-webhook-secret") ?? "", expected)) return new Response("unauthorized", { status: 401 });

  let payload: { type?: string; table?: string; record?: Record<string, string | null> };
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (payload.type !== "INSERT" || !payload.record) return new Response("ignored", { status: 200 });

  try {
    const pushes =
      payload.table === "notifications" ? await fromNotification(payload.record) : payload.table === "messages" ? await fromMessage(payload.record) : [];
    if (pushes.length > 0) await send(pushes);
    return new Response(JSON.stringify({ sent: pushes.length }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("push-notify error", e);
    return new Response("error", { status: 500 });
  }
});
