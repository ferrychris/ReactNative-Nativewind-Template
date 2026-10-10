import React, { useEffect } from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { PermissionPanel } from "./PermissionPanel";

export type Facing = "user" | "environment";
type Props = { facing: Facing; onGrantedChange?: (granted: boolean) => void };

/** Phones: the live camera picture, or a panel asking for camera and microphone access. (Browser version: CameraPreview.web.tsx.) */
export function CameraPreview({ facing, onGrantedChange }: Props) {
  const [camPerm, requestCam] = useCameraPermissions();
  const [, requestMic] = useMicrophonePermissions();
  const granted = !!camPerm?.granted;

  useEffect(() => {
    onGrantedChange?.(granted);
  }, [granted, onGrantedChange]);

  if (granted) return <CameraView style={{ flex: 1 }} facing={facing === "user" ? "front" : "back"} mirror={facing === "user"} />;

  const blocked = !!camPerm && !camPerm.canAskAgain;
  return (
    <PermissionPanel
      title="Allow camera access"
      body={blocked ? "Camera access is turned off. Enable it for this app in your device settings." : "You need the camera and microphone to go live."}
      actionLabel={blocked ? undefined : "Allow"}
      onAction={async () => {
        await requestCam();
        await requestMic();
      }}
    />
  );
}
