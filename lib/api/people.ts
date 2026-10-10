import { supabase } from "@/lib/supabase";
import type { UserType } from "@/lib/types";

export type PeopleScope = "friends" | "following" | "followers" | "suggested" | "everyone";

export type Person = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  userType: UserType;
  isRacer: boolean;
  isVerified: boolean;
  carNumber: string | null;
  racingClass: string | null;
  followers: number;
  iFollow: boolean;
  followsMe: boolean;
};

type Row = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  user_type: UserType;
  is_racer: boolean;
  is_verified: boolean;
  car_number: string | null;
  racing_class: string | null;
  followers_count: number;
  i_follow: boolean;
  follows_me: boolean;
};

/**
 * People you can follow or message.
 *  friends   = you follow each other
 *  suggested = popular people you don't follow yet
 * A non-empty `query` searches names, usernames and car numbers.
 */
export async function findPeople(input: { scope: PeopleScope; query?: string; limit?: number; offset?: number }): Promise<Person[]> {
  const { data, error } = await supabase.rpc("find_people", {
    p_scope: input.scope,
    p_query: input.query?.trim() || null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isRacer: r.is_racer,
    isVerified: r.is_verified,
    carNumber: r.car_number,
    racingClass: r.racing_class,
    followers: r.followers_count,
    iFollow: r.i_follow,
    followsMe: r.follows_me,
  }));
}
