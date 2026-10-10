import { supabase } from "@/lib/supabase";

export type VehicleType = { id: string; slug: string; name: string; category: string };

export type TypeZone = {
  id: string;
  key: string;
  name: string;
  /** "vehicle" zones sit on the machine; "driver" zones (helmet, suit, gloves) belong to the person. */
  kind: "vehicle" | "driver";
  /** Suggested position on a side-view photo, 0..100. */
  xPct: number;
  yPct: number;
  size: "small" | "medium" | "large";
};

export type Series = { id: string; name: string; country: string | null; sport: string | null };

// Used until the zone-template migration is applied, so the picker still works.
const FALLBACK_TYPE: VehicleType = { id: "fallback", slug: "sports_car", name: "Sports / GT car", category: "car" };
const z = (key: string, name: string, xPct: number, yPct: number, size: TypeZone["size"], kind: TypeZone["kind"] = "vehicle"): TypeZone => ({ id: `fallback-${key}`, key, name, kind, xPct, yPct, size });
const FALLBACK_ZONES: TypeZone[] = [
  z("front_bumper", "Front bumper", 12, 62, "small"),
  z("hood", "Hood", 26, 48, "large"),
  z("windshield_banner", "Windshield banner", 40, 36, "medium"),
  z("roof", "Roof", 52, 24, "medium"),
  z("doors", "Doors", 52, 56, "large"),
  z("side_skirts", "Side skirts", 50, 76, "small"),
  z("trunk", "Trunk", 74, 46, "medium"),
  z("rear_wing", "Rear wing", 88, 32, "medium"),
  z("helmet", "Helmet", 14, 18, "small", "driver"),
  z("race_suit", "Race suit / kit", 86, 80, "large", "driver"),
  z("gloves", "Gloves", 92, 64, "small", "driver"),
];

/** All vehicle types a racer can pick from (car, bike, bicycle, kart, bus, boat, ...). */
export async function fetchVehicleTypes(): Promise<VehicleType[]> {
  const { data, error } = await supabase.from("vehicle_types").select("id, slug, name, category").order("sort_order").order("name");
  if (error || !data || data.length === 0) return [FALLBACK_TYPE];
  return data as VehicleType[];
}

/** The zone template for a vehicle type: its vehicle zones followed by driver gear. */
export async function fetchTypeZones(vehicleTypeId: string): Promise<TypeZone[]> {
  if (vehicleTypeId === FALLBACK_TYPE.id) return FALLBACK_ZONES;
  const { data, error } = await supabase
    .from("vehicle_type_zones")
    .select("id, zone_key, name, kind, x_pct, y_pct, size")
    .eq("vehicle_type_id", vehicleTypeId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => ({ id: z.id, key: z.zone_key, name: z.name, kind: z.kind, xPct: z.x_pct, yPct: z.y_pct, size: z.size }));
}

// commas and percent signs would break the PostgREST filter / LIKE pattern
const clean = (q: string) => q.replace(/[%,()*\\]/g, " ").trim();

/** Championship search for the dropdown: matches anywhere in the name or the country. Empty query lists the first few. */
export async function searchSeries(query: string, limit = 20): Promise<Series[]> {
  const q = clean(query);
  let req = supabase.from("race_series").select("id, name, country, sport").order("name").limit(limit);
  if (q) req = req.or(`name.ilike.%${q}%,country.ilike.%${q}%`);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return (data ?? []) as Series[];
}

/** A championship that isn't in the list yet. Returns the existing one when the name is already taken. */
export async function addSeries(name: string, country?: string): Promise<Series> {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 3) throw new Error("Type the full name of the championship.");
  const { data, error } = await supabase.from("race_series").insert({ name: n, country: country?.trim() || null }).select("id, name, country, sport").single();
  if (!error) return data as Series;
  if (error.code === "23505") {
    const { data: existing } = await supabase.from("race_series").select("id, name, country, sport").ilike("name", n).limit(1).maybeSingle();
    if (existing) return existing as Series;
  }
  throw new Error(error.message);
}
