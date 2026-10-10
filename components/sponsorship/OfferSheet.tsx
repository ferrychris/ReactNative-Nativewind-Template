import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { becomeSponsor, makeOffer } from "@/lib/api/sponsorship";
import { usd } from "@/lib/format";
import type { ProfileView } from "@/lib/types";

const ORANGE = "#e8582f";
const money = (cents: number) => usd(cents).replace(/\.00$/, "");
const inputClass = "py-3.5 text-[16px] text-paddock-text";

type Decal = ProfileView["decals"][number];
type Choice = "race" | "season" | "custom";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">{label}</Text>
      <View className="bg-paddock-surface px-4">{children}</View>
    </View>
  );
}

function Option({ selected, title, detail, onPress }: { selected: boolean; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`mb-2 flex-row items-center border px-4 py-3.5 active:opacity-80 ${selected ? "border-paddock-orange bg-paddock-surface" : "border-paddock-border"}`}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? ORANGE : "#6b6561"} />
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-paddock-text">{title}</Text>
        <Text className="mt-0.5 text-[12px] text-paddock-muted">{detail}</Text>
      </View>
    </Pressable>
  );
}

/** Sponsor flow on a racer's open spot: set up a sponsor account once, then make an offer. */
export function OfferSheet({ decal, racerName, onClose, onSent }: { decal: Decal | null; racerName: string; onClose: () => void; onSent: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const isSponsor = profile?.user_type === "sponsor";

  const [business, setBusiness] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [setupDone, setSetupDone] = useState(false);

  const [choice, setChoice] = useState<Choice | null>(null);
  const [races, setRaces] = useState(1);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSetup = !isSponsor && !setupDone;
  const hasRace = decal?.pricePerRaceCents != null;
  const hasSeason = decal?.pricePerSeasonCents != null;
  // nothing preselected: default to whatever the racer sells, else a custom offer
  const picked: Choice = choice ?? (hasRace ? "race" : hasSeason ? "season" : "custom");
  const customDollars = parseFloat(custom.replace(",", "."));

  let totalCents: number | null = null;
  if (picked === "race" && hasRace) totalCents = decal!.pricePerRaceCents! * races;
  else if (picked === "season" && hasSeason) totalCents = decal!.pricePerSeasonCents!;
  else if (picked === "custom" && Number.isFinite(customDollars) && customDollars >= 1) totalCents = Math.round(customDollars * 100);

  const close = () => {
    setError(null);
    onClose();
  };

  const setup = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await becomeSponsor({ businessName: business, city, website, contactEmail: email });
      await refreshProfile();
      setSetupDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!decal || busy) return;
    if (totalCents === null) return setError("Enter an amount of at least $1.");
    setBusy(true);
    setError(null);
    try {
      await makeOffer({
        spotId: decal.id,
        pricing: picked === "season" ? "season" : "race",
        races,
        message,
        customDollars: picked === "custom" ? customDollars : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ["deals"] });
      setMessage("");
      setCustom("");
      setChoice(null);
      setRaces(1);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={decal !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
        <View className="max-h-[90%] rounded-t-3xl bg-paddock-bg px-5 pb-8 pt-4">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {needsSetup ? (
              <>
                <Text className="text-[18px] font-semibold text-paddock-text">Set up your sponsor account</Text>
                <Text className="mb-4 mt-1 text-[13px] leading-5 text-paddock-muted">One time only. Racers see this when you make an offer.</Text>
                <Field label="Business name">
                  <TextInput value={business} onChangeText={setBusiness} placeholder="Joe's Tyres" placeholderTextColor="#6b6561" maxLength={80} autoCapitalize="words" className={inputClass} />
                </Field>
                <Field label="City (optional)">
                  <TextInput value={city} onChangeText={setCity} placeholder="Austin, TX" placeholderTextColor="#6b6561" maxLength={60} autoCapitalize="words" className={inputClass} />
                </Field>
                <Field label="Website (optional)">
                  <TextInput value={website} onChangeText={setWebsite} placeholder="joestyres.com" placeholderTextColor="#6b6561" autoCapitalize="none" keyboardType="url" className={inputClass} />
                </Field>
                <Field label="Contact email (optional)">
                  <TextInput value={email} onChangeText={setEmail} placeholder="joe@joestyres.com" placeholderTextColor="#6b6561" autoCapitalize="none" keyboardType="email-address" className={inputClass} />
                </Field>
              </>
            ) : (
              <>
                <Text className="text-[18px] font-semibold text-paddock-text">Sponsor {racerName}</Text>
                <Text className="mb-4 mt-1 text-[13px] text-paddock-muted">Spot: {decal?.placement}</Text>

                {hasRace && (
                  <Option selected={picked === "race"} onPress={() => setChoice("race")} title={`${money(decal!.pricePerRaceCents!)} per race`} detail="Pay for the races you choose" />
                )}
                {hasSeason && (
                  <Option
                    selected={picked === "season"}
                    onPress={() => setChoice("season")}
                    title={`${money(decal!.pricePerSeasonCents!)} for the season`}
                    detail={decal!.seasonRaces ? `${decal!.seasonRaces} races, released to the racer race by race` : "A full season on the car"}
                  />
                )}
                <Option selected={picked === "custom"} onPress={() => setChoice("custom")} title="Propose your own price" detail="The racer can accept or decline" />

                {picked === "race" && (
                  <View className="mb-4 mt-2 flex-row items-center justify-between bg-paddock-surface px-4 py-3">
                    <Text className="text-[14px] text-paddock-text">Number of races</Text>
                    <View className="flex-row items-center">
                      <Pressable onPress={() => setRaces((n) => Math.max(1, n - 1))} hitSlop={8} accessibilityLabel="Fewer races" className="h-9 w-9 items-center justify-center border border-paddock-border active:opacity-60">
                        <Ionicons name="remove" size={18} color="#f2f0ee" />
                      </Pressable>
                      <Text className="w-10 text-center text-[16px] font-semibold text-paddock-text">{races}</Text>
                      <Pressable onPress={() => setRaces((n) => Math.min(50, n + 1))} hitSlop={8} accessibilityLabel="More races" className="h-9 w-9 items-center justify-center border border-paddock-border active:opacity-60">
                        <Ionicons name="add" size={18} color="#f2f0ee" />
                      </Pressable>
                    </View>
                  </View>
                )}

                {picked === "custom" && (
                  <View className="mt-2">
                    <Field label="Your total price (USD)">
                      <TextInput value={custom} onChangeText={setCustom} placeholder="250" placeholderTextColor="#6b6561" keyboardType="decimal-pad" className={inputClass} />
                    </Field>
                    <View className="-mt-2 mb-4 flex-row items-center justify-between bg-paddock-surface px-4 py-3">
                      <Text className="text-[14px] text-paddock-text">Number of races</Text>
                      <View className="flex-row items-center">
                        <Pressable onPress={() => setRaces((n) => Math.max(1, n - 1))} hitSlop={8} accessibilityLabel="Fewer races" className="h-9 w-9 items-center justify-center border border-paddock-border active:opacity-60">
                          <Ionicons name="remove" size={18} color="#f2f0ee" />
                        </Pressable>
                        <Text className="w-10 text-center text-[16px] font-semibold text-paddock-text">{races}</Text>
                        <Pressable onPress={() => setRaces((n) => Math.min(50, n + 1))} hitSlop={8} accessibilityLabel="More races" className="h-9 w-9 items-center justify-center border border-paddock-border active:opacity-60">
                          <Ionicons name="add" size={18} color="#f2f0ee" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}

                <Field label="Message (optional)">
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Tell them about your business and why you'd like this spot"
                    placeholderTextColor="#6b6561"
                    maxLength={500}
                    multiline
                    className={`${inputClass} min-h-[72px]`}
                    style={{ textAlignVertical: "top" }}
                  />
                </Field>

                <View className="mb-1 flex-row items-end justify-between">
                  <Text className="text-[13px] text-paddock-muted">Total</Text>
                  <Text className="text-[24px] font-semibold text-paddock-text">{totalCents !== null ? money(totalCents) : "—"}</Text>
                </View>
                <Text className="mb-4 text-[12px] leading-5 text-paddock-muted">Nothing is charged now. The racer accepts or declines first, and payment opens after that.</Text>
              </>
            )}

            {error && (
              <Text accessibilityRole="alert" className="mb-3 text-[14px] text-[#ff7a5c]">
                {error}
              </Text>
            )}

            <Pressable
              onPress={needsSetup ? setup : send}
              disabled={busy || (needsSetup ? business.trim().length < 2 : totalCents === null)}
              className="h-12 items-center justify-center bg-paddock-orange active:opacity-80"
              style={{ opacity: busy || (needsSetup ? business.trim().length < 2 : totalCents === null) ? 0.5 : 1 }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[16px] font-semibold text-paddock-text">{needsSetup ? "Continue" : "Send offer"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
