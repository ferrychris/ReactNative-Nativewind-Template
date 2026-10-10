// Turns a failed call to the `livekit-token` function into a message a person can act on.
// Pure (no app imports) so it can be tested on its own.

const CODES: Record<string, string> = {
  livekit_not_configured: "Live video isn't set up on the server yet: the LiveKit secrets are missing. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET with `supabase secrets set`.",
  stream_not_found: "This stream isn't available.",
  stream_not_live: "This stream isn't live right now.",
  stream_ended: "This stream has ended.",
  not_authenticated: "Please sign in again.",
  invalid_request: "Something went wrong starting the stream.",
};

type FunctionsError = { name?: string; message?: string; context?: unknown };

async function readBody(response: unknown): Promise<{ text: string; json: { error?: string; message?: string; code?: string | number } | null }> {
  const r = response as { text?: () => Promise<string> } | undefined;
  if (!r || typeof r.text !== "function") return { text: "", json: null };
  try {
    const text = await r.text();
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  } catch {
    return { text: "", json: null };
  }
}

export async function explainTokenError(error: FunctionsError): Promise<string> {
  // The function never answered (offline, blocked by the browser, or not deployed so the browser saw no CORS headers)
  if (error.name === "FunctionsFetchError") {
    return "Couldn't connect to the live video service. Check your connection. If you are in a browser, the livekit-token function may not be deployed yet.";
  }
  if (error.name === "FunctionsRelayError") {
    return "The live video service is temporarily unavailable. Try again in a moment.";
  }

  // The function answered with an error status
  const response = error.context as { status?: number } | undefined;
  const status = response?.status;
  const { text, json } = await readBody(error.context);

  if (json?.error && CODES[json.error]) return CODES[json.error];
  if (status === 404) return "The live video function isn't deployed on the server yet. Deploy `livekit-token`.";
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 503 || json?.code === "BOOT_ERROR") return "The live video function failed to start on the server. Redeploy `livekit-token` and check its logs in the Supabase dashboard.";
  if (status && status >= 500) {
    return (
      `The live video function crashed on the server (error ${status}). The usual causes are missing LiveKit secrets ` +
      "or an old version of `livekit-token` still deployed. Deploy it again and set the three LiveKit secrets." +
      (text && text.length < 120 ? ` Server said: "${text.trim()}"` : "")
    );
  }
  return `The live video service returned an error${status ? ` (${status})` : ""}${json?.message ? `: ${json.message}` : ""}.`;
}
