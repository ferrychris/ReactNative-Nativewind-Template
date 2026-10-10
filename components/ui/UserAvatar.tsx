import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { initialsOf } from "@/lib/format";

/** Round avatar: the photo, or initials when there is none. */
export function UserAvatar({ name, url, size = 46 }: { name: string; url?: string | null; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center overflow-hidden border border-paddock-border bg-[#26262b]"
    >
      {url ? (
        <Image source={{ uri: url }} contentFit="cover" cachePolicy="memory-disk" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text className="text-paddock-text" style={{ fontSize: size * 0.32 }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
