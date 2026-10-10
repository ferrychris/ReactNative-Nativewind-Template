import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Path, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { cheapestOpenSpot, presetFor, raceRate, spotPosition } from "@/lib/carSpots";

export { presetFor, spotPosition, raceRate, cheapestOpenSpot };

const clamp = (n: number) => Math.min(94, Math.max(6, n));

function CarShape() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 200 125" preserveAspectRatio="xMidYMid meet">
      <Rect x={44} y={66} width={26} height={26} rx={13} fill="#2a2a2f" />
      <Rect x={134} y={66} width={26} height={26} rx={13} fill="#2a2a2f" />
      <Path d="M20 82 L22 66 C30 60 52 56 70 54 L86 36 C92 30 100 28 112 28 L134 28 C142 28 148 32 154 42 L162 54 C176 56 184 62 184 72 L184 82 Z" fill="#17171a" stroke="#34343a" strokeWidth={1.5} />
      <Path d="M92 52 L100 38 L130 38 L142 52 Z" fill="#0b0b0d" stroke="#2a2a2f" strokeWidth={1} />
    </Svg>
  );
}

/**
 * Placement picker: the racer's own car photo (or a plain car outline when there is none).
 * Tap anywhere to move the dot; it is saved as that spot's position on the car.
 */
export function CarMap({ photoUrl, pick, onPick }: { photoUrl?: string | null; pick: { x: number; y: number }; onPick: (x: number, y: number) => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} className="aspect-[16/10] w-full overflow-hidden border border-paddock-border bg-paddock-bg">
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} contentFit="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <View className="absolute inset-0">
          <CarShape />
        </View>
      )}
      <View pointerEvents="none" className="absolute inset-0 bg-black/20" />

      <Pressable
        onPress={(e) => {
          if (size.w === 0 || size.h === 0) return;
          onPick(clamp((e.nativeEvent.locationX / size.w) * 100), clamp((e.nativeEvent.locationY / size.h) * 100));
        }}
        accessibilityLabel="Tap the car to place this spot"
        className="absolute inset-0"
      />

      <View
        pointerEvents="none"
        style={{ position: "absolute", left: `${pick.x}%`, top: `${pick.y}%`, width: 26, height: 26, marginLeft: -13, marginTop: -13 }}
        className="items-center justify-center rounded-full border-2 border-white bg-paddock-orange"
      >
        <Ionicons name="pricetag" size={13} color="#fff" />
      </View>
    </View>
  );
}
