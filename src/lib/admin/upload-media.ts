/**
 * Admin uploads (blog covers and videos, offer pictures and clips, trip photos, media library).
 *
 * 1. Big photos are resized in the browser (longest side 2400 px) and saved as high-quality WebP,
 *    so a 6 MB phone photo becomes a few hundred KB: sharp on every screen and fast to load.
 * 2. The server checks the person may upload and returns a one-time signed link.
 * 3. The file goes straight to Supabase Storage (no 4.5 MB server limit on Vercel).
 */

const MAX_SIDE = 2400;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export interface UploadedMedia {
  url: string;
  path: string;
  /** Type of the file that was actually uploaded (after resizing). */
  type: string;
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** Resize / re-encode a photo when it is big; small web-ready photos are kept exactly as they are. */
export async function preparePhoto(file: File): Promise<File> {
  const heic = isHeic(file);
  if (!heic && !PHOTO_TYPES.includes(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (heic) {
      throw new Error(
        "This is an iPhone HEIC photo that this browser can't open. On the iPhone choose Settings → Camera → Formats → Most Compatible, or share the photo as JPG."
      );
    }
    throw new Error(`Couldn't read "${file.name}" as a picture.`);
  }
  const side = Math.max(bitmap.width, bitmap.height);
  if (!heic && side <= MAX_SIDE && file.size <= KEEP_AS_IS_BYTES) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / side);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // WebP keeps transparency (cut-out pictures) and is ~30% smaller than JPEG at the same quality.
  let blob = await canvasToBlob(canvas, "image/webp", 0.86);
  let type = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    // Very old Safari can't write WebP: JPEG for photos, keep PNGs (they may be see-through).
    if (file.type === "image/png") return file;
    blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    type = "image/jpeg";
  }
  if (!blob) return file;
  if (!heic && blob.size >= file.size) return file; // never make a file bigger
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
}

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.error || json.message || fallback;
  } catch {
    if (res.status === 413) return "The file is too large to upload.";
    return text && text.length < 200 ? text : fallback;
  }
}

function putWithProgress(url: string, body: FormData, onProgress?: (pct: number) => void): Promise<Response> {
  if (!onProgress || typeof XMLHttpRequest === "undefined") {
    return fetch(url, { method: "PUT", body, headers: { "x-upsert": "false" } });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      onProgress(100);
      resolve(new Response(xhr.responseText, { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload. Check the internet and try again."));
    xhr.ontimeout = () => reject(new Error("The upload took too long. Try again on a stronger connection."));
    xhr.send(body);
  });
}

/**
 * Upload one photo or video for the admin; returns its public address. Throws a readable error.
 * `onProgress` gets 0-100 while the file is sent (handy for videos).
 */
export async function uploadMedia(original: File, onProgress?: (pct: number) => void): Promise<UploadedMedia> {
  const file = original.type.startsWith("video/") ? original : await preparePhoto(original);

  const start = await fetch("/api/admin/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  if (!start.ok) throw new Error(await readError(start, "Upload could not start."));
  const { url, path, signedUrl } = (await start.json()) as { url: string; path: string; signedUrl: string };

  // The same request Supabase's own client sends for a signed upload.
  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", file);
  const put = await putWithProgress(signedUrl, form, onProgress);
  if (!put.ok) throw new Error(await readError(put, "Upload failed."));
  return { url, path, type: file.type };
}
