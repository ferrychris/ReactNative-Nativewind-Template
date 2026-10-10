import type { ProfileView } from "./types";

type Decal = ProfileView["decals"][number];

/** Typical positions on a side view of a car (x: 0 = left edge, 100 = right edge; y: 0 = top, 100 = bottom). */
const PRESETS: Record<string, [number, number]> = {
  "front bumper": [12, 62],
  hood: [26, 48],
  "windshield banner": [40, 36],
  roof: [52, 24],
  doors: [52, 56],
  "side skirts": [50, 76],
  trunk: [74, 46],
  "rear wing": [88, 32],
  helmet: [14, 18],
  "race suit": [86, 80],
};

export const presetFor = (name: string): [number, number] => PRESETS[name.trim().toLowerCase()] ?? [50, 50];

/**
 * Where to draw a saved spot: the position the racer picked, or (for spots never placed, still at the
 * default centre) a sensible one by name, spread out so tags don't sit on top of each other.
 */
export function spotPosition(d: Pick<Decal, "placement" | "xPct" | "yPct">, index = 0): [number, number] {
  if (d.xPct !== 50 || d.yPct !== 50) return [d.xPct, d.yPct];
  const preset = presetFor(d.placement);
  if (preset[0] !== 50 || preset[1] !== 50) return preset;
  return [30 + (index % 4) * 14, 30 + (index % 3) * 18];
}

/** What one race costs on a spot: its per-race price, or the season price spread over the season's races. */
export const raceRate = (d: Pick<Decal, "pricePerRaceCents" | "pricePerSeasonCents" | "seasonRaces">): number | null =>
  d.pricePerRaceCents ?? (d.pricePerSeasonCents && d.seasonRaces ? Math.round(d.pricePerSeasonCents / d.seasonRaces) : null);

/** The cheapest open spot on the car (per race), or null when nothing open has a price. */
export function cheapestOpenSpot(decals: Decal[]): { id: string; cents: number; placement: string } | null {
  let best: { id: string; cents: number; placement: string } | null = null;
  for (const d of decals) {
    if (!d.available) continue;
    const c = raceRate(d);
    if (c !== null && (best === null || c < best.cents)) best = { id: d.id, cents: c, placement: d.placement };
  }
  return best;
}
