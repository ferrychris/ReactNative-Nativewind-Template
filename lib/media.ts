import { decode } from "base64-arraybuffer";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

// Sizes are trimmed a little (about 20% fewer pixels, so smaller files); JPEG quality is left alone.
export const FULL_IMAGE_WIDTH = 1440; // still sharp on a phone screen, ~10x smaller than a camera original
export const THUMB_IMAGE_WIDTH = 420; // profile grids and saved list
export const AVATAR_IMAGE_WIDTH = 448; // profile photos are shown at under 100pt

export type PreparedImage = { bytes: ArrayBuffer; width: number; height: number };

/** What the picker gave us. On the web `file` is the browser File, the most reliable source of bytes. */
export type MediaSource = { uri: string; file?: Blob | null };

/** True if the bytes start with the JPEG signature (FF D8 FF). */
const isJpeg = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
  return b.length === 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
};

const assertValidJpeg = (bytes: ArrayBuffer) => {
  if (bytes.byteLength < 100 || !isJpeg(bytes)) {
    throw new Error(`The photo couldn't be converted to a valid image (${bytes.byteLength} bytes). Try a different one.`);
  }
};

/** Web: read the picked File and resize it with the browser's own canvas. */
async function prepareImageWeb(source: MediaSource, width: number, compress: number): Promise<PreparedImage> {
  const blob = source.file ?? (await (await fetch(source.uri)).blob());
  if (blob.size < 100) throw new Error(`The selected file is only ${blob.size} bytes. Try picking the photo again.`);

  const bitmap = await createImageBitmap(blob); // applies the photo's EXIF rotation
  const scale = Math.min(1, width / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process the photo.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", compress));
  if (!out) throw new Error("Your browser couldn't convert the photo.");
  const bytes = await out.arrayBuffer();
  assertValidJpeg(bytes);
  return { bytes, width: w, height: h };
}

/** Phones: resize with the native image manipulator and read the result through base64. */
async function prepareImageNative(source: MediaSource, width: number, sourceWidth: number | undefined, compress: number): Promise<PreparedImage> {
  const ctx = ImageManipulator.manipulate(source.uri);
  if (!sourceWidth || sourceWidth > width) ctx.resize({ width });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!saved.base64) throw new Error("Couldn't convert the photo. Try a different one.");
  const bytes = decode(saved.base64.replace(/^data:[^,]*,/, ""));
  assertValidJpeg(bytes);
  return { bytes, width: saved.width, height: saved.height };
}

/**
 * Downscales (never upscales) to `width`, re-encodes as JPEG and returns the raw bytes.
 * Throws if the result is not a real JPEG, so a broken file is never uploaded.
 */
export function prepareImage(source: MediaSource, width: number, sourceWidth?: number, compress = 0.8): Promise<PreparedImage> {
  return Platform.OS === "web" ? prepareImageWeb(source, width, compress) : prepareImageNative(source, width, sourceWidth, compress);
}

/** Bytes of any picked file (used for videos). Prefers the browser File on the web. */
export async function readBytes(source: MediaSource): Promise<ArrayBuffer> {
  const blob = source.file ?? (await (await fetch(source.uri)).blob());
  return blob.arrayBuffer();
}

/**
 * Asks the server what it answers for an image link that failed to load, so the screen can say why
 * (e.g. "HTTP 400 ... Object not found" vs "HTTP 200 ... text/html"). Only used for error messages.
 */
export async function diagnoseImage(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "no content-type";
    const length = res.headers.get("content-length");
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, " ").slice(0, 220);
      return `HTTP ${res.status} (${type}) ${body}`;
    }
    return `HTTP ${res.status}, ${type}, ${length ?? "unknown"} bytes`;
  } catch (e) {
    return `network error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * After an upload, ask the server for the stored file's headers and compare them with what we sent.
 * Throws if the stored file has the wrong type or size (i.e. it was saved badly).
 * Network/CORS hiccups only warn, so a flaky connection never blocks a good post.
 */
export async function assertStoredCorrectly(url: string, expectedType: string, expectedBytes: number) {
  let res: Response;
  try {
    res = await fetch(url, { method: "HEAD" });
  } catch (e) {
    console.warn("[post-media] could not verify the upload:", e instanceof Error ? e.message : e);
    return;
  }
  if (!res.ok) throw new Error(`The saved file can't be read back (HTTP ${res.status}).`);
  const type = res.headers.get("content-type") ?? "";
  const length = Number(res.headers.get("content-length"));
  if (!type.startsWith(expectedType.split("/")[0])) {
    throw new Error(`The file was saved with the wrong type (${type || "none"}, expected ${expectedType}).`);
  }
  if (Number.isFinite(length) && length > 0 && length !== expectedBytes) {
    throw new Error(`The file was saved incompletely (${length} of ${expectedBytes} bytes).`);
  }
}

/** Largest video we accept (the post-media bucket itself refuses anything over 200 MB). */
export const MAX_VIDEO_BYTES = 190 * 1024 * 1024;

/** Size of a local file in bytes without reading it. null when unknown (web, or the OS won't say). */
export async function localFileSize(uri: string): Promise<number | null> {
  if (Platform.OS === "web") return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Sends a local file to a signed upload URL straight from disk, in the native layer. The file never
 * passes through JavaScript memory (reading a 120 MB video with fetch().arrayBuffer() crashed the app
 * with an out-of-memory error).
 */
export async function uploadFromDisk(signedUrl: string, uri: string, contentType: string): Promise<void> {
  const res = await FileSystem.uploadAsync(signedUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (HTTP ${res.status}). ${res.body?.slice(0, 160) ?? ""}`.trim());
  }
}
