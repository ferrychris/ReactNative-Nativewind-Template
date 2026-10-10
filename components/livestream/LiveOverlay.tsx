import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { CHAT_LIMIT, type ChatMessage } from "@/lib/api/live";

/**
 * Shared pieces of the live screens (host room and viewer), so both look the same:
 * header with host + actions, LIVE row, place / title line, gift pill, chat lines, input bar.
 */

const ORANGE = "#ec6a3a";
const PEACH = "#f4a58a";

/** Host avatar, name and verified tick on the left; whatever actions you pass on the right. */
export function LiveHeader({
  name,
  avatarUrl,
  verified,
  onPressHost,
  follow,
  right,
}: {
  name: string;
  avatarUrl?: string | null;
  verified?: boolean;
  onPressHost?: () => void;
  /** Small "+ Follow" pill next to the name (viewers only). */
  follow?: { following: boolean; onPress: () => void } | null;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 pt-3">
      <View className="flex-1 flex-row items-center pr-3">
        <Pressable onPress={onPressHost} disabled={!onPressHost} className="flex-shrink flex-row items-center active:opacity-70">
          <View className="overflow-hidden rounded-[9px] border border-white/20">
            <UserAvatar name={name} url={avatarUrl} size={34} />
          </View>
          <Text numberOfLines={1} className="ml-2.5 flex-shrink text-[15px] font-bold text-paddock-text">
            {name}
          </Text>
          {verified && <Ionicons name="checkmark-circle" size={15} color="#5cc8ff" style={{ marginLeft: 4 }} />}
        </Pressable>
        {follow && (
          <Pressable
            onPress={follow.onPress}
            accessibilityRole="button"
            accessibilityLabel={follow.following ? "Following" : "Follow"}
            className={`ml-2.5 flex-row items-center rounded-full border px-2.5 py-1 active:opacity-70 ${follow.following ? "border-white/25 bg-white/10" : "border-paddock-orange bg-paddock-orange/20"}`}
          >
            {!follow.following && <Ionicons name="add" size={13} color={ORANGE} />}
            <Text className={`text-[11px] font-bold ${follow.following ? "text-paddock-text" : "text-paddock-orange"}`}>{follow.following ? "Following" : "Follow"}</Text>
          </Pressable>
        )}
      </View>
      <View className="flex-row items-center">{right}</View>
    </View>
  );
}

/** "LIVE" badge + viewer count, with an optional pill on the right (earnings for the host). */
export function LiveStatusRow({ connecting, viewers, right }: { connecting?: boolean; viewers: number; right?: React.ReactNode }) {
  return (
    <View className="mt-3 flex-row items-center justify-between px-4">
      <View className="flex-row items-center">
        <View className={`mr-1.5 h-2 w-2 rounded-full ${connecting ? "bg-paddock-muted" : "bg-[#ff3b30]"}`} />
        <Text className={`mr-3 text-[12px] font-extrabold uppercase tracking-[1.5px] ${connecting ? "text-paddock-muted" : "text-[#ff6b5e]"}`}>{connecting ? "Connecting" : "Live"}</Text>
        <Ionicons name="eye-outline" size={15} color={PEACH} />
        <Text accessibilityLabel={`${viewers} watching`} className="ml-1 text-[13px] font-semibold text-paddock-peach">
          {viewers.toLocaleString("en-US")}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** "PIT BAY 04 · MONZA // FP3 DEBRIEF" */
export function LiveMetaLine({ place, title }: { place?: string | null; title?: string | null }) {
  if (!place && !title) return null;
  return (
    <View className="mt-3 flex-row items-center px-4">
      {place ? <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-paddock-text/75">{place}</Text> : null}
      {place && title ? <Text className="mx-2 text-[11px] text-paddock-orange">•</Text> : null}
      {title ? (
        <Text numberOfLines={1} className="flex-1 text-[11px] font-bold uppercase tracking-[1.5px] text-paddock-text/75">
          {title}
        </Text>
      ) : null}
    </View>
  );
}

/** "Marcus_GT sent Aero Helmet 🪖 x3" */
export function LiveGiftPill({ name, avatarUrl, giftName, emoji, count = 1 }: { name: string; avatarUrl?: string | null; giftName: string; emoji: string; count?: number }) {
  return (
    <View className="mx-4 mb-2.5 flex-row items-center self-start rounded-lg border border-paddock-orange/30 bg-black/60 px-2.5 py-2">
      <UserAvatar name={name} url={avatarUrl} size={24} />
      <Text numberOfLines={1} className="ml-2 shrink text-[13px] font-bold text-paddock-text">
        {name}
      </Text>
      <Text className="ml-1.5 text-[13px] text-paddock-text/85">gave {giftName}</Text>
      <Text className="ml-1.5 text-[15px]">{emoji}</Text>
      {count > 1 && (
        <View className="ml-2 rounded bg-[#3a2217] px-1.5 py-0.5">
          <Text className="text-[11px] font-bold text-paddock-orange">x{count}</Text>
        </View>
      )}
    </View>
  );
}

/** The latest few chat lines; the oldest fades out when the list is full. Tap a line to reply to it. */
export function LiveChatLines({ messages, max, emptyText, onReply }: { messages: ChatMessage[]; max: number; emptyText?: string; onReply?: (m: ChatMessage) => void }) {
  const shown = messages.slice(-max);
  return (
    <View className="px-4">
      {shown.length === 0 && emptyText ? <Text className="pb-3 text-[13px] text-paddock-text/60">{emptyText}</Text> : null}
      {shown.map((m, i) => (
        <Pressable
          key={m.id}
          onPress={onReply ? () => onReply(m) : undefined}
          disabled={!onReply}
          accessibilityLabel={`Reply to ${m.name}`}
          className="mb-2.5 active:opacity-70"
          style={{ opacity: shown.length === max && i === 0 ? 0.5 : 1 }}
        >
          {m.replyTo && (
            <View className="mb-1 ml-8 flex-row items-center">
              <Ionicons name="return-down-forward" size={12} color="#9a928d" />
              <Text numberOfLines={1} className="ml-1 flex-1 text-[11px] text-paddock-text/60">
                <Text className="font-bold">{m.replyTo.name}</Text> {m.replyTo.body}
              </Text>
            </View>
          )}
          <View className="flex-row items-start">
            <UserAvatar name={m.name} url={m.avatarUrl} size={22} />
            <Text className="ml-2.5 flex-1 text-[14px] leading-[20px] text-paddock-text/85">
              <Text className="font-bold text-paddock-text">{m.name} </Text>
              {m.body}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export type BarAction = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean; off?: boolean };

/** Rounded chat input with a chat icon, send button and a few round action icons beside it. */
export function LiveInputBar({
  draft,
  setDraft,
  onSubmit,
  sending,
  disabled,
  placeholder,
  actions,
  replyingTo,
  onCancelReply,
}: {
  draft: string;
  setDraft: (t: string) => void;
  onSubmit: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder: string;
  actions?: BarAction[];
  replyingTo?: { name: string; body: string } | null;
  onCancelReply?: () => void;
}) {
  const canSend = !disabled && !!draft.trim() && !sending;
  return (
    <View>
    {replyingTo && (
      <View className="mx-3 mb-1.5 flex-row items-center rounded-lg border border-white/10 bg-black/60 px-3 py-2">
        <Ionicons name="return-down-forward" size={14} color={ORANGE} />
        <Text numberOfLines={1} className="ml-2 flex-1 text-[12px] text-paddock-text/80">
          Replying to <Text className="font-bold text-paddock-text">{replyingTo.name}</Text>: {replyingTo.body}
        </Text>
        <Pressable onPress={onCancelReply} hitSlop={10} accessibilityLabel="Cancel reply" className="ml-2 active:opacity-60">
          <Ionicons name="close" size={16} color="#f2f0ee" />
        </Pressable>
      </View>
    )}
    <View className="flex-row items-center px-3 pb-2 pt-1">
      <View className="mr-2 h-11 flex-1 flex-row items-center rounded-full border border-white/15 bg-black/50 pl-3.5 pr-1.5">
        <Ionicons name="chatbubble-outline" size={16} color="#9a928d" />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          maxLength={CHAT_LIMIT}
          placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : placeholder}
          placeholderTextColor="#8a8480"
          selectionColor={ORANGE}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={onSubmit}
          accessibilityLabel="Chat message"
          className="ml-2 flex-1 text-[14px] text-paddock-text"
        />
        {draft.trim().length > 0 && (
          <Pressable onPress={onSubmit} disabled={!canSend} accessibilityLabel="Send message" className="h-8 w-8 items-center justify-center rounded-full bg-paddock-orange active:opacity-80" style={{ opacity: canSend ? 1 : 0.5 }}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
          </Pressable>
        )}
      </View>
      {actions?.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          hitSlop={6}
          accessibilityLabel={a.label}
          className="ml-1.5 h-11 w-11 items-center justify-center rounded-full bg-black/50 active:opacity-70"
        >
          <Ionicons name={a.icon} size={20} color={a.off ? "#ff7a5c" : a.active ? ORANGE : "#f2f0ee"} />
        </Pressable>
      ))}
    </View>
    </View>
  );
}

/** Fills the video area while a camera is switched off. */
export function CameraOffCover({ name, avatarUrl, label }: { name: string; avatarUrl?: string | null; label: string }) {
  return (
    <View className="absolute inset-0 items-center justify-center bg-[#0b0b0d]">
      <UserAvatar name={name} url={avatarUrl} size={96} />
      <View className="mt-4 flex-row items-center rounded-full bg-white/10 px-3 py-1.5">
        <Ionicons name="videocam-off-outline" size={15} color="#f2f0ee" />
        <Text className="ml-2 text-[12px] font-bold uppercase tracking-[1.2px] text-paddock-text">{label}</Text>
      </View>
    </View>
  );
}
