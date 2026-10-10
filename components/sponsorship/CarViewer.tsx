import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { usd } from "@/lib/format";
import type { ProfileView } from "@/lib/types";
import { cheapestOpenSpot, raceRate, spotPosition } from "./CarMap";

type Decal = ProfileView["decals"][number];

const TAG_W = 96;

function SpotTag({ decal, x, y, cheapest, onPress }: { decal: Decal; x: number; y: number; cheapest: boolean; onPress: () => void }) {
  const rate = raceRate(decal);
  const value = !decal.available ? "Sponsored" : rate !== null ? `${usd(rate).replace(/\.00$/, "")} / race` : "Make offer";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${decal.placement}, ${value}`}
      style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: TAG_W, marginLeft: -TAG_W / 2, marginTop: -16 }}
      className="items-center active:opacity-80"
    >
      <Text numberOfLines={1} className={`px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.7px] ${cheapest ? "bg-paddock-orange text-[#0b0b0d]" : "bg-[#23140f]/90 text-paddock-orange"}`}>
        {decal.placement}
      </Text>
      <Text numberOfLines={1} className={`mt-1 text-[10px] font-extrabold uppercase tracking-[0.8px] ${decal.available ? "text-paddock-text" : "text-paddock-muted"}`} style={{ textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 4 }}>
        {value}
      </Text>
    </Pressable>
  );
}

/** The racer's car photo with a price tag on every sponsorship spot, where the racer placed it. */
export function CarViewer({ view, onPressSpot, onChangePhoto, photoBusy }: { view: ProfileView; onPressSpot: (d: Decal) => void; onChangePhoto?: () => void; photoBusy?: boolean }) {
  const r = view.racer;
  const photo = r?.carPhotoUrl ?? null;
  const cheapest = cheapestOpenSpot(view.decals);
  const carLine = [r?.carNumber ? `#${r.carNumber}` : null, r?.racingClass].filter(Boolean).join(" · ");

  return (
    <View className="aspect-[16/10] w-full items-center justify-center overflow-hidden border-y border-paddock-border bg-paddock-surface">
      {photo ? (
        <Image source={{ uri: photo }} contentFit="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <Pressable onPress={onChangePhoto} disabled={!onChangePhoto} accessibilityLabel="Add car photo" className="absolute inset-0 items-center justify-center">
          <Ionicons name="car-sport-outline" size={44} color="#4a4a52" />
          <Text className="mt-2 text-[13px] text-paddock-muted">{onChangePhoto ? "Tap to add a car photo" : "No car photo yet"}</Text>
        </Pressable>
      )}
      <View pointerEvents="none" className="absolute inset-0 bg-black/20" />

      {carLine ? (
        <View pointerEvents="none" className="absolute left-3 top-3 bg-[#191919]/85 px-2 py-1">
          <Text className="text-[8px] font-extrabold uppercase tracking-[0.8px] text-paddock-text">{carLine}</Text>
        </View>
      ) : null}
      {r?.teamName ? (
        <View pointerEvents="none" className="absolute left-[38%] top-3 bg-paddock-orange px-2 py-1">
          <Text numberOfLines={1} className="text-[8px] font-extrabold uppercase tracking-[0.8px] text-[#0b0b0d]">
            {r.teamName}
          </Text>
        </View>
      ) : null}

      {view.decals.map((d, i) => {
        const [x, y] = spotPosition(d, i);
        return <SpotTag key={d.id} decal={d} x={x} y={y} cheapest={cheapest?.id === d.id} onPress={() => onPressSpot(d)} />;
      })}

      {view.decals.length > 0 && (
        <View pointerEvents="none" className="absolute bottom-4 right-4 flex-row items-center">
          <Ionicons name="finger-print-outline" size={13} color="#f2f0ee" />
          <Text className="ml-1 text-[9px] font-extrabold uppercase tracking-[1px] text-paddock-text">Tap spot to inspect</Text>
        </View>
      )}
      {cheapest && (
        <View pointerEvents="none" className="absolute bottom-3 left-3 flex-row items-center bg-black/70 px-3 py-2">
          <Ionicons name="pricetag" size={14} color="#e8582f" />
          <Text className="ml-2 text-[13px] font-bold text-paddock-text">From {usd(cheapest.cents).replace(/\.00$/, "")} / race</Text>
        </View>
      )}

      {onChangePhoto && photo && (
        <Pressable onPress={onChangePhoto} accessibilityLabel="Change car photo" className="absolute right-3 top-3 bg-black/55 p-2 active:opacity-70">
          {photoBusy ? <ActivityIndicator color="#f2f0ee" /> : <Ionicons name="camera-outline" size={18} color="#f2f0ee" />}
        </Pressable>
      )}
    </View>
  );
}
