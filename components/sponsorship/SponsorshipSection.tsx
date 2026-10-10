import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { acceptTopBid, createSponsorshipSpot, deleteSponsorshipSpot, placeBid, updateSponsorshipSpot } from "@/lib/api/sponsorship";
import { usd } from "@/lib/format";
import type { ProfileView } from "@/lib/types";
import { DealsPanel } from "./DealsPanel";
import { OfferSheet } from "./OfferSheet";
import { CarMap, presetFor, spotPosition } from "./CarMap";
import { CarViewer } from "./CarViewer";
import { MultiSpotSheet } from "./MultiSpotSheet";

const ORANGE = "#e8582f";
const MUTED = "#9a928d";

type Decal = ProfileView["decals"][number];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">{label}</Text>
      <View className="bg-paddock-surface px-4">{children}</View>
    </View>
  );
}

const inputClass = "py-3.5 text-[16px] text-paddock-text";

/** Typical places to sell on a car, bike or kit: tap one to start a spot. */
const SECTIONS = ["Hood", "Roof", "Front bumper", "Rear wing", "Doors", "Side skirts", "Windshield banner", "Trunk", "Helmet", "Race suit"];

/** Bottom sheet used both to list a new spot (owner) and to place a bid (visitor). */
function SpotSheet({
  mode,
  decal,
  existing = [],
  photoUrl = null,
  onClose,
  onDone,
}: {
  mode: "create" | "bid" | "edit" | null;
  decal: Decal | null;
  existing?: string[];
  photoUrl?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [perRace, setPerRace] = useState("");
  const [perSeason, setPerSeason] = useState("");
  const [seasonRaces, setSeasonRaces] = useState("");
  const [pos, setPos] = useState<[number, number]>([50, 50]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefill when opening the sheet to edit an existing spot
  useEffect(() => {
    if (mode !== "edit" || !decal) return;
    const dollars = (c: number | null) => (c ? String(c / 100) : "");
    setName(decal.placement);
    setDescription(decal.description ?? "");
    setAmount(dollars(decal.minBidCents));
    setPerRace(dollars(decal.pricePerRaceCents));
    setPerSeason(dollars(decal.pricePerSeasonCents));
    setSeasonRaces(decal.seasonRaces ? String(decal.seasonRaces) : "");
    setPos(spotPosition(decal));
  }, [mode, decal]);

  const reset = () => {
    setName("");
    setDescription("");
    setAmount("");
    setPerRace("");
    setPerSeason("");
    setSeasonRaces("");
    setPos([50, 50]);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError(null);
    try {
      const dollars = parseFloat(amount.replace(",", "."));
      if (mode === "create" || (mode === "edit" && decal)) {
        const num = (t: string) => parseFloat(t.replace(",", "."));
        const input = {
          name,
          description,
          minBidDollars: Number.isFinite(dollars) ? dollars : 0,
          pricePerRaceDollars: num(perRace),
          pricePerSeasonDollars: num(perSeason),
          seasonRaces: num(seasonRaces),
          xPct: pos[0],
          yPct: pos[1],
        };
        if (mode === "edit" && decal) await updateSponsorshipSpot(decal.id, input);
        else await createSponsorshipSpot(profile.id, input);
      } else if (mode === "bid" && decal) {
        if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("Enter an amount.");
        await placeBid(decal.id, Math.round(dollars * 100));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const isForm = mode === "create" || mode === "edit";
  const title = mode === "create" ? "Add a sponsorship spot" : mode === "edit" ? "Edit spot pricing & terms" : `Bid on ${decal?.placement ?? "this spot"}`;

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
        <View className="rounded-t-3xl bg-paddock-bg px-5 pb-8 pt-4">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <Text className="mb-4 text-[18px] font-semibold text-paddock-text">{title}</Text>

          {isForm ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
              <Field label="Where on the car, bike or kit">
                <TextInput value={name} onChangeText={setName} placeholder="Hood, rear wing, helmet..." placeholderTextColor="#6b6561" maxLength={40} className={inputClass} />
              </Field>
              {mode === "create" && (
                <View className="-mt-1 mb-4 flex-row flex-wrap gap-2">
                  {SECTIONS.map((sec) => {
                    const taken = existing.some((e) => e.toLowerCase() === sec.toLowerCase());
                    const on = name.trim().toLowerCase() === sec.toLowerCase();
                    return (
                      <Pressable
                        key={sec}
                        disabled={taken}
                        onPress={() => {
                          setName(sec);
                          setPos(presetFor(sec));
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${sec}`}
                        className={`border px-3 py-1.5 ${on ? "border-paddock-orange bg-paddock-orange/15" : "border-paddock-border"} ${taken ? "opacity-35" : "active:opacity-70"}`}
                      >
                        <Text className={`text-[12.5px] ${on ? "text-paddock-orange" : "text-paddock-muted"}`}>{sec}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">Where it shows on your car (tap the photo)</Text>
              <View className="mb-4">
                <CarMap photoUrl={photoUrl} pick={{ x: pos[0], y: pos[1] }} onPick={(x, y) => setPos([x, y])} />
              </View>
              <Field label="Details (optional)">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Size, visibility, how many races..."
                  placeholderTextColor="#6b6561"
                  maxLength={200}
                  multiline
                  className={`${inputClass} min-h-[72px]`}
                  style={{ textAlignVertical: "top" }}
                />
              </Field>
              <Field label="Your price per race (USD)">
                <TextInput value={perRace} onChangeText={setPerRace} placeholder="150" placeholderTextColor="#6b6561" keyboardType="decimal-pad" className={inputClass} />
              </Field>
              <Field label="Price for a season (USD, optional)">
                <TextInput value={perSeason} onChangeText={setPerSeason} placeholder="900" placeholderTextColor="#6b6561" keyboardType="decimal-pad" className={inputClass} />
              </Field>
              {perSeason.trim() !== "" && (
                <Field label="Races in a season">
                  <TextInput value={seasonRaces} onChangeText={setSeasonRaces} placeholder="8" placeholderTextColor="#6b6561" keyboardType="number-pad" className={inputClass} />
                </Field>
              )}
              <Field label="Minimum bid (USD)">
                <TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor="#6b6561" keyboardType="decimal-pad" className={inputClass} />
              </Field>
            </ScrollView>
          ) : (
            <>
              {decal && decal.minBidCents > 0 && <Text className="-mt-2 mb-4 text-[13px] text-paddock-muted">Minimum bid {usd(decal.minBidCents)}</Text>}
              <Field label="Your bid (USD)">
                <TextInput value={amount} onChangeText={setAmount} placeholder="100" placeholderTextColor="#6b6561" keyboardType="decimal-pad" autoFocus className={inputClass} />
              </Field>
              <Text className="mb-4 text-[13px] leading-5 text-paddock-muted">
                You&apos;re only charged if the owner accepts your bid. Your wallet needs enough balance at that moment.
              </Text>
            </>
          )}

          {error && (
            <Text accessibilityRole="alert" className="mb-3 text-[14px] text-[#ff7a5c]">
              {error}
            </Text>
          )}

          <Pressable onPress={submit} disabled={busy} className="h-12 items-center justify-center bg-paddock-orange active:opacity-80">
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[16px] font-semibold text-paddock-text">{mode === "create" ? "Add spot" : mode === "edit" ? "Save changes" : "Place bid"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const short = (cents: number) => usd(cents).replace(/\.00$/, "");

/** One spot as a single row: number, name and price line on the left, status and actions on the right. */
function SpotRow({
  decal: d,
  index,
  last,
  isMe,
  busy,
  onEdit,
  onAccept,
  onRemove,
  onOffer,
  onBid,
}: {
  decal: Decal;
  index: number;
  last: boolean;
  isMe: boolean;
  busy: boolean;
  onEdit: () => void;
  onAccept: () => void;
  onRemove: () => void;
  onOffer: () => void;
  onBid: () => void;
}) {
  const hasPrice = d.pricePerRaceCents !== null || d.pricePerSeasonCents !== null;
  const priceLine = !d.available
    ? "Sponsored"
    : hasPrice
      ? [d.pricePerRaceCents !== null ? `${short(d.pricePerRaceCents)} / race` : null, d.pricePerSeasonCents !== null ? `${short(d.pricePerSeasonCents)} / season` : null].filter(Boolean).join("  ·  ")
      : d.topBidCents !== null
        ? `Top bid ${short(d.topBidCents)}`
        : d.minBidCents > 0
          ? `Min bid ${short(d.minBidCents)}`
          : "Open to offers";

  const body = (
    <>
      <View className="h-10 w-10 items-center justify-center border border-paddock-border bg-paddock-bg">
        <Text className="text-[13px] font-bold text-paddock-orange">{String(index).padStart(2, "0")}</Text>
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Text numberOfLines={1} className="text-[15px] font-semibold text-paddock-text">
          {d.placement}
        </Text>
        <Text numberOfLines={1} className={`mt-0.5 text-[12.5px] ${d.available ? "text-paddock-muted" : "text-paddock-orange"}`}>
          {priceLine}
        </Text>
      </View>
    </>
  );

  return (
    <View className={`flex-row items-center px-3 py-3 ${last ? "" : "border-b border-paddock-border"}`}>
      {isMe ? (
        <Pressable onPress={onEdit} disabled={!d.available} accessibilityRole="button" accessibilityLabel={`Edit ${d.placement}`} className="flex-1 flex-row items-center active:opacity-70">
          {body}
        </Pressable>
      ) : (
        <View className="flex-1 flex-row items-center">{body}</View>
      )}

      {isMe ? (
        <View className="flex-row items-center">
          {d.available && d.openBids > 0 && (
            <Pressable onPress={onAccept} disabled={busy} accessibilityLabel="Accept top bid" className="mr-2 h-9 flex-row items-center bg-paddock-orange px-3 active:opacity-80">
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-[12px] font-bold text-white">{d.openBids} {d.openBids === 1 ? "bid" : "bids"} · Accept</Text>}
            </Pressable>
          )}
          {d.available && d.openBids === 0 && (
            <View className="mr-2 border border-paddock-orange/60 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-[1px] text-paddock-orange">Open</Text>
            </View>
          )}
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove spot" className="h-9 w-9 items-center justify-center active:opacity-60">
            <Ionicons name="trash-outline" size={18} color={MUTED} />
          </Pressable>
        </View>
      ) : d.available ? (
        <View className="flex-row items-center">
          {!hasPrice && (
            <Pressable onPress={onBid} accessibilityLabel="Place bid" className="mr-2 h-9 items-center justify-center border border-paddock-border px-3 active:opacity-60">
              <Text className="text-[12px] font-bold uppercase tracking-[1px] text-paddock-muted">Bid</Text>
            </Pressable>
          )}
          <Pressable onPress={onOffer} accessibilityLabel="Make an offer" className="h-9 items-center justify-center bg-paddock-orange px-4 active:opacity-80">
            <Text className="text-[12px] font-bold uppercase tracking-[1px] text-white">Offer</Text>
          </Pressable>
        </View>
      ) : (
        <View className="border border-paddock-border px-2 py-0.5">
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-paddock-muted">Sponsored</Text>
        </View>
      )}
    </View>
  );
}

/** The sponsorship list on a profile: anyone can run it, anyone can bid. */
export function SponsorshipSection({ view, onChangePhoto, photoBusy }: { view: ProfileView; onChangePhoto?: () => void; photoBusy?: boolean }) {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<{ mode: "create" | "bid" | "edit"; decal: Decal | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<Decal | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const router = useRouter();

  const refresh = () => qc.invalidateQueries({ queryKey: ["profile"] });

  const accept = (spotId: string) => {
    Alert.alert("Accept top bid?", "The bidder's wallet is charged now and the spot is marked as sponsored.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
        onPress: async () => {
          setBusyId(spotId);
          try {
            await acceptTopBid(spotId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refresh();
          } catch (e) {
            Alert.alert("Couldn't accept bid", e instanceof Error ? e.message : "Try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const remove = (d: Decal) => {
    Alert.alert(`Remove "${d.placement}"?`, "Open bids on it are cancelled.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSponsorshipSpot(d.id);
            await refresh();
          } catch (e) {
            Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  };

  return (
    <View>
      <CarViewer
        view={view}
        onChangePhoto={view.isMe ? onChangePhoto : undefined}
        photoBusy={photoBusy}
        onPressSpot={(d) => {
          if (view.isMe) setSheet({ mode: "edit", decal: d });
          else if (d.available) setOfferFor(d);
        }}
      />
    <View className="mt-4 gap-3 px-5">
      {view.isMe && <DealsPanel />}

      {view.decals.length === 0 && view.loading?.decals && <ActivityIndicator color={ORANGE} className="py-10" />}

      {view.decals.length === 0 && !view.loading?.decals && (
        <View className="items-center px-10 py-10">
          <Ionicons name="pricetag-outline" size={34} color={MUTED} />
          <Text className="mt-3 text-center text-[15px] text-paddock-muted">
            {view.isMe ? "Run a sponsorship: list a spot on your car, bike or kit and let people bid for it." : "No sponsorship spots listed"}
          </Text>
        </View>
      )}

      {view.decals.length > 0 && (
        <View>
          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-semibold uppercase tracking-[2px] text-paddock-muted">Spot inventory</Text>
            <Text className="text-[12px] text-paddock-muted">{view.decals.filter((d) => d.available).length} open</Text>
          </View>
          <View className="border border-paddock-border bg-paddock-surface/60">
            {view.decals.map((d, i) => (
              <SpotRow
                key={d.id}
                decal={d}
                index={i + 1}
                last={i === view.decals.length - 1}
                isMe={view.isMe}
                busy={busyId === d.id}
                onEdit={() => setSheet({ mode: "edit", decal: d })}
                onAccept={() => accept(d.id)}
                onRemove={() => remove(d)}
                onOffer={() => setOfferFor(d)}
                onBid={() => setSheet({ mode: "bid", decal: d })}
              />
            ))}
          </View>
        </View>
      )}

      {view.isMe && (
        <Pressable
          onPress={() => setPartsOpen(true)}
          accessibilityRole="button"
          className="flex-row items-center justify-center bg-paddock-orange py-4 active:opacity-80"
        >
          <Ionicons name="checkbox-outline" size={16} color="#fff" />
          <Text className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">Select parts &amp; set amounts</Text>
        </Pressable>
      )}

      {view.isMe && (
        <Pressable
          onPress={() => setSheet({ mode: "create", decal: null })}
          accessibilityRole="button"
          className="items-center border border-dashed border-paddock-border py-4 active:opacity-70"
        >
          <Text className="text-[14px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">+ Add sponsorship spot</Text>
        </Pressable>
      )}

      <OfferSheet
        decal={offerFor}
        racerName={view.name}
        onClose={() => setOfferFor(null)}
        onSent={() => {
          setOfferFor(null);
          Alert.alert("Offer sent", `${view.name} has been told. You'll hear back here and in your inbox.`, [
            { text: "OK", style: "cancel" },
            { text: "View my offers", onPress: () => router.push("/sponsorship/offers") },
          ]);
        }}
      />

      <MultiSpotSheet
        visible={partsOpen}
        existing={view.decals.map((d) => d.placement)}
        onClose={() => setPartsOpen(false)}
        onDone={() => {
          setPartsOpen(false);
          refresh();
        }}
      />

      <SpotSheet
        mode={sheet?.mode ?? null}
        decal={sheet?.decal ?? null}
        existing={view.decals.map((d) => d.placement)}
        photoUrl={view.racer?.carPhotoUrl ?? null}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          refresh();
        }}
      />
    </View>
    </View>
  );
}
