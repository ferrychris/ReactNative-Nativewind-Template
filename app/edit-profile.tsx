import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { EditProfile } from "@/components/profile/EditProfile";
import { fetchProfileView } from "@/lib/api/profiles";

export default function EditProfileScreen() {
  const { profile } = useAuth();
  const id = profile!.id;
  // same cache entry as the profile tab, so this usually opens instantly
  const { data } = useQuery({ queryKey: ["profile", id], queryFn: () => fetchProfileView({ id }, id) });

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-paddock-bg">
        <ActivityIndicator color="#e8582f" />
      </View>
    );
  }
  return <EditProfile view={data} />;
}
