import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { findPeople, type PeopleScope, type Person } from "@/lib/api/people";
import { fetchLiveNow } from "@/lib/api/live";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { startChat, messageError } from "@/lib/api/messages";
import { setFollow } from "@/lib/api/posts";
import { PersonRow } from "@/components/people/PersonRow";

const TABS: { scope: Exclude<PeopleScope, "everyone">; label: string; empty: { title: string; body: string } }[] = [
  { scope: "friends", label: "Friends", empty: { title: "No friends yet", body: "Friends are people you follow who follow you back." } },
  { scope: "following", label: "Following", empty: { title: "You're not following anyone", body: "Find racers and race fans in Discover." } },
  { scope: "followers", label: "Followers", empty: { title: "No followers yet", body: "Post something and share your profile." } },
  { scope: "suggested", label: "Discover", empty: { title: "No suggestions right now", body: "Try searching by name, username or car number." } },
];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Find people, see who follows you, and message friends. (Posts from people you follow are on Home > Following.) */
export default function FriendsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile!.id;

  const [scope, setScope] = useState<Exclude<PeopleScope, "everyone">>("friends");
  const [text, setText] = useState("");
  const query = useDebounced(text.trim());
  const searching = query.length > 0;

  const people = useQuery({
    queryKey: ["people", searching ? "everyone" : scope, query],
    queryFn: () => findPeople({ scope: searching ? "everyone" : scope, query }),
    placeholderData: (prev) => prev,
  });

  const [messagingId, setMessagingId] = useState<string | null>(null);
  const liveNow = useQuery({ queryKey: ["liveNow"], queryFn: fetchLiveNow, refetchInterval: 30_000 });

  const patch = (id: string, fn: (p: Person) => Person) =>
    qc.setQueriesData<Person[]>({ queryKey: ["people"] }, (old) => old?.map((p) => (p.id === id ? fn(p) : p)));

  const toggleFollow = async (p: Person) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const next = !p.iFollow;
    patch(p.id, (x) => ({ ...x, iFollow: next, followers: Math.max(0, x.followers + (next ? 1 : -1)) }));
    try {
      await setFollow(p.id, me, next);
      qc.invalidateQueries({ queryKey: ["feed", "following"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      patch(p.id, (x) => ({ ...x, iFollow: p.iFollow, followers: p.followers }));
      Alert.alert("Couldn't update follow", "Check your connection and try again.");
    }
  };

  const message = async (p: Person) => {
    if (messagingId) return;
    setMessagingId(p.id);
    try {
      const id = await startChat(p.id);
      router.push({ pathname: "/chat/[id]", params: { id } });
    } catch (e) {
      Alert.alert("Couldn't start chat", messageError(e));
    } finally {
      setMessagingId(null);
    }
  };

  const open = (p: Person) => router.push({ pathname: "/user/[username]", params: { username: p.username } });
  const emptyCopy = TABS.find((t) => t.scope === scope)!.empty;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="px-4 pb-2 pt-3">
        <Text className="text-[26px] font-semibold text-paddock-text">Friends</Text>
        {(liveNow.data?.length ?? 0) > 0 && (
          <View className="mt-3">
            <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[2px] text-paddock-muted">Live now</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-4">
              {liveNow.data!.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: "/livestream/watch/[id]", params: { id: s.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch ${s.hostName} live`}
                  className="w-[74px] items-center active:opacity-70"
                >
                  <View className="rounded-full border-2 border-paddock-orange p-[3px]">
                    <UserAvatar name={s.hostName} url={s.hostAvatarUrl} size={58} />
                  </View>
                  <View className="-mt-2 bg-paddock-orange px-1.5 py-[1px]">
                    <Text className="text-[10px] font-bold uppercase tracking-[1px] text-paddock-text">Live</Text>
                  </View>
                  <Text numberOfLines={1} className="mt-1 text-[12px] text-paddock-text">
                    {s.hostName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View className="mt-3 h-12 flex-row items-center bg-paddock-surface px-4">
          <Ionicons name="search" size={18} color="#9a928d" />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Search name, @username or car number"
            placeholderTextColor="#6b6561"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor="#e8582f"
            className="ml-3 flex-1 text-[15px] text-paddock-text"
          />
          {text.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setText("")} accessibilityLabel="Clear search" className="active:opacity-60">
              <Ionicons name="close-circle" size={18} color="#9a928d" />
            </Pressable>
          )}
        </View>

        {!searching && (
          <View className="mt-3 flex-row gap-2">
            {TABS.map((t) => (
              <Pressable
                key={t.scope}
                onPress={() => {
                  Haptics.selectionAsync();
                  setScope(t.scope);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: scope === t.scope }}
                className={`px-3.5 py-2 ${scope === t.scope ? "bg-paddock-orange" : "border border-paddock-border bg-paddock-surface"}`}
              >
                <Text className={`text-[13px] font-semibold ${scope === t.scope ? "text-paddock-text" : "text-paddock-muted"}`}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {people.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8582f" />
        </View>
      ) : people.isError ? (
        <Pressable onPress={() => people.refetch()} className="flex-1 items-center justify-center px-10 active:opacity-70">
          <Text className="text-center text-[15px] text-paddock-muted">Couldn't load people. Tap to retry.</Text>
        </Pressable>
      ) : (
        <FlatList
          data={people.data}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          refreshing={people.isRefetching}
          onRefresh={() => people.refetch()}
          renderItem={({ item }) => (
            <PersonRow person={item} onOpen={() => open(item)} onToggleFollow={() => toggleFollow(item)} onMessage={() => message(item)} messaging={messagingId === item.id} />
          )}
          ListEmptyComponent={
            <View className="items-center px-10 pt-16">
              <Ionicons name={searching ? "search-outline" : "people-outline"} size={40} color="#9a928d" />
              <Text className="mt-4 text-[18px] text-paddock-text">{searching ? "No one found" : emptyCopy.title}</Text>
              <Text className="mt-2 text-center text-[14px] text-paddock-muted">{searching ? `Nothing matches "${query}".` : emptyCopy.body}</Text>
              {!searching && scope !== "suggested" && (
                <Pressable onPress={() => setScope("suggested")} className="mt-6 h-11 items-center justify-center bg-paddock-orange px-6 active:opacity-80">
                  <Text className="text-[14px] font-semibold text-paddock-text">Discover people</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
