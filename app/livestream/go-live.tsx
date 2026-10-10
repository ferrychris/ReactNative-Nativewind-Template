import React from "react";
import { StatusBar } from "expo-status-bar";
import { GoLive } from "@/components/livestream/GoLive";

export default function GoLiveScreen() {
  return (
    <>
      <StatusBar style="light" />
      <GoLive />
    </>
  );
}
