import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View, ViewToken } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPosts } from "@/lib/api/posts";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PostCard } from "./PostCard";

type Props = { scope: "forYou" | "following" };

/** Full-screen vertical feed, one post per screen. */
export function Feed({ scope }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const viewerId = profile!.id;
  const [height, setHeight] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["feed", scope, viewerId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPosts({ viewerId, followingOnly: scope === "following", cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const posts = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  // Warm the image cache for the next few posts so they are already there when you swipe.
  useEffect(() => {
    const current = Math.max(0, posts.findIndex((p) => p.id === activeId));
    const urls = posts
      .slice(current + 1, current + 4)
      .flatMap((p) => p.media.filter((m) => m.kind === "photo" && m.url).map((m) => m.url));
    if (urls.length > 0) Image.prefetch(urls, "memory-disk").catch(() => {});
  }, [posts, activeId]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.item) setActiveId((first.item as { id: string }).id);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const renderEmpty = useCallback(() => {
    if (query.isError) {
      return (
        <Centered icon="cloud-offline-outline" title="Couldn't load posts" body="Check your connection and try again.">
          <Action label="Retry" onPress={() => query.refetch()} />
        </Centered>
      );
    }
    if (scope === "following") {
      return <Centered icon="people-outline" title="Nothing here yet" body="Follow drivers, fans and tracks to see their posts here." />;
    }
    return (
      <Centered icon="flag-outline" title="No posts yet" body="Be the first to post from the paddock.">
        <Action label="Create a post" onPress={() => router.push("/post/create")} />
      </Centered>
    );
  }, [query, scope, router]);

  return (
    <View className="flex-1 bg-[#090a0d]" onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && query.isPending && <LoadingScreen />}

      {height > 0 && !query.isPending && posts.length === 0 && <View style={{ height }}>{renderEmpty()}</View>}

      {height > 0 && posts.length > 0 && (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewabilityConfig}
          onEndReachedThreshold={1.5}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          renderItem={({ item, index }) => (
            <View style={{ height }}>
              <PostCard post={item} insideTabs active={item.id === activeId || (activeId === null && index === 0)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function Centered({ icon, title, body, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; children?: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Ionicons name={icon} size={44} color="#6b7385" />
      <Text className="mt-4 text-[20px] text-paddock-text">{title}</Text>
      <Text className="mt-2 text-center text-[15px] text-paddock-muted">{body}</Text>
      {children}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mt-6 h-12 items-center justify-center bg-paddock-orange px-8 active:opacity-80">
      <Text className="text-[15px] font-semibold text-paddock-text">{label}</Text>
    </Pressable>
  );
}
