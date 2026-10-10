import React from "react";
import { useLocalSearchParams } from "expo-router";
import { CommentsSheet } from "@/components/post/CommentsSheet";

export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CommentsSheet postId={id} />;
}
