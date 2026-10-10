import React, { useCallback, useEffect, useRef, useState } from "react";
import { PermissionPanel } from "./PermissionPanel";

export type Facing = "user" | "environment";
type Props = { facing: Facing; onGrantedChange?: (granted: boolean) => void };

type Status = "idle" | "asking" | "ready" | "denied" | "insecure" | "unsupported" | "no-camera" | "busy" | "error";

const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

/** Maps the browser's error names to something a person can act on. */
function classify(e: unknown): { status: Status; detail: string } {
  const name = (e as { name?: string })?.name ?? "";
  const message = (e as { message?: string })?.message ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return { status: "denied", detail: "" };
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return { status: "no-camera", detail: "" };
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return { status: "busy", detail: "" };
  if (name === "SecurityError") return { status: "insecure", detail: "" };
  return { status: "error", detail: message };
}

/**
 * Browser version of the camera preview. It asks the browser for camera + microphone in ONE prompt,
 * shows the picture, and explains every failure (blocked, no camera, camera busy, insecure address).
 * The tracks are released when you leave so the live room can take the camera.
 */
export function CameraPreview({ facing, onGrantedChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState("");

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    // Browsers only hand out the camera on https:// or http://localhost
    if (!window.isSecureContext) return setStatus("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("unsupported");

    setStatus("asking");
    stopStream(streamRef.current);
    streamRef.current = null;

    const video: MediaTrackConstraints = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } };
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch (e) {
        // no microphone? still show the camera (the live room will report the microphone itself)
        if ((e as { name?: string }).name === "NotFoundError") stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        else throw e;
      }
      stream.getAudioTracks().forEach((t) => t.stop()); // permission stays granted; don't hold the microphone for a preview
      streamRef.current = stream;
      setStatus("ready");
    } catch (e) {
      const c = classify(e);
      setDetail(c.detail);
      setStatus(c.status);
    }
  }, [facing]);

  // Already allowed on a previous visit? Start straight away. Already blocked? Say so.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (!active) return;
        if (result.state === "granted") start();
        else if (result.state === "denied") setStatus("denied");
      } catch {
        // Firefox / Safari can't be asked ahead of time: wait for the Allow button
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flipping the camera restarts the picture
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (status === "ready") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // Show the stream
  useEffect(() => {
    const el = videoRef.current;
    if (status === "ready" && el && streamRef.current) {
      el.srcObject = new MediaStream(streamRef.current.getVideoTracks());
      el.play().catch(() => {});
    }
  }, [status]);

  useEffect(() => {
    onGrantedChange?.(status === "ready");
  }, [status, onGrantedChange]);

  // Release the camera when leaving this screen
  useEffect(
    () => () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  if (status === "ready") {
    return React.createElement("video", {
      ref: videoRef,
      autoPlay: true,
      playsInline: true,
      muted: true,
      style: { width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#000", transform: facing === "user" ? "scaleX(-1)" : undefined },
    });
  }

  const retry = start;
  const reload = () => window.location.reload();
  const host = typeof window !== "undefined" ? window.location.host : "";
  const port = typeof window !== "undefined" ? window.location.port : "8081";

  switch (status) {
    case "asking":
      return <PermissionPanel title="Waiting for your browser…" body="Choose Allow in the permission box near the address bar so people can see and hear you." />;
    case "denied":
      return (
        <PermissionPanel
          icon="lock-closed-outline"
          title="Camera access is blocked"
          body="Click the camera or lock icon in the address bar, set Camera and Microphone to Allow, then try again."
          actionLabel="Try again"
          onAction={retry}
          secondaryLabel="Reload the page"
          onSecondary={reload}
        />
      );
    case "insecure":
      return (
        <PermissionPanel
          icon="shield-outline"
          title="This address can't use the camera"
          body={`Browsers only allow the camera on https or localhost, and you are on ${host}. Open http://localhost:${port || "8081"} on this computer instead.`}
        />
      );
    case "unsupported":
      return <PermissionPanel icon="alert-circle-outline" title="This browser can't use a camera" body="Try the latest Chrome, Edge, Safari or Firefox." />;
    case "no-camera":
      return <PermissionPanel icon="videocam-off-outline" title="No camera found" body="Connect a camera, make sure it isn't disabled, and try again." actionLabel="Try again" onAction={retry} />;
    case "busy":
      return (
        <PermissionPanel
          icon="videocam-off-outline"
          title="Your camera is in use"
          body="Another app or browser tab is using the camera (a video call, for example). Close it and try again."
          actionLabel="Try again"
          onAction={retry}
        />
      );
    case "error":
      return <PermissionPanel icon="alert-circle-outline" title="Couldn't start the camera" body={detail || "Something went wrong."} actionLabel="Try again" onAction={retry} />;
    default:
      return (
        <PermissionPanel
          title="Allow camera and microphone"
          body="Your browser will ask for permission. Choose Allow so people can see and hear you when you go live."
          actionLabel="Allow"
          onAction={retry}
        />
      );
  }
}
