import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feed } from "@/components/post/Feed";
import { RaceLogo } from "@/components/RaceLogo";
import { useSwipe } from "@/lib/hooks/useSwipe";

type Scope = "following" | "forYou";

/** Home: swipe through posts. "Following" shows people you follow; "For you" shows everyone. */
export default function DashboardScreen() {
  const [scope, setScope] = useState<Scope>("forYou");
  // swipe left for "For you", right for "Following"
  const swipe = useSwipe((dir) => {
    const next: Scope = dir === "left" ? "forYou" : "following";
    if (next === scope) return;
    Haptics.selectionAsync();
    setScope(next);
  });

  return (
    <View className="flex-1 bg-[#090a0d]" {...swipe}>
      <Feed key={scope} scope={scope} />

      <SafeAreaView edges={["top"]} pointerEvents="box-none" className="absolute inset-x-0 top-0 z-30">
        <View pointerEvents="box-none" className="flex-row justify-center gap-8 pt-2">
          {/* inside the row (not the safe-area wrapper) so it sits below the status bar / notch */}
          <View pointerEvents="none" className="absolute left-5 top-[8px]">
            <RaceLogo size={28} framed={false} />
          </View>
          {(["following", "forYou"] as const).map((s) => (
            <Pressable
              key={s}
              hitSlop={10}
              onPress={() => {
                if (s !== scope) Haptics.selectionAsync();
                setScope(s);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === s }}
              className="items-center active:opacity-70"
            >
              <Text className={`text-[16px] font-semibold ${scope === s ? "text-paddock-text" : "text-paddock-muted"}`}>{s === "following" ? "Following" : "For you"}</Text>
              <View className={`mt-1 h-[2px] w-6 ${scope === s ? "bg-paddock-orange" : "bg-transparent"}`} />
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}
