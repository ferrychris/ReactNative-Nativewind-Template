import React, { useEffect, useState } from "react";
import { Modal, Pressable, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostActions } from "@/lib/hooks/usePostActions";
import type { FeedPost, ReportReason } from "@/lib/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or dangerous acts" },
  { value: "scam", label: "Scam or fraud" },
  { value: "other", label: "Something else" },
];

type Props = {
  post: FeedPost;
  visible: boolean;
  onClose: () => void;
  /** Called after the post was deleted or its author was blocked, so the screen can leave. */
  onRemoved?: () => void;
};

type Item = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function Row({ item }: { item: Item }) {
  const color = item.destructive ? "#ff6b57" : "#f2f0ee";
  return (
    <Pressable onPress={item.onPress} accessibilityRole="button" className="flex-row items-center bg-paddock-surface px-5 py-4 active:opacity-70">
      <Ionicons name={item.icon} size={22} color={color} />
      <Text className="ml-4 flex-1 text-[16px]" style={{ color }}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/** The "..." sheet on a post: save, share, change audience, delete (yours) or report / block (others). */
export function PostMenu({ post, visible, onClose, onRemoved }: Props) {
  const { toggleSave, changeAudience, confirmDelete, report, block } = usePostActions();
  const [step, setStep] = useState<"menu" | "report">("menu");

  useEffect(() => {
    if (visible) setStep("menu");
  }, [visible]);

  const run = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    fn();
  };

  const share = async () => {
    try {
      await Share.share({ message: `${post.author.name} on Heatlap${post.content ? `: “${post.content.slice(0, 140)}”` : ""}` });
    } catch {
      // cancelled
    }
  };

  const items: Item[] = [
    { key: "save", label: post.saved ? "Remove from saved" : "Save post", icon: post.saved ? "bookmark" : "bookmark-outline", onPress: run(() => toggleSave(post)) },
    { key: "share", label: "Share", icon: "arrow-redo-outline", onPress: run(share) },
  ];

  if (post.isMine) {
    const toFollowersOnly = post.visibility === "public";
    items.push(
      {
        key: "audience",
        label: toFollowersOnly ? "Make followers only" : "Make public",
        icon: toFollowersOnly ? "lock-closed-outline" : "globe-outline",
        onPress: run(() => changeAudience(post, toFollowersOnly ? "followers_only" : "public")),
      },
      { key: "delete", label: "Delete post", icon: "trash-outline", destructive: true, onPress: run(() => confirmDelete(post, onRemoved)) },
    );
  } else {
    items.push(
      { key: "report", label: "Report post", icon: "flag-outline", destructive: true, onPress: () => setStep("report") },
      { key: "block", label: `Block ${post.author.name}`, icon: "ban-outline", destructive: true, onPress: run(() => block(post, onRemoved)) },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/70">
        <Pressable onPress={(e) => e.stopPropagation()} className="rounded-t-3xl bg-paddock-bg px-4 pb-10 pt-3">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>

          {step === "menu" ? (
            <View className="gap-2">
              {items.map((item) => (
                <Row key={item.key} item={item} />
              ))}
            </View>
          ) : (
            <View>
              <Pressable onPress={() => setStep("menu")} hitSlop={8} className="mb-3 flex-row items-center active:opacity-60">
                <Ionicons name="chevron-back" size={20} color="#9a928d" />
                <Text className="ml-1 text-[14px] text-paddock-muted">Why are you reporting this?</Text>
              </Pressable>
              <View className="gap-2">
                {REASONS.map((r) => (
                  <Row
                    key={r.value}
                    item={{ key: r.value, label: r.label, icon: "chevron-forward", onPress: run(() => report(post, r.value)) }}
                  />
                ))}
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
