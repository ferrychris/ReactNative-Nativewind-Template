import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { cancelDeal, dealError, fetchDeals, isActiveDeal, racerShareCents, respondToOffer, submitProof, type Deal, type DealStatus } from "@/lib/api/deals";
import { usd } from "@/lib/format";

const ORANGE = "#e8582f";
const MUTED = "#9a928d";
const money = (cents: number) => usd(cents).replace(/\.00$/, "");

/** Deals where the signed-in member is the racer. Shared by the panel and the badge on the Car tab. */
export function useRacerDeals() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["deals", "racer", profile?.id],
    queryFn: () => fetchDeals(profile!.id, "racer"),
    enabled: !!profile,
    staleTime: 30_000,
  });
}

/** How many offers are waiting for an answer. */
export function useNewOfferCount() {
  const { data } = useRacerDeals();
  return (data ?? []).filter((d) => d.status === "offered").length;
}

const STATUS_LABEL: Record<DealStatus, string> = {
  offered: "New offer",
  accepted: "Accepted",
  paid: "Paid",
  delivered: "Proof posted",
  confirmed: "Complete",
  disputed: "Disputed",
  refunded: "Refunded",
  declined: "Declined",
  cancelled: "Cancelled",
};

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function nextStep(d: Deal): string {
  switch (d.status) {
    case "accepted":
      return "Waiting for the sponsor to pay. Payment opens soon.";
    case "paid":
      return "Funds are held. Put the decal on, race, then post proof.";
    case "delivered": {
      const n = daysLeft(d.autoConfirmAt);
      return n === null ? "Waiting for the sponsor." : `Waiting for the sponsor. It confirms by itself in ${n} ${n === 1 ? "day" : "days"}.`;
    }
    case "disputed":
      return d.disputeReason ? `Sponsor says: ${d.disputeReason}` : "The sponsor disputed your proof. Support will review it.";
    default:
      return "";
  }
}

function Chip({ status }: { status: DealStatus }) {
  const hot = status === "offered" || status === "paid";
  return (
    <View className={`border px-2 py-0.5 ${hot ? "border-paddock-orange/60" : "border-paddock-border"}`}>
      <Text className={`text-[11px] ${hot ? "text-paddock-orange" : "text-paddock-muted"}`}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function DealHeader({ d }: { d: Deal }) {
  return (
    <View className="flex-row items-start">
      <UserAvatar name={d.sponsorName} url={d.sponsorLogoUrl} size={36} />
      <View className="ml-3 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-semibold text-paddock-text">
          {d.sponsorName}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-paddock-muted">
          {d.spotName} · {d.pricing === "season" ? `Season, ${d.races} races` : d.races === 1 ? "1 race" : `${d.races} races`}
          {d.custom ? " · Custom offer" : ""}
        </Text>
      </View>
      <Chip status={d.status} />
    </View>
  );
}

function Amounts({ d }: { d: Deal }) {
  return (
    <View className="mt-3 flex-row items-end justify-between">
      <Text className="text-[22px] font-semibold text-paddock-text">{money(d.amountCents)}</Text>
      <Text className="text-[12px] text-paddock-muted">You receive {money(racerShareCents(d))} after the {d.feeBps / 100}% fee</Text>
    </View>
  );
}

/* ---------------- proof ---------------- */

function ProofSheet({ deal, onClose, onDone }: { deal: Deal | null; onClose: () => void; onDone: () => void }) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPhoto(null);
    setLabel("");
    setNote("");
    setError(null);
    onClose();
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled) {
      setPhoto(result.assets[0]);
      setError(null);
    }
  };

  const send = async () => {
    if (!deal || busy) return;
    if (!photo) return setError("Add a photo of the car with the logo on it.");
    setBusy(true);
    setError(null);
    try {
      await submitProof(deal.id, { uri: photo.uri, file: photo.file }, label, note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhoto(null);
      setLabel("");
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : dealError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={deal !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
        <View className="max-h-[88%] rounded-t-3xl bg-paddock-bg px-5 pb-8 pt-4">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text className="text-[18px] font-semibold text-paddock-text">Post proof for {deal?.sponsorName}</Text>
            <Text className="mb-4 mt-1 text-[13px] leading-5 text-paddock-muted">A clear photo of your car with their logo on it. They have 7 days to confirm it.</Text>

            <Pressable onPress={pick} className="mb-4 h-[180px] items-center justify-center overflow-hidden border border-dashed border-paddock-border bg-paddock-surface active:opacity-80">
              {photo ? (
                <Image source={{ uri: photo.uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={32} color={MUTED} />
                  <Text className="mt-2 text-[14px] text-paddock-muted">Choose a photo</Text>
                </>
              )}
            </Pressable>

            <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">Which race</Text>
            <View className="mb-4 bg-paddock-surface px-4">
              <TextInput value={label} onChangeText={setLabel} placeholder="Round 3 at Austin" placeholderTextColor="#6b6561" maxLength={120} className="py-3.5 text-[16px] text-paddock-text" />
            </View>

            <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">Note (optional)</Text>
            <View className="mb-4 bg-paddock-surface px-4">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Finished P4, logo on the hood the whole weekend"
                placeholderTextColor="#6b6561"
                maxLength={500}
                multiline
                className="min-h-[72px] py-3.5 text-[16px] text-paddock-text"
                style={{ textAlignVertical: "top" }}
              />
            </View>

            {error && (
              <Text accessibilityRole="alert" className="mb-3 text-[14px] text-[#ff7a5c]">
                {error}
              </Text>
            )}

            <Pressable onPress={send} disabled={busy} className="h-12 items-center justify-center bg-paddock-orange active:opacity-80" style={{ opacity: busy ? 0.7 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[16px] font-semibold text-paddock-text">Post proof</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------- panel ---------------- */

function Heading({ children, count }: { children: string; count?: number }) {
  return (
    <View className="mb-2 mt-1 flex-row items-center justify-between">
      <Text className="text-[12px] font-semibold uppercase tracking-[2px] text-paddock-muted">{children}</Text>
      {count !== undefined && <Text className="text-[12px] text-paddock-muted">{count}</Text>}
    </View>
  );
}

/** The racer's side of sponsorship: offers to answer, deals in progress, and past deals. */
export function DealsPanel() {
  const qc = useQueryClient();
  const deals = useRacerDeals();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<Deal | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["deals"] }), qc.invalidateQueries({ queryKey: ["profile"] })]);

  const run = async (id: string, work: () => Promise<void>, failTitle: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await work();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : "Try again.");
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const accept = (d: Deal) =>
    Alert.alert(`Accept ${money(d.amountCents)} from ${d.sponsorName}?`, `"${d.spotName}" is reserved for them and other offers on it are declined. You receive ${money(racerShareCents(d))} after the ${d.feeBps / 100}% fee.`, [
      { text: "Not yet", style: "cancel" },
      { text: "Accept", onPress: () => run(d.id, () => respondToOffer(d.id, true), "Couldn't accept") },
    ]);

  const decline = (d: Deal) =>
    Alert.alert("Decline this offer?", `${d.sponsorName} will be told.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => run(d.id, () => respondToOffer(d.id, false), "Couldn't decline") },
    ]);

  const cancel = (d: Deal) =>
    Alert.alert("Cancel this deal?", `"${d.spotName}" opens up again and ${d.sponsorName} is told.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel deal", style: "destructive", onPress: () => run(d.id, () => cancelDeal(d.id), "Couldn't cancel") },
    ]);

  if (deals.isPending) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }
  // deals only exist once the sponsorship migration is applied; spots below still work without them
  if (deals.isError) return null;

  const all = deals.data;
  const offers = all.filter((d) => d.status === "offered");
  const active = all.filter(isActiveDeal);
  const past = all.filter((d) => ["confirmed", "declined", "cancelled", "refunded"].includes(d.status)).slice(0, 5);
  if (all.length === 0) return null;

  return (
    <View className="mb-2">
      {offers.length > 0 && (
        <>
          <Heading count={offers.length}>Offers</Heading>
          {offers.map((d) => (
            <View key={d.id} className="mb-3 border border-paddock-orange/50 bg-paddock-surface/60 p-4">
              <DealHeader d={d} />
              <Amounts d={d} />
              {d.message ? <Text className="mt-3 text-[14px] leading-5 text-paddock-text/85">{`"${d.message}"`}</Text> : null}
              <View className="mt-4 flex-row gap-2">
                <Pressable onPress={() => accept(d)} disabled={busyId === d.id} className="h-11 flex-1 items-center justify-center bg-paddock-orange active:opacity-80">
                  {busyId === d.id ? <ActivityIndicator color="#fff" /> : <Text className="text-[14px] font-semibold text-paddock-text">Accept</Text>}
                </Pressable>
                <Pressable onPress={() => decline(d)} disabled={busyId === d.id} className="h-11 flex-1 items-center justify-center border border-paddock-border active:opacity-60">
                  <Text className="text-[14px] text-paddock-muted">Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      {active.length > 0 && (
        <>
          <Heading count={active.length}>In progress</Heading>
          {active.map((d) => (
            <View key={d.id} className="mb-3 border border-paddock-border bg-paddock-surface/60 p-4">
              <DealHeader d={d} />
              <Amounts d={d} />
              <Text className="mt-3 text-[13px] leading-5 text-paddock-muted">{nextStep(d)}</Text>
              {(d.status === "paid" || d.status === "delivered") && (
                <Pressable onPress={() => setProofFor(d)} className="mt-4 h-11 items-center justify-center bg-paddock-orange active:opacity-80">
                  <Text className="text-[14px] font-semibold text-paddock-text">{d.status === "paid" ? "Post proof" : "Add more proof"}</Text>
                </Pressable>
              )}
              {d.status === "accepted" && (
                <Pressable onPress={() => cancel(d)} disabled={busyId === d.id} className="mt-4 h-11 items-center justify-center border border-paddock-border active:opacity-60">
                  <Text className="text-[14px] text-paddock-muted">Cancel deal</Text>
                </Pressable>
              )}
            </View>
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <Heading>Past deals</Heading>
          {past.map((d) => (
            <View key={d.id} className="mb-2 flex-row items-center justify-between border border-paddock-border/60 px-4 py-3">
              <View className="flex-1 pr-3">
                <Text numberOfLines={1} className="text-[14px] text-paddock-text">
                  {d.sponsorName}
                </Text>
                <Text numberOfLines={1} className="text-[12px] text-paddock-muted">
                  {d.spotName} · {money(d.amountCents)}
                </Text>
              </View>
              <Chip status={d.status} />
            </View>
          ))}
        </>
      )}

      <ProofSheet
        deal={proofFor}
        onClose={() => setProofFor(null)}
        onDone={() => {
          setProofFor(null);
          refresh();
        }}
      />
    </View>
  );
}
