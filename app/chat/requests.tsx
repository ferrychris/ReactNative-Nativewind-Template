import React, { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ConversationRow } from "@/components/inbox/ConversationRow";
import { fetchInbox } from "@/lib/api/messages";

/** Messages from people you don't follow. Nothing is shared with them until you accept or reply. */
export default function MessageRequests() {
  const router = useRouter();
  const { profile } = useAuth();
  const inbox = useQuery({ queryKey: ["inbox", profile!.id], queryFn: fetchInbox });
  const requests = useMemo(() => (inbox.data ?? []).filter((c) => c.isRequest), [inbox.data]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="h-14 flex-row items-center px-4">
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back" className="active:opacity-60">
          <Ionicons name="arrow-back" size={26} color="#f2f0ee" />
        </Pressable>
        <Text className="ml-5 text-[18px] font-semibold text-paddock-text">Message requests</Text>
      </View>

      {inbox.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8582f" />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(c) => c.id}
          refreshing={inbox.isRefetching}
          onRefresh={() => inbox.refetch()}
          renderItem={({ item }) => <ConversationRow chat={item} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })} />}
          ListEmptyComponent={
            <View className="items-center px-10 pt-16">
              <Ionicons name="mail-outline" size={40} color="#9a928d" />
              <Text className="mt-4 text-[18px] text-paddock-text">No requests</Text>
              <Text className="mt-2 text-center text-[14px] text-paddock-muted">When someone you don't follow messages you, it shows up here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
