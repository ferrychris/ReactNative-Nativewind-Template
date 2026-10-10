import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { addRaceResult } from "@/lib/api/results";

const EMPTY = { title: "", venue: "", classLabel: "", raceDate: "", position: "", points: "" };

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <View className={`mb-3 ${className}`}>
      <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">{label}</Text>
      <View className="bg-paddock-surface px-4">{children}</View>
    </View>
  );
}

const input = "py-3 text-[16px] text-paddock-text";
const ph = "#6b6561";

/** Bottom sheet where a racer adds a race result to their profile. */
export function ResultSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addRaceResult(profile.id, form);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm(EMPTY);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the result.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
        <View className="max-h-[88%] rounded-t-3xl bg-paddock-bg px-5 pb-8 pt-4">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <Text className="mb-1 text-[18px] font-semibold text-paddock-text">Add a race result</Text>
          <Text className="mb-4 text-[13px] text-paddock-muted">It shows as Verified once a track links it to its event.</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Field label="Race">
              <TextInput value={form.title} onChangeText={set("title")} placeholder="Monza 4H Endurance" placeholderTextColor={ph} maxLength={80} className={input} />
            </Field>
            <Field label="Circuit (optional)">
              <TextInput value={form.venue} onChangeText={set("venue")} placeholder="Autodromo Nazionale Monza" placeholderTextColor={ph} maxLength={80} className={input} />
            </Field>
            <View className="flex-row gap-3">
              <Field label="Date" className="flex-1">
                <TextInput value={form.raceDate} onChangeText={set("raceDate")} placeholder="2025-10-14" placeholderTextColor={ph} maxLength={10} keyboardType="numbers-and-punctuation" className={input} />
              </Field>
              <Field label="Class (optional)" className="flex-1">
                <TextInput value={form.classLabel} onChangeText={set("classLabel")} placeholder="Pro-Am Cup" placeholderTextColor={ph} maxLength={40} className={input} />
              </Field>
            </View>
            <View className="flex-row gap-3">
              <Field label="Finish" className="flex-1">
                <TextInput value={form.position} onChangeText={set("position")} placeholder="1" placeholderTextColor={ph} maxLength={3} keyboardType="number-pad" className={input} />
              </Field>
              <Field label="Points (optional)" className="flex-1">
                <TextInput value={form.points} onChangeText={set("points")} placeholder="25" placeholderTextColor={ph} maxLength={4} keyboardType="number-pad" className={input} />
              </Field>
            </View>
            {error && (
              <Text accessibilityRole="alert" className="mb-3 text-[14px] text-[#ff7a5c]">
                {error}
              </Text>
            )}
            <Pressable onPress={save} disabled={busy} className="h-12 items-center justify-center bg-paddock-orange active:opacity-80">
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[16px] font-semibold text-paddock-text">Save result</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
