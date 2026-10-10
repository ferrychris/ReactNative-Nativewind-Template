import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type SelectOption = { id: string; label: string; sub?: string | null };

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  options: SelectOption[];
  loading?: boolean;
  /** Called (debounced) as the user types; omit to filter `options` locally instead. */
  onQuery?: (text: string) => void;
  onSelect: (option: SelectOption) => void;
  onClose: () => void;
  /** Shows an "Add “text”" row when nothing matches exactly, so a missing item can be created. */
  onCreate?: (text: string) => void;
  createLabel?: string;
};

/** Bottom-sheet dropdown with quick search: used for championships and vehicle types. */
export function SearchSelect({ visible, title, placeholder = "Search", options, loading, onQuery, onSelect, onClose, onCreate, createLabel = "Add" }: Props) {
  const [text, setText] = useState("");

  const close = () => {
    setText("");
    onClose();
  };
  const pick = (o: SelectOption) => {
    setText("");
    onSelect(o);
  };

  // server-side search is debounced so every keystroke isn't a request
  useEffect(() => {
    if (!visible || !onQuery) return;
    const t = setTimeout(() => onQuery(text), 250);
    return () => clearTimeout(t);
  }, [text, visible, onQuery]);

  const q = text.trim().toLowerCase();
  const shown = onQuery || !q ? options : options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q));
  const exact = shown.some((o) => o.label.toLowerCase() === q);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close" />
        <View className="max-h-[75%] rounded-t-3xl bg-paddock-bg px-5 pb-6 pt-4">
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-paddock-border" />
          </View>
          <Text className="mb-3 text-[18px] font-semibold text-paddock-text">{title}</Text>

          <View className="mb-2 flex-row items-center bg-paddock-surface px-3">
            <Ionicons name="search" size={16} color="#9a928d" />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor="#6b6561"
              autoFocus
              autoCorrect={false}
              className="ml-2 flex-1 py-3 text-[16px] text-paddock-text"
            />
            {loading && <ActivityIndicator color="#e8582f" />}
          </View>

          <FlatList
            data={shown}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              onCreate && q && !exact ? (
                <Pressable onPress={() => onCreate(text.trim())} className="flex-row items-center border-b border-paddock-surface py-3.5 active:opacity-70">
                  <Ionicons name="add-circle-outline" size={18} color="#e8582f" />
                  <Text numberOfLines={1} className="ml-2 flex-1 text-[15px] font-semibold text-paddock-orange">
                    {createLabel} “{text.trim()}”
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={loading ? null : <Text className="py-8 text-center text-[14px] text-paddock-muted">No matches</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => pick(item)} className="border-b border-paddock-surface py-3.5 active:opacity-70">
                <Text className="text-[15px] text-paddock-text">{item.label}</Text>
                {item.sub ? <Text className="mt-0.5 text-[12px] text-paddock-muted">{item.sub}</Text> : null}
              </Pressable>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
