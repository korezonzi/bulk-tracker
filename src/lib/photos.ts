import { supabase } from "@/lib/supabase";

// Private bucket for skin / consult photos.
// Paths (not public URLs) are stored in DB; display uses short-lived signed URLs.
export const HEALTH_BUCKET = "health-photos";

const SIGNED_URL_TTL_SECONDS = 3600;
const COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 1200,
  initialQuality: 0.8,
  useWebWorker: true,
};

export interface UploadedPhoto {
  path: string;
  dataUrl: string; // for local preview
  base64: string; // for AI analysis (data URL prefix stripped)
  mimeType: string;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress a photo, upload it to the private bucket, and return
 * base64 + preview data URL so the same compressed image can be
 * reused for AI analysis without re-encoding.
 */
export async function uploadPrivatePhoto(
  path: string,
  file: File,
  options?: { upsert?: boolean }
): Promise<UploadedPhoto> {
  const { default: imageCompression } = await import(
    "browser-image-compression"
  );
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS);

  const { error } = await supabase.storage
    .from(HEALTH_BUCKET)
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: options?.upsert ?? true,
    });
  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const dataUrl = await readAsDataUrl(compressed);
  return {
    path,
    dataUrl,
    base64: dataUrl.split(",")[1],
    mimeType: "image/jpeg",
  };
}

/**
 * Batch-issue signed URLs for private photos.
 * Returns a path → signed URL map; failed paths are omitted.
 */
export async function getSignedUrls(
  paths: string[]
): Promise<Record<string, string>> {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(HEALTH_BUCKET)
    .createSignedUrls(validPaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("Signed URL error:", error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) {
      map[item.path] = item.signedUrl;
    }
  }
  return map;
}
