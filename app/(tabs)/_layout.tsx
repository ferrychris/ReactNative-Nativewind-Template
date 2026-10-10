import React, { useState } from "react";
import { ColorValue, Modal, Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useInboxRealtime, useUnread } from "@/lib/hooks/useUnread";
import { useLiveStatusRealtime, usePresenceTracker } from "@/lib/presence";
import { usePush } from "@/lib/hooks/usePush";

const ORANGE = "#e8582f";
const TEXT = "#f2f0ee";
const MUTED = "#7d7772";

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (active: IconName, inactive: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={26} color={color} />;
  };

function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();

  const go = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    action();
  };

  const options: { label: string; hint: string; icon: IconName; onPress: () => void }[] = [
    { label: "Create post", hint: "Text, photo, video or gallery", icon: "create-outline", onPress: () => router.push("/post/create") },
    { label: "Go live", hint: "Stream from the paddock", icon: "radio-outline", onPress: () => router.push("/livestream/go-live") },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/70">
        <Pressable onPress={(e) => e.stopPropagation()} className="rounded-t-3xl bg-paddock-bg px-4 pb-10 pt-3">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <View className="gap-2">
            {options.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => go(o.onPress)}
                accessibilityRole="button"
                className="flex-row items-center bg-paddock-surface px-5 py-4 active:opacity-70"
              >
                <Ionicons name={o.icon} size={26} color={ORANGE} />
                <View className="ml-4 flex-1">
                  <Text className="text-[17px] text-paddock-text">{o.label}</Text>
                  <Text className="mt-0.5 text-[13px] text-paddock-muted">{o.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9a928d" />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TabsLayout() {
  const [sheetOpen, setSheetOpen] = useState(false);
  useInboxRealtime();
  usePresenceTracker(); // "online" for your friends
  useLiveStatusRealtime(); // live rings update the moment someone goes live
  const unread = useUnread();
  const inboxBadge = unread.messages + unread.requests + unread.notifications;
  usePush(inboxBadge); // phone notifications: register, open on tap, app-icon badge

  return (
    <>
      <Tabs
        screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: TEXT,
          tabBarInactiveTintColor: MUTED,
          tabBarStyle: { backgroundColor: "#0b0b0d", borderTopColor: "#17171a" },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        }}
      >
        <Tabs.Screen name="dashboard/index" options={{ title: "Home", tabBarIcon: icon("home", "home-outline") }} />
        <Tabs.Screen name="friends" options={{ title: "Friends", tabBarIcon: icon("people", "people-outline") }} />
        <Tabs.Screen
          name="create"
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarAccessibilityLabel: "Create post or go live",
            tabBarButton: () => (
              <View className="flex-1 items-center justify-center">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setSheetOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Create post or go live"
                  className="h-9 w-12 items-center justify-center rounded-lg bg-paddock-orange active:opacity-80"
                >
                  <Ionicons name="add" size={28} color="#0b0b0d" />
                </Pressable>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: "Inbox",
            tabBarIcon: icon("chatbubble-ellipses", "chatbubble-ellipses-outline"),
            tabBarBadge: inboxBadge > 0 ? (inboxBadge > 99 ? "99+" : inboxBadge) : undefined,
            tabBarBadgeStyle: { backgroundColor: "#e8582f", color: "#f2f0ee", fontSize: 10 },
          }}
        />
        <Tabs.Screen name="profile/index" options={{ title: "Profile", tabBarIcon: icon("person", "person-outline") }} />
      </Tabs>
      <CreateSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
