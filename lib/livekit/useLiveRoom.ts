import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ConnectionState,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type VideoTrack,
} from "livekit-client";
import { ROOM_OPTIONS } from "./config";
import { prepareNative, releaseNative } from "./platform";
import { fetchLiveToken } from "./token";

export type LiveStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

const isHostParticipant = (p: { metadata?: string }) => {
  try {
    return JSON.parse(p.metadata || "{}").role === "host";
  } catch {
    return false;
  }
};

export function describeError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "DEV_BUILD_REQUIRED") return "DEV_BUILD_REQUIRED";
  if (m === "INSECURE_ADDRESS") return "Browsers only allow the camera and microphone on https or localhost. Open the app at http://localhost:8081 on this computer, or use an https address.";
  if (/permission|NotAllowed|denied/i.test(m)) {
    return Platform.OS === "web"
      ? "Camera or microphone access is blocked. Click the camera or lock icon in the address bar, allow both, and try again."
      : "Camera or microphone access was denied. Allow it in your device settings and try again.";
  }
  if (/NotFound|Requested device not found/i.test(m)) return "No camera or microphone was found on this device.";
  return m || "Couldn't connect to the live video service.";
}

type Options = {
  streamId: string;
  role: "host" | "viewer";
  /** Set false to stay disconnected (sample/demo mode). */
  enabled?: boolean;
  /** Host: which camera to start on (the one picked in the preview). */
  initialFacing?: "user" | "environment";
};

/**
 * One LiveKit connection for a stream.
 *  host   -> publishes camera + microphone; `videoTrack` is your own camera (preview)
 *  viewer -> subscribes; `videoTrack` is the host's camera
 * Cleans up (stops camera, leaves the room, releases audio) when the screen goes away.
 */
export function useLiveRoom({ streamId, role, enabled = true, initialFacing = "user" }: Options) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [videoTrack, setVideoTrack] = useState<VideoTrack | null>(null);
  const [viewers, setViewers] = useState(0);
  const [micOn, setMicOnState] = useState(true);
  const [camOn, setCamOnState] = useState(true);
  /** Viewer side: the host has switched their camera off. */
  const [hostCameraOff, setHostCameraOff] = useState(false);
  /** Viewer side: the host has muted their microphone (with the camera off, that is a paused stream). */
  const [hostMicOff, setHostMicOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [hostLeft, setHostLeft] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const attached: HTMLMediaElement[] = [];

    const countViewers = (room: Room) => {
      let n = 0;
      room.remoteParticipants.forEach((p) => {
        if (!isHostParticipant(p)) n += 1;
      });
      // a viewer's own connection counts as one viewer too
      setViewers(role === "viewer" ? n + 1 : n);
    };

    (async () => {
      try {
        setStatus("connecting");
        setError(null);
        setHostLeft(false);

        if (role === "host" && Platform.OS === "web" && typeof window !== "undefined" && !window.isSecureContext) throw new Error("INSECURE_ADDRESS");
        await prepareNative();
        const granted = await fetchLiveToken(streamId);
        if (cancelled) return;

        const room = new Room(ROOM_OPTIONS);
        roomRef.current = room;

        const showRemoteVideo = (participant: RemoteParticipant) => {
          if (!isHostParticipant(participant)) return;
          const pub = participant.getTrackPublication(Track.Source.Camera);
          if (pub?.videoTrack) setVideoTrack(pub.videoTrack);
          if (pub) setHostCameraOff(pub.isMuted);
          const micPub = participant.getTrackPublication(Track.Source.Microphone);
          if (micPub) setHostMicOff(micPub.isMuted);
        };

        room
          .on(RoomEvent.ParticipantConnected, () => countViewers(room))
          .on(RoomEvent.ParticipantDisconnected, (p) => {
            countViewers(room);
            if (isHostParticipant(p)) setHostLeft(true);
          })
          .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
            if (track.kind === Track.Kind.Video && isHostParticipant(participant)) {
              setVideoTrack(track as VideoTrack);
              setHostCameraOff(track.isMuted);
            }
            // In a browser, remote audio has to be attached to an element to be heard
            if (track.kind === Track.Kind.Audio && Platform.OS === "web") attached.push(track.attach());
          })
          .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
            if (track.kind === Track.Kind.Video && isHostParticipant(participant)) setVideoTrack(null);
            track.detach();
          })
          .on(RoomEvent.TrackMuted, (pub, participant) => {
            if (pub.source === Track.Source.Camera && isHostParticipant(participant)) setHostCameraOff(true);
            if (pub.source === Track.Source.Microphone && isHostParticipant(participant)) setHostMicOff(true);
          })
          .on(RoomEvent.TrackUnmuted, (pub, participant) => {
            if (pub.source === Track.Source.Camera && isHostParticipant(participant)) setHostCameraOff(false);
            if (pub.source === Track.Source.Microphone && isHostParticipant(participant)) setHostMicOff(false);
          })
          .on(RoomEvent.LocalTrackPublished, (pub) => {
            if (pub.source === Track.Source.Camera && pub.videoTrack) setVideoTrack(pub.videoTrack);
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) setStatus("reconnecting");
            else if (state === ConnectionState.Connected) setStatus("connected");
          })
          .on(RoomEvent.Disconnected, () => {
            if (!cancelled) setStatus("disconnected");
          });

        await room.connect(granted.url, granted.token);
        if (cancelled) {
          room.disconnect();
          return;
        }

        if (granted.role === "host") {
          await room.localParticipant.setMicrophoneEnabled(true);
          await room.localParticipant.setCameraEnabled(true, { facingMode: initialFacing });
          const own = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
          if (own) setVideoTrack(own);
        } else {
          room.remoteParticipants.forEach(showRemoteVideo);
        }
        setAudioBlocked(!room.canPlaybackAudio);
        countViewers(room);
        setStatus("connected");
      } catch (e) {
        if (cancelled) return;
        setError(describeError(e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      const room = roomRef.current;
      roomRef.current = null;
      attached.forEach((el) => el.remove());
      room?.disconnect();
      releaseNative();
    };
  }, [streamId, role, enabled, attempt, initialFacing]);

  const setMic = useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    setMicOnState(on);
    try {
      await room.localParticipant.setMicrophoneEnabled(on);
    } catch {
      setMicOnState(!on);
    }
  }, []);

  /** Host: switch the camera off (viewers see a "Camera off" cover, audio keeps going) or back on. */
  const setCamera = useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    setCamOnState(on);
    try {
      await room.localParticipant.setCameraEnabled(on, on ? { facingMode: facing } : undefined);
      if (on) {
        const own = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (own) setVideoTrack(own);
      }
    } catch {
      setCamOnState(!on);
    }
  }, [facing]);

  const flipCamera = useCallback(async () => {
    const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (!(track instanceof LocalVideoTrack)) return;
    const next = facing === "user" ? "environment" : "user";
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      // this device has only one camera
    }
  }, [facing]);

  /** Browsers block sound until a tap: call this from a button press. */
  const startAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
      setAudioBlocked(false);
    } catch {
      // still blocked
    }
  }, []);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, error, videoTrack, viewers, micOn, setMic, camOn, setCamera, hostCameraOff, hostMicOff, facing, flipCamera, hostLeft, audioBlocked, startAudio, disconnect, retry };
}
