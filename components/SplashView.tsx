import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { RaceLogo } from "@/components/RaceLogo";

// Native splash: imageWidth 240, mark drawn at 0.8x on the canvas, so the mark is 192 here.
const SIZE = 192;
const u = SIZE / 512;

/**
 * In-app twin of the native splash (same colour, mark and size) so the hand-off has no flash.
 * It starts on the exact static frame, then the track breathes and the start/finish tick pulses
 * like a timing light.
 */
export function SplashView() {
  const breathe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
    const a = loop(breathe, 900);
    const b = loop(pulse, 520);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [breathe, pulse]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const tickOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });

  return (
    <View className="flex-1 items-center justify-center bg-[#0b0b0d]">
      <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ scale }] }}>
        <RaceLogo size={SIZE} framed={false} tick={false} />
        <Animated.View
          style={{
            position: "absolute",
            left: 241 * u,
            top: 111 * u,
            width: 30 * u,
            height: 94 * u,
            borderRadius: 15 * u,
            backgroundColor: "#e8582f",
            opacity: tickOpacity,
          }}
        />
      </Animated.View>
    </View>
  );
}
