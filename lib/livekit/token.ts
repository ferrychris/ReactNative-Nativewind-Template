import { supabase } from "@/lib/supabase";
import { explainTokenError } from "./tokenError";

export type LiveToken = { token: string; url: string; role: "host" | "viewer"; room: string };

/** Asks the `livekit-token` function for a token. The LiveKit secret never reaches the app. */
export async function fetchLiveToken(streamId: string): Promise<LiveToken> {
  const { data, error } = await supabase.functions.invoke("livekit-token", { body: { streamId } });
  if (error) throw new Error(await explainTokenError(error));
  if (!data?.token || !data?.url) throw new Error("The live video service sent an invalid response. Make sure the latest `livekit-token` is deployed.");
  return data as LiveToken;
}
