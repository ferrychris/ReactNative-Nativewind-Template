// Supabase Edge Function: livekit-token
//
// Gives the app a short-lived LiveKit token for ONE live stream.
//   host   (the stream's owner)           -> may publish camera + microphone
//   viewer (anyone allowed to watch it)   -> may only subscribe
//
// Secrets (supabase secrets set ...): LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
// The API secret never leaves this function. The app only ever receives a token.
//
// Who may watch is decided by the database: the stream is read with the CALLER's own login,
// so row-level security hides followers-only streams from people who don't follow the host.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!livekitUrl || !apiKey || !apiSecret) return json({ error: "livekit_not_configured" }, 500);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "not_authenticated" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "not_authenticated" }, 401);
  const user = auth.user;

  let streamId: unknown;
  try {
    streamId = (await req.json())?.streamId;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (typeof streamId !== "string" || !UUID.test(streamId)) return json({ error: "invalid_request" }, 400);

  // Read with the caller's login: a stream they may not see simply does not exist for them.
  const { data: stream, error: streamError } = await supabase
    .from("live_streams")
    .select("id, host_id, status")
    .eq("id", streamId)
    .maybeSingle();
  if (streamError) return json({ error: "lookup_failed" }, 500);
  if (!stream) return json({ error: "stream_not_found" }, 404);

  const isHost = stream.host_id === user.id;
  if (isHost && stream.status === "ended") return json({ error: "stream_ended" }, 409);
  if (!isHost && stream.status !== "live") return json({ error: "stream_not_live" }, 409);

  if (!isHost) {
    const { data: blocked } = await supabase.rpc("is_blocked_between", { a: user.id, b: stream.host_id });
    if (blocked) return json({ error: "stream_not_found" }, 404);
  }

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.name ?? "Guest",
    ttl: isHost ? "4h" : "2h",
    metadata: JSON.stringify({ role: isHost ? "host" : "viewer" }),
  });
  token.addGrant({
    roomJoin: true,
    room: `stream_${stream.id}`,
    canPublish: isHost,
    canPublishData: false, // chat goes through the database, not through LiveKit
    canSubscribe: true,
  });

  return json({ token: await token.toJwt(), url: livekitUrl, role: isHost ? "host" : "viewer", room: `stream_${stream.id}` });
});
