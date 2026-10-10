import React from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSavedPosts } from "@/lib/api/posts";
import { compact } from "@/lib/format";
import type { FeedPost } from "@/lib/types";

function Tile({ post }: { post: FeedPost }) {
  const router = useRouter();
  const first = post.media[0];
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
      accessibilityLabel={`Open post by ${post.author.name}`}
      className="w-1/3 p-[1px] active:opacity-80"
    >
      <View className="aspect-[3/4] justify-between bg-paddock-surface p-2">
        {first?.kind === "photo" ? (
          <Image source={{ uri: first.thumbnailUrl ?? first.url }} contentFit="cover" cachePolicy="memory-disk" transition={150} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }} />
        ) : first?.kind === "video" ? (
          <View className="absolute inset-0 items-center justify-center">
            <Ionicons name="play-circle-outline" size={34} color="#6b7385" />
          </View>
        ) : (
          <Text numberOfLines={5} className="text-[12px] leading-[17px] text-paddock-peach">
            {post.content}
          </Text>
        )}
        <Text numberOfLines={1} className="text-[11px] text-paddock-text">
          @{post.author.username ?? post.author.name}
        </Text>
        <View className="flex-row items-center">
          <Ionicons name="heart-outline" size={13} color="#f2f0ee" />
          <Text className="ml-1 text-[12px] text-paddock-text">{compact(post.likes)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Posts you bookmarked, newest save first. */
export default function SavedScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const viewerId = profile!.id;

  const query = useInfiniteQuery({
    queryKey: ["saved", viewerId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchSavedPosts({ viewerId, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-paddock-bg">
      <View className="h-14 flex-row items-center px-4">
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back" className="active:opacity-60">
          <Ionicons name="arrow-back" size={26} color="#f2f0ee" />
        </Pressable>
        <Text className="ml-5 text-[18px] font-semibold text-paddock-text">Saved</Text>
      </View>

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8582f" />
        </View>
      ) : query.isError ? (
        <Pressable onPress={() => query.refetch()} className="flex-1 items-center justify-center active:opacity-70">
          <Text className="text-[15px] text-paddock-muted">Couldn't load saved posts. Tap to retry.</Text>
        </Pressable>
      ) : posts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="bookmark-outline" size={40} color="#9a928d" />
          <Text className="mt-4 text-[18px] text-paddock-text">Nothing saved yet</Text>
          <Text className="mt-2 text-center text-[14px] text-paddock-muted">Tap the bookmark on a post to keep it here.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          onEndReachedThreshold={0.6}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          renderItem={({ item }) => <Tile post={item} />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color="#e8582f" className="py-5" /> : null}
        />
      )}
    </SafeAreaView>
  );
}
