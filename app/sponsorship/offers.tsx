import React, { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cancelDeal, fetchDeals, type Deal, type DealStatus } from "@/lib/api/deals";
import { usd } from "@/lib/format";

const ORANGE = "#e8582f";
const money = (cents: number) => usd(cents).replace(/\.00$/, "");

const LABEL: Record<DealStatus, string> = {
  offered: "Waiting for the racer",
  accepted: "Accepted",
  paid: "Paid",
  delivered: "Proof posted",
  confirmed: "Complete",
  disputed: "Disputed",
  refunded: "Refunded",
  declined: "Declined",
  cancelled: "Cancelled",
};

function help(d: Deal): string {
  switch (d.status) {
    case "offered":
      return "The racer has your offer. You'll be told as soon as they answer.";
    case "accepted":
      return "They said yes. Payment opens soon, and the spot stays reserved for you.";
    case "paid":
      return "Your payment is held. The racer posts proof after the race.";
    case "delivered":
      return "Proof is in. Confirm it, or it confirms by itself after 7 days.";
    case "declined":
      return "The racer passed on this one, or the spot went to someone else.";
    default:
      return "";
  }
}

/** The sponsor's side: every offer they've made and where each one stands. */
export default function SponsorOffersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const deals = useQuery({ queryKey: ["deals", "sponsor", profile?.id], queryFn: () => fetchDeals(profile!.id, "sponsor"), enabled: !!profile });

  const cancel = (d: Deal) =>
    Alert.alert(d.status === "offered" ? "Withdraw this offer?" : "Cancel this deal?", `${d.spotName} will be open to other sponsors again.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: d.status === "offered" ? "Withdraw" : "Cancel deal",
        style: "destructive",
        onPress: async () => {
          setBusyId(d.id);
          try {
            await cancelDeal(d.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert("Couldn't cancel", e instanceof Error ? e.message : "Try again.");
          } finally {
            setBusyId(null);
            qc.invalidateQueries({ queryKey: ["deals"] });
          }
        },
      },
    ]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="h-14 flex-row items-center border-b border-paddock-surface px-3">
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} accessibilityLabel="Back" className="mr-2 active:opacity-60">
          <Ionicons name="arrow-back" size={24} color="#f2f0ee" />
        </Pressable>
        <Text className="text-[18px] font-semibold text-paddock-text">My sponsor offers</Text>
      </View>

      {deals.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : deals.isError ? (
        <Pressable onPress={() => deals.refetch()} className="flex-1 items-center justify-center active:opacity-70">
          <Text className="text-[15px] text-paddock-muted">{"Couldn't load your offers. Tap to retry."}</Text>
        </Pressable>
      ) : (
        <FlatList
          data={deals.data}
          keyExtractor={(d) => d.id}
          contentContainerClassName="px-5 py-4"
          refreshing={deals.isRefetching}
          onRefresh={() => deals.refetch()}
          ListEmptyComponent={
            <View className="items-center px-8 py-20">
              <Ionicons name="briefcase-outline" size={40} color="#6b6561" />
              <Text className="mt-3 text-center text-[15px] leading-6 text-paddock-muted">
                {"No offers yet. Open a racer's profile, go to their Car tab, and make an offer on an open spot."}
              </Text>
            </View>
          }
          renderItem={({ item: d }) => (
            <View className="mb-3 border border-paddock-border bg-paddock-surface/60 p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text numberOfLines={1} className="text-[15px] font-semibold text-paddock-text">
                    {d.spotName}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-paddock-muted">
                    {d.pricing === "season" ? `Season, ${d.races} races` : d.races === 1 ? "1 race" : `${d.races} races`}
                    {d.custom ? " · Your own price" : ""}
                  </Text>
                </View>
                <View className={`border px-2 py-0.5 ${d.status === "offered" || d.status === "accepted" ? "border-paddock-orange/60" : "border-paddock-border"}`}>
                  <Text className={`text-[11px] ${d.status === "offered" || d.status === "accepted" ? "text-paddock-orange" : "text-paddock-muted"}`}>{LABEL[d.status]}</Text>
                </View>
              </View>
              <Text className="mt-3 text-[22px] font-semibold text-paddock-text">{money(d.amountCents)}</Text>
              {help(d) ? <Text className="mt-2 text-[13px] leading-5 text-paddock-muted">{help(d)}</Text> : null}
              {(d.status === "offered" || d.status === "accepted") && (
                <Pressable onPress={() => cancel(d)} disabled={busyId === d.id} className="mt-4 h-11 items-center justify-center border border-paddock-border active:opacity-60">
                  {busyId === d.id ? <ActivityIndicator color={ORANGE} /> : <Text className="text-[14px] text-paddock-muted">{d.status === "offered" ? "Withdraw offer" : "Cancel deal"}</Text>}
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
