import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/** Shown in place of the camera picture when there is no permission (or no camera) yet. */
export function PermissionPanel({ icon = "videocam-outline", title, body, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Ionicons name={icon} size={44} color="#6b7385" />
      <Text className="mt-4 text-center text-[18px] text-paddock-text">{title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-5 text-paddock-muted">{body}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" className="mt-6 h-12 items-center justify-center bg-paddock-orange px-8 active:opacity-80">
          <Text className="text-[15px] font-semibold text-paddock-text">{actionLabel}</Text>
        </Pressable>
      )}
      {secondaryLabel && onSecondary && (
        <Pressable onPress={onSecondary} accessibilityRole="button" className="mt-4 active:opacity-70">
          <Text className="text-[14px] text-paddock-muted">{secondaryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
