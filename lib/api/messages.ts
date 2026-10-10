import { supabase } from "@/lib/supabase";

export type Conversation = {
  id: string;
  otherId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  isRacer: boolean;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  /** Someone who doesn't have your follow wants to message you. */
  isRequest: boolean;
  muted: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  createdAt: string;
};

export type ChatInfo = {
  id: string;
  other: { id: string; name: string; username: string | null; avatarUrl: string | null; isRacer: boolean };
  /** True while this chat is still a request you haven't accepted. */
  pendingForMe: boolean;
};

export const MESSAGE_PAGE = 30;
export const MAX_MESSAGE_LENGTH = 2000;

/** Plain-language errors for the database rules. */
export function messageError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (m.includes("message_request_limit")) return "They haven't accepted your message yet. You can send more once they reply.";
  if (m.includes("blocked")) return "You can't message this person.";
  if (m.includes("user_not_found")) return "This account doesn't exist anymore.";
  if (m.includes("cannot_message_yourself")) return "You can't message yourself.";
  return m || "Something went wrong. Try again.";
}

type InboxRow = {
  conversation_id: string;
  other_user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_racer: boolean;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_request: boolean;
  muted: boolean;
};

export async function fetchInbox(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("inbox_conversations")
    .select("conversation_id, other_user_id, name, username, avatar_url, is_racer, last_message_preview, last_message_at, unread_count, is_request, muted")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as InboxRow[]).map((r) => ({
    id: r.conversation_id,
    otherId: r.other_user_id,
    name: r.name,
    username: r.username,
    avatarUrl: r.avatar_url,
    isRacer: r.is_racer,
    lastMessage: r.last_message_preview,
    lastAt: r.last_message_at,
    unread: Number(r.unread_count),
    isRequest: r.is_request,
    muted: r.muted,
  }));
}

/** Finds or creates the 1:1 chat with someone and returns its id. */
export async function startChat(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_other: otherUserId });
  if (error) throw new Error(messageError(error));
  return data as string;
}

export async function fetchChatInfo(conversationId: string, myId: string): Promise<ChatInfo | null> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id, accepted, profile:profiles!conversation_members_user_id_fkey(id, name, username, avatar_url, is_racer)")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  type M = { user_id: string; accepted: boolean; profile: { id: string; name: string; username: string | null; avatar_url: string | null; is_racer: boolean } | null };
  const members = (data ?? []) as unknown as M[];
  const me = members.find((m) => m.user_id === myId);
  const other = members.find((m) => m.user_id !== myId);
  if (!me || !other?.profile) return null;
  return {
    id: conversationId,
    other: { id: other.profile.id, name: other.profile.name, username: other.profile.username, avatarUrl: other.profile.avatar_url, isRacer: other.profile.is_racer },
    pendingForMe: !me.accepted,
  };
}

/** Newest first. Pass the oldest loaded message time as `before` to load older ones. */
export async function fetchMessages(conversationId: string, before?: string | null): Promise<Message[]> {
  let q = supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, conversationId: m.conversation_id, senderId: m.sender_id, body: m.body, createdAt: m.created_at }));
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const text = body.trim();
  if (!text) throw new Error("Write a message first.");
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: text.slice(0, MAX_MESSAGE_LENGTH) })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error) throw new Error(messageError(error));
  return { id: data.id, conversationId: data.conversation_id, senderId: data.sender_id, body: data.body, createdAt: data.created_at };
}

export async function markRead(conversationId: string, userId: string) {
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function acceptRequest(conversationId: string) {
  const { error } = await supabase.rpc("accept_message_request", { p_conversation: conversationId });
  if (error) throw error;
}

/** Removes the chat from your inbox (the other person keeps theirs). */
export async function leaveChat(conversationId: string, userId: string) {
  const { error } = await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw error;
}

export type UnreadCounts = { messages: number; requests: number; notifications: number };

export async function fetchUnreadCounts(): Promise<UnreadCounts> {
  const { data, error } = await supabase.rpc("inbox_unread_counts");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return { messages: Number(row.messages ?? 0), requests: Number(row.requests ?? 0), notifications: Number(row.notifications ?? 0) };
}

/* ------------------------------------------------------------ activity (notifications) */

export type Activity = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string; username: string | null; avatarUrl: string | null } | null;
};

export async function fetchActivity(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, read, created_at, entity_type, entity_id, actor:profiles!notifications_actor_id_fkey(id, name, username, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  type R = {
    id: string; type: string; title: string; message: string; read: boolean; created_at: string; entity_type: string | null; entity_id: string | null;
    actor: { id: string; name: string; username: string | null; avatar_url: string | null } | null;
  };
  return ((data ?? []) as unknown as R[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAt: n.created_at,
    entityType: n.entity_type,
    entityId: n.entity_id,
    actor: n.actor ? { id: n.actor.id, name: n.actor.name, username: n.actor.username, avatarUrl: n.actor.avatar_url } : null,
  }));
}

export async function markActivityRead(userId: string) {
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}
