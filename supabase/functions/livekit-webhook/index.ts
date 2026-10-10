// Supabase Edge Function: livekit-webhook
//
// LiveKit calls this when something happens in a room. It keeps the database honest:
//   participant_left (the host)  -> the stream is marked 'ended'   (host's app crashed / lost signal for good)
//   room_finished                -> the stream is marked 'ended'
// Without this a stream could stay 'live' forever and viewers would watch a black screen.
//
// Setup (LiveKit Cloud > Settings > Webhooks): add the URL
//   https://<project-ref>.supabase.co/functions/v1/livekit-webhook
// This function must be deployed WITHOUT Supabase JWT verification (LiveKit has no Supabase login);
// the request is authenticated by LiveKit's own signature instead:
//   supabase functions deploy livekit-webhook --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { WebhookReceiver } from "npm:livekit-server-sdk@2";

const ROOM_PREFIX = "stream_";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!apiKey || !apiSecret) return new Response("not configured", { status: 500 });

  const body = await req.text();
  const receiver = new WebhookReceiver(apiKey, apiSecret);

  let event;
  try {
    // verifies the signature in the Authorization header and the body hash
    event = await receiver.receive(body, req.headers.get("Authorization") ?? undefined);
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const roomName = event.room?.name ?? "";
  if (!roomName.startsWith(ROOM_PREFIX)) return new Response("ignored", { status: 200 });
  const streamId = roomName.slice(ROOM_PREFIX.length);

  let shouldEnd = event.event === "room_finished";
  if (event.event === "participant_left") {
    try {
      shouldEnd = JSON.parse(event.participant?.metadata || "{}").role === "host";
    } catch {
      shouldEnd = false;
    }
  }
  if (!shouldEnd) return new Response("ok", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin
    .from("live_streams")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", streamId)
    .neq("status", "ended");
  if (error) return new Response("update failed", { status: 500 }); // LiveKit retries

  return new Response("ok", { status: 200 });
});
