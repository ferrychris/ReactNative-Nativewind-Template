import React from "react";
import { Modal, Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type ManageItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  /** Present = a switch (on/off); absent = a plain action row. */
  value?: boolean;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type ManageSection = { title: string; items: ManageItem[] };

/** Host-only "Manage live" sheet: camera, sound, what you see on your own screen, sharing, ending. */
export function LiveManageSheet({ visible, onClose, sections }: { visible: boolean; onClose: () => void; sections: ManageSection[] }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
        <View className="rounded-t-3xl bg-paddock-bg px-5 pb-8 pt-4">
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <Text className="mb-1 text-[18px] font-semibold text-paddock-text">Manage live</Text>

          {sections.map((sec) => (
            <View key={sec.title} className="mt-3">
              <Text className="mb-1 text-[11px] font-extrabold uppercase tracking-[1.2px] text-paddock-muted">{sec.title}</Text>
              {sec.items.map((it) => (
                <Pressable
                  key={it.key}
                  onPress={it.onPress}
                  disabled={it.disabled}
                  accessibilityRole={it.value === undefined ? "button" : "switch"}
                  accessibilityState={it.value === undefined ? undefined : { checked: it.value }}
                  className="flex-row items-center border-b border-paddock-surface py-3 active:opacity-70"
                  style={{ opacity: it.disabled ? 0.4 : 1 }}
                >
                  <Ionicons name={it.icon} size={20} color={it.destructive ? "#ff7a5c" : "#f2f0ee"} />
                  <View className="ml-3 flex-1">
                    <Text className={`text-[15px] ${it.destructive ? "font-semibold text-[#ff7a5c]" : "text-paddock-text"}`}>{it.label}</Text>
                    {it.hint ? <Text className="mt-0.5 text-[12px] text-paddock-muted">{it.hint}</Text> : null}
                  </View>
                  {it.value !== undefined && <Switch value={it.value} onValueChange={it.onPress} disabled={it.disabled} trackColor={{ true: "#e8582f", false: "#3a3a40" }} />}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}
