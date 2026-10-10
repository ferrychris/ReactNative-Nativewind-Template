import { supabase } from "@/lib/supabase";
import { FULL_IMAGE_WIDTH, prepareImage, type MediaSource } from "@/lib/media";

export type DealStatus = "offered" | "accepted" | "paid" | "delivered" | "confirmed" | "disputed" | "refunded" | "declined" | "cancelled";

export type Deal = {
  id: string;
  spotId: string;
  spotName: string;
  racerId: string;
  sponsorId: string;
  sponsorName: string;
  sponsorLogoUrl: string | null;
  pricing: "race" | "season";
  races: number;
  amountCents: number;
  feeBps: number;
  custom: boolean;
  message: string | null;
  status: DealStatus;
  offeredAt: string;
  autoConfirmAt: string | null;
  disputeReason: string | null;
};

/** What the racer keeps once the fee is taken. */
export const racerShareCents = (d: Pick<Deal, "amountCents" | "feeBps">) => d.amountCents - Math.round((d.amountCents * d.feeBps) / 10_000);

const ACTIVE: DealStatus[] = ["accepted", "paid", "delivered", "disputed"];
export const isActiveDeal = (d: Deal) => ACTIVE.includes(d.status);

type Row = {
  id: string;
  spot_id: string;
  racer_id: string;
  sponsor_id: string;
  pricing: "race" | "season";
  races: number;
  amount_cents: number;
  fee_bps: number;
  custom: boolean;
  message: string | null;
  status: DealStatus;
  offered_at: string;
  auto_confirm_at: string | null;
  dispute_reason: string | null;
  spot: { spot_name: string } | null;
};

/** Deals where `userId` is the racer (offers to answer, work to deliver) or the sponsor, newest first. */
export async function fetchDeals(userId: string, side: "racer" | "sponsor"): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("sponsorship_deals")
    .select("id, spot_id, racer_id, sponsor_id, pricing, races, amount_cents, fee_bps, custom, message, status, offered_at, auto_confirm_at, dispute_reason, spot:sponsorship_spots(spot_name)")
    .eq(side === "racer" ? "racer_id" : "sponsor_id", userId)
    .order("offered_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.sponsor_id))];
  const { data: sponsors } = ids.length ? await supabase.from("sponsors").select("id, business_name, logo_url").in("id", ids) : { data: [] };
  const byId = new Map((sponsors ?? []).map((s) => [s.id as string, s]));
  return rows.map((r) => ({
    id: r.id,
    spotId: r.spot_id,
    spotName: r.spot?.spot_name ?? "Sponsorship spot",
    racerId: r.racer_id,
    sponsorId: r.sponsor_id,
    sponsorName: byId.get(r.sponsor_id)?.business_name ?? "A sponsor",
    sponsorLogoUrl: byId.get(r.sponsor_id)?.logo_url ?? null,
    pricing: r.pricing,
    races: r.races,
    amountCents: r.amount_cents,
    feeBps: r.fee_bps,
    custom: r.custom,
    message: r.message,
    status: r.status,
    offeredAt: r.offered_at,
    autoConfirmAt: r.auto_confirm_at,
    disputeReason: r.dispute_reason,
  }));
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  deal_not_found: "This deal isn't available any more.",
  deal_not_open: "This offer has already been answered.",
  deal_cannot_be_cancelled: "This deal can't be cancelled any more.",
  deal_not_ready_for_proof: "Proof can be posted once the sponsor has paid.",
  spot_unavailable: "That spot has already gone to another sponsor.",
  photo_required: "Add a photo of the car with the logo on it.",
  reason_required: "Tell us what's wrong.",
  dispute_window_closed: "The 7 days to dispute have passed.",
};

export function dealError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  for (const key of Object.keys(MESSAGES)) if (m.includes(key)) return MESSAGES[key];
  return "Something went wrong. Check your connection and try again.";
}

export async function respondToOffer(dealId: string, accept: boolean) {
  const { error } = await supabase.rpc("respond_to_offer", { p_deal_id: dealId, p_accept: accept });
  if (error) throw new Error(dealError(error));
}

export async function cancelDeal(dealId: string, reason?: string) {
  const { error } = await supabase.rpc("cancel_deal", { p_deal_id: dealId, p_reason: reason ?? null });
  if (error) throw new Error(dealError(error));
}

/** Uploads the photo, then records it. If recording fails the photo is removed again. */
export async function submitProof(dealId: string, photo: MediaSource, eventLabel: string, note?: string) {
  const label = eventLabel.trim();
  if (!label) throw new Error("Say which race this is, like \"Round 3 at Austin\".");
  const image = await prepareImage(photo, FULL_IMAGE_WIDTH, undefined, 0.85);
  const path = `${dealId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("deal-proofs").upload(path, image.bytes, { contentType: "image/jpeg" });
  if (uploadError) throw new Error(dealError(uploadError));
  const { error } = await supabase.rpc("submit_proof", { p_deal_id: dealId, p_photo_path: path, p_event_label: label, p_event_id: null, p_note: note?.trim() || null });
  if (error) {
    await supabase.storage.from("deal-proofs").remove([path]).catch(() => {});
    throw new Error(dealError(error));
  }
}
