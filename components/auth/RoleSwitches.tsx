import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const ORANGE = "#e8582f";

function Row({ title, hint, value, onChange, icon }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      className={`mt-3 flex-row items-center border px-4 py-3.5 active:opacity-80 ${value ? "border-paddock-orange bg-[#24140f]" : "border-paddock-border bg-paddock-surface"}`}
    >
      <View className={`mr-3 h-9 w-9 items-center justify-center ${value ? "bg-paddock-orange" : "bg-[#222124]"}`}>
        <Ionicons name={icon} size={19} color={value ? "#0b0b0d" : "#9a928d"} />
      </View>
      <View className="flex-1 pr-4">
        <Text className="text-[14px] font-extrabold uppercase tracking-[0.8px] text-paddock-text">{title}</Text>
        <Text className="mt-0.5 text-[11px] leading-[16px] text-paddock-muted">{hint}</Text>
      </View>
      <View
        style={{ width: 42, height: 24, borderColor: value ? ORANGE : "#55555a", backgroundColor: value ? ORANGE : "transparent" }}
        className="justify-center border"
      >
        <View style={{ width: 16, height: 16, marginLeft: value ? 22 : 3, backgroundColor: value ? "#0b0b0e" : "#f2f0ee" }} />
      </View>
    </Pressable>
  );
}

type Props = {
  isRacer: boolean;
  isTrack: boolean;
  onRacerChange: (v: boolean) => void;
  onTrackChange: (v: boolean) => void;
};

/**
 * Everyone joins as a member. These two optional switches add racer details, or make the
 * account a track / organisation. Racer can be changed later in Edit profile.
 */
export function RoleSwitches({ isRacer, isTrack, onRacerChange, onTrackChange }: Props) {
  return (
    <View className="mt-5">
      <Text className="text-[15px] font-medium text-paddock-peach">Account class</Text>
      {!isTrack && <Row icon="speedometer-outline" title="I race" hint="Show a car number, class, team and season stats on your profile." value={isRacer} onChange={onRacerChange} />}
      <Row
        icon="business-outline"
        title="Track or organisation account"
        hint="For a circuit, series or club. Adds your venue page and events."
        value={isTrack}
        onChange={(v) => {
          onTrackChange(v);
          if (v) onRacerChange(false);
        }}
      />
    </View>
  );
}
