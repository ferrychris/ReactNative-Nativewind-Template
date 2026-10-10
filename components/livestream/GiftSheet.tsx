import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchGifts, fetchMyBalanceCents, sendGift, type Gift } from "@/lib/api/live";
import { formatPrice, TIERS, type GiftTier } from "@/lib/gifts";

const ORANGE = "#ec6a3a";

type Props = { streamId: string; hostName: string; visible: boolean; onClose: () => void; /** Called once the gift has gone through, so the room can show it straight away. */ onSent?: (gift: Gift, giftId: string | null) => void };

/** Bottom sheet where a viewer picks a gift (Cheer / Support / Big) and sends it to the host. */
export function GiftSheet({ streamId, hostName, visible, onClose, onSent }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tier, setTier] = useState<GiftTier>("cheer");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  const gifts = useQuery({ queryKey: ["gifts"], queryFn: fetchGifts, staleTime: 5 * 60_000, enabled: visible });
  const balance = useQuery({
    queryKey: ["myBalance", profile?.id],
    queryFn: () => fetchMyBalanceCents(profile!.id),
    enabled: visible && !!profile,
  });

  const send = async (gift: Gift) => {
    if (sendingId) return;
    setError(null);
    setSendingId(gift.id);
    try {
      const txId = await sendGift(streamId, gift.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent?.(gift, txId);
      setSentId(gift.id);
      setTimeout(() => setSentId((cur) => (cur === gift.id ? null : cur)), 1200);
      qc.invalidateQueries({ queryKey: ["myBalance"] });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : "Couldn't send the gift. Try again.");
    } finally {
      setSendingId(null);
    }
  };

  const shown = (gifts.data ?? []).filter((g) => g.tier === tier);
  const funds = balance.data;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} accessibilityLabel="Close gifts" />
      <View className="bg-paddock-surface">
        <SafeAreaView edges={["bottom"]}>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
            <View className="flex-1 pr-3">
              <Text className="text-[18px] font-semibold text-paddock-text">Send a gift</Text>
              <Text numberOfLines={1} className="mt-0.5 text-[13px] text-paddock-muted">
                to {hostName}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[11px] uppercase tracking-[1.5px] text-paddock-muted">Wallet</Text>
              <Text className="text-[16px] font-semibold text-paddock-text">{funds === undefined ? "—" : formatPrice(funds)}</Text>
            </View>
          </View>

          <View className="flex-row px-5 pb-3 pt-1">
            {TIERS.map((t) => {
              const active = t.id === tier;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTier(t.id);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className={`mr-2 border px-4 py-2 ${active ? "border-paddock-orange bg-paddock-orange" : "border-white/15"}`}
                >
                  <Text className={`text-[13px] font-semibold uppercase tracking-[1px] ${active ? "text-paddock-text" : "text-paddock-muted"}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="min-h-[132px] flex-row px-4">
            {gifts.isPending ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={ORANGE} />
              </View>
            ) : gifts.isError ? (
              <Text className="flex-1 py-8 text-center text-[14px] text-paddock-muted">Couldn't load gifts. Close this and try again.</Text>
            ) : (
              shown.map((g) => {
                const cantAfford = funds !== undefined && funds < g.priceCents;
                const busy = sendingId === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => send(g)}
                    disabled={!!sendingId}
                    accessibilityLabel={`Send ${g.name} for ${formatPrice(g.priceCents)}`}
                    className="mx-1 flex-1 items-center border border-white/10 bg-black/30 py-4 active:opacity-70"
                    style={{ opacity: cantAfford ? 0.45 : 1 }}
                  >
                    {busy ? <ActivityIndicator color={ORANGE} style={{ height: 40 }} /> : <Text style={{ fontSize: 34, lineHeight: 40 }}>{sentId === g.id ? "✅" : g.emoji}</Text>}
                    <Text numberOfLines={1} className="mt-2 px-1 text-[13px] font-medium text-paddock-text">
                      {g.name}
                    </Text>
                    <Text className="mt-0.5 text-[13px] font-semibold text-paddock-orange">{formatPrice(g.priceCents)}</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <Text accessibilityRole={error ? "alert" : undefined} className={`px-5 pb-4 pt-3 text-[13px] ${error ? "text-[#ff7a5c]" : "text-paddock-muted"}`}>
            {error ?? TIERS.find((t) => t.id === tier)?.hint}
          </Text>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
