import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RaceLogo } from "@/components/RaceLogo";

/** Shared building blocks of the auth screens (login, register, onboarding). */

export function AuthTopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View className="h-14 flex-row items-center justify-between px-5">
      <View className="flex-row items-center">
        {onBack ? (
          <Pressable hitSlop={12} onPress={onBack} accessibilityLabel="Back" className="mr-5 active:opacity-60">
            <Ionicons name="chevron-back" size={26} color="#f2f0ee" />
          </Pressable>
        ) : null}
        <Text className="text-[19px] font-semibold text-paddock-text">{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Centered logo, small orange eyebrow, big title and a short line under it. */
export function AuthHero({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View className="items-center px-2 pt-2">
      <RaceLogo size={40} framed={false} />
      <View className="mt-3 flex-row items-center">
        <View className="mr-2 h-[7px] w-[7px] rounded-full bg-paddock-orange" />
        <Text className="text-[12px] font-bold uppercase tracking-[1.4px] text-paddock-peach">{eyebrow}</Text>
      </View>
      <Text className="mt-1.5 text-center text-[24px] font-bold leading-[30px] text-paddock-text">{title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-[20px] text-paddock-muted">{subtitle}</Text>
    </View>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"] };

export function AuthSegments<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-md bg-[#141416] p-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className={`h-[46px] flex-1 flex-row items-center justify-center rounded-sm active:opacity-80 ${on ? "bg-[#2a2a2d]" : ""}`}
          >
            <MaterialCommunityIcons name={o.icon} size={18} color={on ? "#f2f0ee" : "#9a928d"} />
            <Text className={`ml-2 text-[16px] font-medium ${on ? "text-paddock-text" : "text-paddock-muted"}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AuthCheckbox({ checked, onChange, label, right }: { checked: boolean; onChange: (v: boolean) => void; label: string; right?: React.ReactNode }) {
  return (
    <View className="mt-5 flex-row items-center justify-between">
      <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} hitSlop={8} className="flex-1 flex-row items-center active:opacity-70">
        <View className={`h-[22px] w-[22px] items-center justify-center rounded-[4px] ${checked ? "bg-paddock-orange" : "border border-paddock-border"}`}>
          {checked ? <Ionicons name="checkmark" size={16} color="#0b0b0d" /> : null}
        </View>
        <Text className="ml-2.5 flex-shrink text-[15px] text-paddock-peach">{label}</Text>
      </Pressable>
      {right}
    </View>
  );
}

export function AuthPrimaryButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" className={`mt-6 h-[58px] flex-row items-center justify-center rounded-sm active:opacity-80 ${disabled ? "bg-[#2a2523]" : "bg-paddock-orange"}`}>
      {busy ? (
        <ActivityIndicator color="#0b0b0d" />
      ) : (
        <>
          <Text className={`text-[18px] font-semibold ${disabled ? "text-[#8b8580]" : "text-[#2a1208]"}`}>{label}</Text>
          <Ionicons name="arrow-forward" size={19} color={disabled ? "#8b8580" : "#2a1208"} style={{ marginLeft: 8 }} />
        </>
      )}
    </Pressable>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <View className="my-7 flex-row items-center">
      <View className="h-[1px] flex-1 bg-[#2a2a2d]" />
      <Text className="mx-4 text-[12px] font-bold uppercase tracking-[1.6px] text-paddock-muted">{label}</Text>
      <View className="h-[1px] flex-1 bg-[#2a2a2d]" />
    </View>
  );
}

/** A full-width option row: icon, label, then a tag or chevron. */
export function AuthProviderRow({ icon, label, tag, onPress }: { icon: React.ReactNode; label: string; tag?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-3 h-[58px] flex-row items-center rounded-sm bg-paddock-surface px-4 active:opacity-75">
      <View className="w-7 items-center">{icon}</View>
      <Text className="ml-3 flex-1 text-[16px] text-paddock-text">{label}</Text>
      {tag ? (
        <View className="rounded-[3px] bg-[#2a2a2d] px-2.5 py-1">
          <Text className="text-[12px] font-bold tracking-[1px] text-paddock-muted">{tag}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#9a928d" />
      )}
    </Pressable>
  );
}

export function AuthNotice({ icon, title, body }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; title: string; body: string }) {
  return (
    <View className="mt-4 flex-row items-center rounded-sm bg-paddock-surface px-3.5 py-3.5">
      <View className="h-11 w-11 items-center justify-center rounded-sm bg-[#141416]">
        <MaterialCommunityIcons name={icon} size={24} color="#5cc8ff" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[13px] font-semibold uppercase tracking-[0.8px] text-paddock-text">{title}</Text>
        <Text className="mt-0.5 text-[14px] leading-[19px] text-paddock-muted">{body}</Text>
      </View>
    </View>
  );
}

export function AuthFooter({ prompt, action, onPress, legal }: { prompt: string; action: string; onPress: () => void; legal?: string }) {
  return (
    <View className="mt-9 items-center">
      <Pressable onPress={onPress} hitSlop={8} className="flex-row items-center active:opacity-70">
        <Text className="text-[16px] text-paddock-peach">{prompt} </Text>
        <Text className="text-[18px] font-bold text-paddock-peach">{action}</Text>
        <Ionicons name="arrow-up" size={15} color="#f4a58a" style={{ marginLeft: 3, transform: [{ rotate: "45deg" }] }} />
      </Pressable>
      {legal ? <Text className="mt-4 px-4 text-center text-[13px] leading-[19px] text-paddock-muted">{legal}</Text> : null}
    </View>
  );
}

export function AuthError({ message }: { message: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" className="mt-4 text-[14px] text-[#ff7a5c]">
      {message}
    </Text>
  ) : null;
}
