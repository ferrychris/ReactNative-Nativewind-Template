import { supabase } from "@/lib/supabase";

/**
 * A realtime channel with a name nobody else is using.
 *
 * Supabase hands back the SAME channel object when you ask for a name that already exists, and you can't add
 * listeners to a channel that was already subscribed ("cannot add postgres_changes callbacks after subscribe()").
 * That happens when two screens ask for the same name, or when a screen leaves and comes back before the old
 * channel has finished closing (React's dev double-mount does this too). A random suffix makes every
 * subscription its own channel.
 */
export function newChannel(base: string) {
  return supabase.channel(`${base}:${Math.random().toString(36).slice(2, 8)}`);
}
