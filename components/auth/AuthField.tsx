import React from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = TextInputProps & {
  label: string;
  hint?: string;
  /** Small text on the right of the label row (e.g. "Forgot password?" as a node). */
  labelRight?: React.ReactNode;
  /** Icon at the start of the field. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Element at the end of the field (e.g. the show / hide eye). */
  right?: React.ReactNode;
};

/** Labelled dark input used by the login, register and onboarding screens. */
export function AuthField({ label, hint, labelRight, icon, right, ...input }: Props) {
  return (
    <View className="mt-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-medium text-paddock-peach">{label}</Text>
        {labelRight}
      </View>
      <View className="mt-2 h-[58px] flex-row items-center rounded-sm bg-paddock-surface px-4">
        {icon ? <Ionicons name={icon} size={20} color="#9a928d" style={{ marginRight: 12 }} /> : null}
        <TextInput
          placeholderTextColor="#6b6561"
          autoCorrect={false}
          selectionColor="#e8582f"
          className="flex-1 text-[16px] text-paddock-text"
          {...input}
        />
        {right}
      </View>
      {hint ? <Text className="mt-2 text-[12px] leading-[16px] text-paddock-muted">{hint}</Text> : null}
    </View>
  );
}
