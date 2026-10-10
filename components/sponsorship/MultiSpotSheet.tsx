import React, { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { createSponsorshipSpots } from "@/lib/api/sponsorship";
import { fetchTypeZones, fetchVehicleTypes, type TypeZone } from "@/lib/api/vehicles";
import { SearchSelect } from "./SearchSelect";

const ORANGE = "#e8582f";
const MUTED = "#9a928d";

/**
 * "Select parts of the car": tick as many zones as you want, put a price per race on each, and save
 * them all at once. Zones come from the vehicle type's template (car, bike, bicycle, kart, bus...).
 */
export function MultiSpotSheet({ visible, existing, onClose, onDone }: { visible: boolean; existing: string[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [pickingType, setPickingType] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({}); // zone key -> dollars; key present = selected
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({ queryKey: ["vehicleTypes"], queryFn: fetchVehicleTypes, staleTime: Infinity, enabled: visible });
  const activeType = types.data?.find((t) => t.id === typeId) ?? types.data?.[0] ?? null;
  const zonesQ = useQuery({ queryKey: ["typeZones", activeType?.id], queryFn: () => fetchTypeZones(activeType!.id), enabled: visible && !!activeType, staleTime: Infinity });

  const taken = useMemo(() => new Set(existing.map((n) => n.trim().toLowerCase())), [existing]);
  const zones = zonesQ.data ?? [];
  const groups = [
    { title: "On the vehicle", items: zones.filter((z) => z.kind === "vehicle") },
    { title: "Driver gear", items: zones.filter((z) => z.kind === "driver") },
  ].filter((g) => g.items.length > 0);
  const selectedKeys = Object.keys(prices);

  const reset = () => {
    setPrices({});
    setBulk("");
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const toggle = (z: TypeZone) => {
    if (taken.has(z.name.toLowerCase())) return;
    Haptics.selectionAsync();
    setPrices((p) => {
      const next = { ...p };
      if (z.key in next) delete next[z.key];
      else next[z.key] = bulk;
      return next;
    });
  };
  const applyBulk = (text: string) => {
    setBulk(text);
    setPrices((p) => Object.fromEntries(Object.keys(p).map((k) => [k, text])));
  };
  const selectAll = () => {
    const free = zones.filter((z) => !taken.has(z.name.toLowerCase()));
    setPrices(Object.fromEntries(free.map((z) => [z.key, prices[z.key] ?? bulk])));
  };

  const num = (t: string) => parseFloat(t.replace(",", "."));
  const total = selectedKeys.reduce((n, k) => n + (Number.isFinite(num(prices[k])) ? num(prices[k]) : 0), 0);

  const submit = async () => {
    if (!profile || busy) return;
    setError(null);
    const chosen = zones.filter((z) => z.key in prices);
    const missing = chosen.find((z) => !(num(prices[z.key]) > 0));
    if (chosen.length === 0) return setError("Tick at least one part of the car.");
    if (missing) return setError(`Add an amount for ${missing.name}.`);
    setBusy(true);
    try {
      await createSponsorshipSpots(
        profile.id,
        chosen.map((z) => ({ name: z.name, minBidDollars: 0, pricePerRaceDollars: num(prices[z.key]), xPct: z.xPct, yPct: z.yPct })),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
          <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
          <View className="max-h-[88%] rounded-t-3xl bg-paddock-bg px-5 pb-6 pt-4">
            <View className="mb-3 items-center">
              <View className="h-1 w-10 rounded-full bg-paddock-border" />
            </View>
            <Text className="text-[18px] font-semibold text-paddock-text">Select parts to sponsor</Text>

            <Pressable onPress={() => setPickingType(true)} className="mb-3 mt-3 flex-row items-center justify-between border border-paddock-border bg-paddock-surface px-3 py-3 active:opacity-70">
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-[1px] text-paddock-muted">Vehicle</Text>
                <Text className="mt-0.5 text-[15px] text-paddock-text">{activeType?.name ?? "Loading…"}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={MUTED} />
            </Pressable>

            <View className="mb-3 flex-row items-center gap-3">
              <View className="flex-1 flex-row items-center bg-paddock-surface px-3">
                <Text className="text-[15px] text-paddock-muted">$</Text>
                <TextInput
                  value={bulk}
                  onChangeText={applyBulk}
                  placeholder="Same price for all ticked"
                  placeholderTextColor="#6b6561"
                  keyboardType="decimal-pad"
                  className="ml-1 flex-1 py-2.5 text-[14px] text-paddock-text"
                />
              </View>
              <Pressable onPress={selectAll} className="px-2 py-2 active:opacity-60">
                <Text className="text-[12px] font-bold uppercase tracking-[1px] text-paddock-orange">Tick all</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {zonesQ.isPending && <ActivityIndicator color={ORANGE} className="py-8" />}
              {groups.map((g) => (
                <View key={g.title} className="mb-3">
                  <Text className="mb-1 text-[11px] font-extrabold uppercase tracking-[1.2px] text-paddock-muted">{g.title}</Text>
                  {g.items.map((z) => {
                    const listed = taken.has(z.name.toLowerCase());
                    const on = z.key in prices;
                    return (
                      <View key={z.key} className={`flex-row items-center border-b border-paddock-surface py-2.5 ${listed ? "opacity-40" : ""}`}>
                        <Pressable onPress={() => toggle(z)} disabled={listed} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: listed }} className="flex-1 flex-row items-center">
                          <View className={`h-5 w-5 items-center justify-center border ${on ? "border-paddock-orange bg-paddock-orange" : "border-paddock-border"}`}>
                            {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                          </View>
                          <Text className="ml-3 text-[15px] text-paddock-text">{z.name}</Text>
                          {listed && <Text className="ml-2 text-[11px] text-paddock-muted">Listed</Text>}
                        </Pressable>
                        {on && (
                          <View className="w-[110px] flex-row items-center bg-paddock-surface px-2">
                            <Text className="text-[14px] text-paddock-muted">$</Text>
                            <TextInput
                              value={prices[z.key]}
                              onChangeText={(t) => setPrices((p) => ({ ...p, [z.key]: t }))}
                              placeholder="0"
                              placeholderTextColor="#6b6561"
                              keyboardType="decimal-pad"
                              className="ml-1 flex-1 py-2 text-[15px] text-paddock-text"
                            />
                            <Text className="text-[10px] text-paddock-muted">/race</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {error && (
              <Text accessibilityRole="alert" className="mb-2 mt-2 text-[14px] text-[#ff7a5c]">
                {error}
              </Text>
            )}

            <Pressable onPress={submit} disabled={busy} className="mt-3 h-12 items-center justify-center bg-paddock-orange active:opacity-80">
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-[15px] font-semibold text-paddock-text">
                  {selectedKeys.length === 0 ? "Add spots" : `Add ${selectedKeys.length} ${selectedKeys.length === 1 ? "spot" : "spots"} · $${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}/race combined`}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SearchSelect
        visible={pickingType}
        title="Choose your vehicle"
        placeholder="Search car, bike, bicycle, kart, bus…"
        options={(types.data ?? []).map((t) => ({ id: t.id, label: t.name, sub: t.category.replace("_", " / ") }))}
        onSelect={(o) => {
          setPickingType(false);
          if (o.id !== activeType?.id) {
            setTypeId(o.id);
            reset();
          }
        }}
        onClose={() => setPickingType(false)}
      />
    </>
  );
}
