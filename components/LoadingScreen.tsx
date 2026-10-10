import React, { useEffect, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { RaceLogo } from "@/components/RaceLogo";

/** In-app loading state (shown while the app works out who is signed in). Not the launch splash screen. */
export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View className="flex-1 items-center justify-center bg-paddock-bg" accessibilityRole="progressbar" accessibilityLabel={label}>
      <Animated.View style={{ opacity: pulse }}>
        <RaceLogo size={64} framed={false} />
      </Animated.View>
      <Text className="mt-5 text-[11px] font-semibold uppercase tracking-[3px] text-paddock-muted">{label}</Text>
    </View>
  );
}
