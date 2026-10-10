import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPost } from "@/lib/api/posts";
import { PostCard } from "@/components/post/PostCard";

/** A single post (opened from a profile grid or a notification). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { data: post, isPending, isError, refetch } = useQuery({
    queryKey: ["post", id],
    queryFn: () => fetchPost(id, profile!.id),
    enabled: !!id,
  });

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg">
        <ActivityIndicator color="#e8582f" />
      </View>
    );
  }

  if (isError || !post) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg px-10">
        <Text className="text-[18px] text-paddock-text">{isError ? "Couldn't load this post" : "Post not found"}</Text>
        <Text className="mt-2 text-center text-[14px] text-paddock-muted">
          {isError ? "Check your connection and try again." : "It may have been deleted, or it's followers-only."}
        </Text>
        <Pressable onPress={() => (isError ? refetch() : router.back())} className="mt-6 h-12 items-center justify-center bg-paddock-orange px-8 active:opacity-80">
          <Text className="text-[15px] font-semibold text-paddock-text">{isError ? "Retry" : "Go back"}</Text>
        </Pressable>
      </View>
    );
  }

  return <PostCard post={post} showBackButton />;
}
