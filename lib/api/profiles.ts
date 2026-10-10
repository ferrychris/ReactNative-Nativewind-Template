import { supabase } from "@/lib/supabase";
import { USERNAME_RE } from "@/lib/format";
import { AVATAR_IMAGE_WIDTH, FULL_IMAGE_WIDTH, prepareImage } from "@/lib/media";
import { fetchLiveStreamOf } from "@/lib/api/live";
import type { Profile, ProfileView, UserType } from "@/lib/types";

type Lookup = { id: string } | { username: string };

/** car_photos is free-form jsonb: accept ["url"] or [{ url }]. */
function firstPhotoUrl(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const f = v[0];
  if (typeof f === "string") return f;
  if (f && typeof f === "object" && "url" in f && typeof (f as { url: unknown }).url === "string") return (f as { url: string }).url;
  return null;
}

type SpotRow = { id: string; spot_name: string; description: string | null; min_bid_cents: number | null; is_available: boolean; position_top?: string | null; position_left?: string | null; price_per_race_cents?: number | null; price_per_season_cents?: number | null; season_races?: number | null };

/** Post count + likes received in one call; falls back to the old two queries until the perf migration is applied. */
async function loadPostStats(userId: string): Promise<{ posts: number; likes: number }> {
  const rpc = await supabase.rpc("profile_post_stats", { p_user: userId });
  if (!rpc.error) {
    const r = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { posts_count?: number; likes_count?: number } | null;
    return { posts: Number(r?.posts_count ?? 0), likes: Number(r?.likes_count ?? 0) };
  }
  const [posts, likeRows] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId).is("deleted_at", null),
    supabase.from("posts").select("likes_count").eq("author_id", userId).is("deleted_at", null).limit(1000),
  ]);
  return { posts: posts.count ?? 0, likes: (likeRows.data ?? []).reduce((n, r) => n + Number(r.likes_count ?? 0), 0) };
}

export async function loadRacer(id: string, year: number): Promise<NonNullable<ProfileView["racer"]>> {
  const [cp, season] = await Promise.all([
    supabase.from("creator_profiles").select("car_number, racing_class, team_name, career_wins, podiums, championships, years_racing, car_photos").eq("id", id).maybeSingle(),
    supabase.from("racer_season_stats").select("season, wins, podiums, poles, best_lap_ms, avg_grip_idx").eq("racer_id", id).eq("season", year).maybeSingle(),
  ]);
  return {
    carNumber: cp.data?.car_number ?? null,
    racingClass: cp.data?.racing_class ?? null,
    teamName: cp.data?.team_name ?? null,
    careerWins: cp.data?.career_wins ?? 0,
    podiums: cp.data?.podiums ?? 0,
    championships: cp.data?.championships ?? 0,
    carPhotoUrl: firstPhotoUrl(cp.data?.car_photos),
    partners: [],
    yearsRacing: cp.data?.years_racing ?? 0,
    season: season.data
      ? {
          year,
          wins: Number(season.data.wins),
          poles: Number(season.data.poles),
          bestLapMs: season.data.best_lap_ms,
          avgGripIdx: season.data.avg_grip_idx === null ? null : Number(season.data.avg_grip_idx),
        }
      : null,
  };
}

/** Favourites + the racers they follow: for every member, racer or not. */
export async function loadFan(id: string): Promise<NonNullable<ProfileView["fan"]>> {
  const [fp, following] = await Promise.all([
    supabase.from("fan_profiles").select("favorite_classes").eq("id", id).maybeSingle(),
    supabase
      .from("follows")
      .select("following:profiles!follows_following_id_fkey(id, name, username, is_racer, creator_profiles(car_number))")
      .eq("follower_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  type F = { following: { id: string; name: string; username: string | null; is_racer: boolean; creator_profiles: { car_number: string | null } | null } | null };
  return {
    favoriteClasses: fp.data?.favorite_classes ?? [],
    followedRacers: ((following.data ?? []) as unknown as F[])
      .map((f) => f.following)
      .filter((x): x is NonNullable<F["following"]> => !!x && x.is_racer)
      .map((x) => ({ id: x.id, name: x.name, username: x.username, carNumber: x.creator_profiles?.car_number ?? null })),
  };
}

export async function loadTrack(p: { id: string; name: string; location: string | null }, today: string): Promise<NonNullable<ProfileView["track"]>> {
  const { data: track } = await supabase.from("tracks").select("id, name, location, capacity").eq("claimed_by", p.id).maybeSingle();
  if (!track) return { id: "", name: p.name, location: p.location, capacity: null, events: [] };
  const { data: events } = await supabase
    .from("track_events")
    .select("id, event_title, event_date")
    .eq("track_id", track.id)
    .eq("is_published", true)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(5);
  return {
    id: track.id,
    name: track.name,
    location: track.location,
    capacity: track.capacity,
    events: (events ?? []).map((e) => ({ id: e.id, title: e.event_title, date: e.event_date })),
  };
}

/** "34%" from the database to 34; anything unreadable is the centre. */
const parsePct = (v?: string | null) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
};

/** Sponsorship spots (racers and tracks). */
export async function loadDecals(userId: string): Promise<ProfileView["decals"]> {
  const base = "id, spot_name, description, min_bid_cents, is_available, position_top, position_left";
  const full = await supabase.from("sponsorship_spots").select(`${base}, price_per_race_cents, price_per_season_cents, season_races`).eq("creator_id", userId).order("created_at");
  // the pricing columns arrive with the deals migration; until it is applied, still show the spots
  const spots: SpotRow[] | null = full.error ? ((await supabase.from("sponsorship_spots").select(base).eq("creator_id", userId).order("created_at")).data as SpotRow[] | null) : (full.data as SpotRow[] | null);
  if (!spots || spots.length === 0) return [];
  const { data: stats } = await supabase
    .from("sponsorship_spot_stats")
    .select("spot_id, open_bids, top_bid_cents")
    .in("spot_id", spots.map((s) => s.id));
  const byId = new Map((stats ?? []).map((s) => [s.spot_id as string, s]));
  return spots.map((s) => ({
    id: s.id,
    placement: s.spot_name,
    xPct: parsePct(s.position_left),
    yPct: parsePct(s.position_top),
    description: s.description,
    minBidCents: s.min_bid_cents ?? 0,
    available: s.is_available,
    openBids: Number(byId.get(s.id)?.open_bids ?? 0),
    topBidCents: (byId.get(s.id)?.top_bid_cents as number | null | undefined) ?? null,
    pricePerRaceCents: s.price_per_race_cents ?? null,
    pricePerSeasonCents: s.price_per_season_cents ?? null,
    seasonRaces: s.season_races ?? null,
  }));
}

/** Current season partners: whoever won a spot. */
export async function loadPartners(userId: string): Promise<string[]> {
  const { data } = await supabase.from("sponsorship_spots").select("sponsor:profiles!sponsorship_spots_sponsor_id_fkey(name)").eq("creator_id", userId).not("sponsor_id", "is", null);
  return [...new Set(((data ?? []) as unknown as { sponsor: { name: string } | null }[]).map((r) => r.sponsor?.name).filter((n): n is string => !!n))];
}

export async function loadWallet(userId: string): Promise<NonNullable<ProfileView["wallet"]>> {
  const [wallet, summary] = await Promise.all([supabase.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle(), supabase.rpc("my_wallet_summary")]);
  const s = Array.isArray(summary.data) ? summary.data[0] : summary.data;
  return { balanceCents: Number(wallet.data?.balance_cents ?? 0), earnedThisMonthCents: Number(s?.earned_this_month_cents ?? 0) };
}

/**
 * The fast part of a profile: identity, counters and follow state. This is all the screen needs to
 * paint; racer details, sponsorship spots, wallet, following list and live status are separate
 * queries (see ProfileScreen) that fill in after.
 */
export async function fetchProfileCore(lookup: Lookup, viewerId: string): Promise<ProfileView | null> {
  const base = supabase.from("profiles").select("*");
  const { data: row, error } = await ("id" in lookup ? base.eq("id", lookup.id) : base.eq("username", lookup.username.toLowerCase())).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const p = row as Profile;
  const isMe = p.id === viewerId;
  const [stats, follow] = await Promise.all([
    loadPostStats(p.id),
    isMe ? Promise.resolve({ data: null }) : supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", p.id).maybeSingle(),
  ]);
  return {
    id: p.id,
    userType: p.user_type,
    isRacer: p.is_racer && p.user_type !== "track",
    name: p.name,
    username: p.username,
    bio: p.bio,
    avatarUrl: p.avatar_url,
    bannerUrl: p.banner_url,
    location: p.location,
    isVerified: p.is_verified,
    followers: p.followers_count,
    following: p.following_count,
    postsCount: stats.posts,
    likesCount: stats.likes,
    isMe,
    isFollowing: !!follow.data,
    liveStreamId: null,
    decals: [],
  };
}

/**
 * Everything the profile screen needs, for any account type. `wallet` is only filled for the owner.
 * Two round trips in total: the profile row, then every other piece in parallel (it used to be ~8 in a row).
 * Posts, saved, liked and results are not here: those tabs load their own pages on demand.
 */
export async function fetchProfileView(lookup: Lookup, viewerId: string): Promise<ProfileView | null> {
  const base = supabase.from("profiles").select("*");
  const { data: row, error } = await ("id" in lookup ? base.eq("id", lookup.id) : base.eq("username", lookup.username.toLowerCase())).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const p = row as Profile;
  const isMe = p.id === viewerId;
  const isTrack = p.user_type === "track";
  const isRacer = p.is_racer && !isTrack;
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const [stats, follow, liveStreamId, racer, fan, track, decals, partners, wallet] = await Promise.all([
    loadPostStats(p.id),
    isMe ? Promise.resolve({ data: null }) : supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", p.id).maybeSingle(),
    isMe ? Promise.resolve(null) : fetchLiveStreamOf(p.id),
    isRacer ? loadRacer(p.id, year) : Promise.resolve(undefined),
    !isTrack ? loadFan(p.id) : Promise.resolve(undefined),
    isTrack ? loadTrack(p, today) : Promise.resolve(undefined),
    loadDecals(p.id),
    isRacer ? loadPartners(p.id) : Promise.resolve([] as string[]),
    isMe ? loadWallet(p.id) : Promise.resolve(undefined),
  ]);

  const view: ProfileView = {
    id: p.id,
    userType: p.user_type,
    isRacer,
    name: p.name,
    username: p.username,
    bio: p.bio,
    avatarUrl: p.avatar_url,
    bannerUrl: p.banner_url,
    location: p.location,
    isVerified: p.is_verified,
    followers: p.followers_count,
    following: p.following_count,
    postsCount: stats.posts,
    likesCount: stats.likes,
    isMe,
    isFollowing: !!follow.data,
    liveStreamId,
    decals,
  };
  if (racer) view.racer = { ...racer, partners };
  if (fan) view.fan = fan;
  if (track) view.track = track;
  if (wallet) view.wallet = wallet;
  return view;
}

/* ------------------------------------------------------------------ edit */

export type EditProfileInput = {
  name: string;
  username: string;
  bio: string;
  location?: string;
  /** "I race": shows racer details on the profile. Not for track accounts. */
  isRacer?: boolean;
  carNumber?: string;
  racingClass?: string;
  teamName?: string;
  favoriteClasses?: string[];
  // track
  capacity?: number | null;
};

const friendly = (e: { code?: string; message: string }, what: string) =>
  e.code === "23505" ? new Error(`That ${what} is already taken.`) : new Error(e.message);

export async function updateProfile(id: string, userType: UserType, input: EditProfileInput) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new Error("Username must be 3-24 characters: letters, numbers, dots or underscores.");
  if (!input.name.trim()) throw new Error("Name can't be empty.");
  const isTrack = userType === "track";
  const isRacer = !isTrack && !!input.isRacer;

  const { error } = await supabase
    .from("profiles")
    .update({
      name: input.name.trim(),
      username,
      bio: input.bio.trim() || null,
      location: input.location?.trim() || null,
      is_racer: isRacer,
      is_creator: isRacer,
      profile_complete: true,
    })
    .eq("id", id);
  if (error) throw friendly(error, "username");

  if (isTrack) {
    const { data: existing } = await supabase.from("tracks").select("id").eq("claimed_by", id).maybeSingle();
    const fields = { name: input.name.trim(), location: input.location?.trim() || null, capacity: input.capacity ?? null };
    const { error: e } = existing
      ? await supabase.from("tracks").update(fields).eq("id", existing.id)
      : await supabase.from("tracks").insert({ ...fields, claimed_by: id });
    if (e) throw friendly(e, "track name");
    return;
  }

  if (isRacer) {
    const { error: e } = await supabase.from("creator_profiles").upsert({
      id,
      car_number: input.carNumber?.trim() || null,
      racing_class: input.racingClass?.trim() || null,
      team_name: input.teamName?.trim() || null,
    });
    if (e) throw new Error(e.message);
  }
  const { error: e } = await supabase.from("fan_profiles").upsert({ id, favorite_classes: input.favoriteClasses ?? [] });
  if (e) throw new Error(e.message);
}

/** First-run setup after sign-up: username, name, and the two optional switches. */
export async function completeOnboarding(id: string, input: { name: string; username: string; isRacer: boolean; isTrack: boolean }) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new Error("Username must be 3-24 characters: letters, numbers, dots or underscores.");
  if (!input.name.trim()) throw new Error("Name can't be empty.");
  const isRacer = !input.isTrack && input.isRacer;

  const { error } = await supabase
    .from("profiles")
    .update({
      name: input.name.trim(),
      username,
      user_type: input.isTrack ? "track" : "fan",
      is_racer: isRacer,
      is_creator: isRacer,
      profile_complete: true,
    })
    .eq("id", id);
  if (error) throw friendly(error, "username");

  if (input.isTrack) {
    const { data: existing } = await supabase.from("tracks").select("id").eq("claimed_by", id).maybeSingle();
    if (!existing) {
      const { error: e } = await supabase.from("tracks").insert({ name: input.name.trim(), claimed_by: id });
      if (e) throw friendly(e, "track name");
    }
  } else {
    await supabase.from("fan_profiles").upsert({ id });
  }
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("username_available", { p_username: username });
  if (error) throw error;
  return !!data;
}

/** Uploads an avatar or banner to the public `avatars` bucket and saves the URL on the profile. */
export async function uploadProfileImage(userId: string, source: { uri: string; file?: Blob | null }, kind: "avatar" | "banner") {
  // Converted to a verified JPEG (avatars 448 px, banners 1440 px) before upload
  const image = await prepareImage(source, kind === "avatar" ? AVATAR_IMAGE_WIDTH : FULL_IMAGE_WIDTH, undefined, 0.85);
  const path = `${userId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, image.bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: updateError } = await supabase
    .from("profiles")
    .update(kind === "avatar" ? { avatar_url: data.publicUrl } : { banner_url: data.publicUrl })
    .eq("id", userId);
  if (updateError) throw updateError;
  return data.publicUrl;
}
