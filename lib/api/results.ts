import { supabase } from "@/lib/supabase";
import { FULL_IMAGE_WIDTH, prepareImage } from "@/lib/media";
import type { RaceResultRow } from "@/lib/types";

type Row = {
  id: string;
  position: number | null;
  points: number | null;
  race_date: string;
  title: string | null;
  venue: string | null;
  class_label: string | null;
  event_id: string | null;
  event: { event_title: string; series: { name: string } | null; track: { name: string; location: string | null } | null } | null;
};

/** A racer's results, newest first. Results linked to a track's published event count as verified. */
export async function fetchRaceResults(racerId: string, limit = 50): Promise<RaceResultRow[]> {
  const { data, error } = await supabase
    .from("race_results")
    .select("id, position, points, race_date, title, venue, class_label, event_id, event:track_events(event_title, series:race_series(name), track:tracks(name, location))")
    .eq("racer_id", racerId)
    .order("race_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.event?.event_title ?? r.title ?? "Race",
    venue: r.event?.track?.name ?? r.venue,
    raceDate: r.race_date,
    classLabel: r.event?.series?.name ?? r.class_label,
    position: r.position,
    points: r.points,
    verified: !!r.event_id,
  }));
}

export type NewResult = { title: string; venue: string; classLabel: string; raceDate: string; position: string; points: string };

/** Self-reported result (shows without the Verified tag until a track links it to its event). */
export async function addRaceResult(racerId: string, input: NewResult) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the race a name, like \"Monza 4H Endurance\".");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.raceDate.trim()) || Number.isNaN(Date.parse(input.raceDate.trim()))) throw new Error("Enter the date as YYYY-MM-DD, like 2025-10-14.");
  const position = input.position.trim() ? parseInt(input.position, 10) : null;
  if (position !== null && (!Number.isFinite(position) || position < 1 || position > 999)) throw new Error("Finishing position must be a number from 1 up.");
  const points = input.points.trim() ? parseInt(input.points, 10) : null;
  if (points !== null && (!Number.isFinite(points) || points < 0)) throw new Error("Points must be a number.");
  const { error } = await supabase.from("race_results").insert({
    racer_id: racerId,
    title,
    venue: input.venue.trim() || null,
    class_label: input.classLabel.trim() || null,
    race_date: input.raceDate.trim(),
    position,
    points,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRaceResult(id: string) {
  const { error } = await supabase.from("race_results").delete().eq("id", id).is("event_id", null);
  if (error) throw new Error(error.message);
}

/** Puts a new photo first in the racer's car photos (uploaded to the public avatars bucket, in their own folder). */
export async function setCarPhoto(racerId: string, source: { uri: string; file?: Blob | null }) {
  const image = await prepareImage(source, FULL_IMAGE_WIDTH, undefined, 0.85);
  const path = `${racerId}/car-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, image.bytes, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { data: cp } = await supabase.from("creator_profiles").select("car_photos").eq("id", racerId).maybeSingle();
  const existing = Array.isArray(cp?.car_photos) ? (cp!.car_photos as unknown[]) : [];
  const { error: updateError } = await supabase.from("creator_profiles").update({ car_photos: [url, ...existing].slice(0, 12) }).eq("id", racerId);
  if (updateError) throw new Error(updateError.message);
  return url;
}
