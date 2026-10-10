import { supabase } from "@/lib/supabase";

/** Dollars typed by a person to whole cents; empty or zero means "not offered". */
const toCents = (dollars?: number) => (dollars && Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null);

/** Any member can run sponsorship: list a place on the car / bike / kit that people can bid on. */
type SpotInput = { name: string; description?: string; minBidDollars: number; pricePerRaceDollars?: number; pricePerSeasonDollars?: number; seasonRaces?: number; xPct?: number; yPct?: number };
const pct = (n?: number) => `${Math.round(Math.min(100, Math.max(0, n ?? 50)))}%`;

export async function createSponsorshipSpot(userId: string, input: SpotInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the spot a name, like \"Hood\" or \"Rear wing\".");
  const minBid = Math.max(0, Math.round((Number.isFinite(input.minBidDollars) ? input.minBidDollars : 0) * 100));
  const { error } = await supabase.from("sponsorship_spots").insert({
    creator_id: userId,
    spot_name: name,
    position_left: pct(input.xPct),
    position_top: pct(input.yPct),
    description: input.description?.trim() || null,
    min_bid_cents: minBid,
    price_per_race_cents: toCents(input.pricePerRaceDollars),
    price_per_season_cents: toCents(input.pricePerSeasonDollars),
    season_races: input.pricePerSeasonDollars && input.seasonRaces && input.seasonRaces > 0 ? Math.round(input.seasonRaces) : null,
  });
  if (error) throw new Error(error.message);
}

/** Several spots at once (the "select parts of the car" flow): one insert, so it all saves or none of it does. */
export async function createSponsorshipSpots(userId: string, inputs: SpotInput[]) {
  if (inputs.length === 0) throw new Error("Pick at least one part of the car.");
  const rows = inputs.map((input) => {
    const name = input.name.trim();
    if (!name) throw new Error("Every spot needs a name.");
    return {
      creator_id: userId,
      spot_name: name,
      position_left: pct(input.xPct),
      position_top: pct(input.yPct),
      description: input.description?.trim() || null,
      min_bid_cents: Math.max(0, Math.round((Number.isFinite(input.minBidDollars) ? input.minBidDollars : 0) * 100)),
      price_per_race_cents: toCents(input.pricePerRaceDollars),
      price_per_season_cents: toCents(input.pricePerSeasonDollars),
      season_races: input.pricePerSeasonDollars && input.seasonRaces && input.seasonRaces > 0 ? Math.round(input.seasonRaces) : null,
    };
  });
  const { error } = await supabase.from("sponsorship_spots").insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateSponsorshipSpot(spotId: string, input: SpotInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the spot a name, like \"Hood\" or \"Rear wing\".");
  const { error } = await supabase
    .from("sponsorship_spots")
    .update({
      spot_name: name,
      position_left: pct(input.xPct),
      position_top: pct(input.yPct),
      description: input.description?.trim() || null,
      min_bid_cents: Math.max(0, Math.round((Number.isFinite(input.minBidDollars) ? input.minBidDollars : 0) * 100)),
      price_per_race_cents: toCents(input.pricePerRaceDollars),
      price_per_season_cents: toCents(input.pricePerSeasonDollars),
      season_races: input.pricePerSeasonDollars && input.seasonRaces && input.seasonRaces > 0 ? Math.round(input.seasonRaces) : null,
    })
    .eq("id", spotId);
  if (error) throw new Error(error.message);
}

export async function deleteSponsorshipSpot(spotId: string) {
  const { error } = await supabase.from("sponsorship_spots").delete().eq("id", spotId);
  if (error) throw new Error(error.message);
}

/** Owner accepts the highest open bid on a decal spot (charges the bidder's wallet). */
export async function acceptTopBid(spotId: string) {
  const { data: bid, error } = await supabase
    .from("sponsorship_bids")
    .select("id")
    .eq("spot_id", spotId)
    .eq("status", "open")
    .order("amount_cents", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!bid) throw new Error("There are no open bids on this spot.");
  const { error: rpcError } = await supabase.rpc("accept_bid", { p_bid_id: bid.id });
  if (rpcError) {
    throw new Error(rpcError.message.includes("insufficient_funds") ? "The bidder no longer has enough balance." : rpcError.message);
  }
}

/** Bid on someone's sponsorship spot. You are only charged if the owner accepts. */
export async function placeBid(spotId: string, amountCents: number, message?: string) {
  const { error } = await supabase.rpc("place_bid", { p_spot_id: spotId, p_amount_cents: amountCents, p_races: 1, p_message: message ?? null });
  if (!error) return;
  const m = error.message;
  if (m.includes("bid_below_minimum")) throw new Error("That's below the minimum bid.");
  if (m.includes("insufficient_funds")) throw new Error("Your wallet balance is lower than your bid. Add funds first.");
  if (m.includes("cannot_bid_on_own_spot")) throw new Error("You can't bid on your own spot.");
  if (m.includes("spot_unavailable")) throw new Error("This spot has already been sponsored.");
  throw new Error(m);
}

/* ---------------- sponsor accounts and offers ---------------- */

export type SponsorInput = { businessName: string; city?: string; website?: string; contactEmail?: string; about?: string };

/** One-time upgrade: turns the signed-in member into a sponsor. Safe to call again to update the business details. */
export async function becomeSponsor(input: SponsorInput) {
  const name = input.businessName.trim();
  if (name.length < 2) throw new Error("Enter your business name.");
  const { error } = await supabase.rpc("become_sponsor", {
    p_business_name: name,
    p_city: input.city?.trim() || null,
    p_website: input.website?.trim() || null,
    p_contact_email: input.contactEmail?.trim() || null,
    p_about: input.about?.trim() || null,
    p_logo_url: null,
  });
  if (!error) return;
  if (error.message.includes("track_cannot_sponsor")) throw new Error("Track accounts can't sponsor. Use a personal account for that.");
  throw new Error("Couldn't set up your sponsor account. Check your connection and try again.");
}

/** Buy a spot at its listed price (`customDollars` unset) or propose your own amount. Returns the new deal's id. */
export async function makeOffer(input: { spotId: string; pricing: "race" | "season"; races: number; message?: string; customDollars?: number }): Promise<string> {
  const custom = input.customDollars !== undefined ? Math.round(input.customDollars * 100) : null;
  const { data, error } = await supabase.rpc("make_offer", {
    p_spot_id: input.spotId,
    p_pricing: input.pricing,
    p_races: Math.max(1, Math.round(input.races) || 1),
    p_message: input.message?.trim() || null,
    p_custom_amount_cents: custom,
  });
  if (error) {
    const m = error.message;
    if (m.includes("sponsor_account_required")) throw new Error("Set up your sponsor account first.");
    if (m.includes("offer_already_pending")) throw new Error("You already have an offer waiting on this spot.");
    if (m.includes("spot_unavailable")) throw new Error("This spot has already gone to another sponsor.");
    if (m.includes("cannot_sponsor_yourself")) throw new Error("You can't sponsor yourself.");
    if (m.includes("offer_too_small")) throw new Error("Offers start at $1.");
    if (m.includes("pricing_not_offered")) throw new Error("The racer doesn't sell that option. Propose your own price instead.");
    throw new Error("Couldn't send your offer. Check your connection and try again.");
  }
  return data as string;
}
