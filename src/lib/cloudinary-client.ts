/**
 * Optional: unsigned browser upload. The Detect page uploads to the backend instead, which uses
 * signed server upload (API secret) — no upload preset required.
 */

import { getApiBase } from "@/lib/api-base";

export const CLOUDINARY_CONFIG_ERROR =
  "Image upload configuration is missing. Check Cloudinary env setup.";

type BackendCloudinaryConfig = {
  configured?: boolean;
  cloud_name?: string;
  upload_preset?: string;
};

/**
 * Resolve cloud name + upload preset. No hardcoded defaults.
 */
export async function resolveCloudinaryUploadConfig(): Promise<{
  cloudName: string;
  uploadPreset: string;
  source: "vite" | "backend";
}> {
  const viteCloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const vitePreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  const viteRelatedKeys = Object.keys(import.meta.env).filter((k) => k.includes("CLOUDINARY"));
  console.log("[Agrosense Cloudinary] import.meta.env keys matching *CLOUDINARY*:", viteRelatedKeys);
  console.log("[Agrosense Cloudinary] Raw VITE reads:", {
    VITE_CLOUDINARY_CLOUD_NAME: viteCloud ?? "(undefined)",
    VITE_CLOUDINARY_UPLOAD_PRESET: vitePreset ?? "(undefined)",
  });

  const vCloud = typeof viteCloud === "string" ? viteCloud.trim() : "";
  const vPreset = typeof vitePreset === "string" ? vitePreset.trim() : "";
  if (vCloud && vPreset) {
    console.log("[Agrosense Cloudinary] Using config source: vite (both variables set)");
    if (import.meta.env.DEV) {
      console.log("[Agrosense Cloudinary] Values (dev):", { cloudName: vCloud, uploadPreset: vPreset });
    }
    return { cloudName: vCloud, uploadPreset: vPreset, source: "vite" };
  }

  console.warn(
    "[Agrosense Cloudinary] VITE_* incomplete; trying backend GET /config/cloudinary (set CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET in backend/.env)"
  );
  try {
    const res = await fetch(`${getApiBase()}/config/cloudinary`);
    const j = (await res.json()) as BackendCloudinaryConfig;
    console.log("[Agrosense Cloudinary] Backend response:", {
      ok: res.ok,
      configured: j.configured === true,
      hasCloudName: Boolean(j.cloud_name?.trim()),
      hasPreset: Boolean(j.upload_preset?.trim()),
    });
    if (
      res.ok &&
      j.configured === true &&
      typeof j.cloud_name === "string" &&
      j.cloud_name.trim() &&
      typeof j.upload_preset === "string" &&
      j.upload_preset.trim()
    ) {
      const cloudName = j.cloud_name.trim();
      const uploadPreset = j.upload_preset.trim();
      console.log("[Agrosense Cloudinary] Using config source: backend");
      if (import.meta.env.DEV) {
        console.log("[Agrosense Cloudinary] Values (dev):", { cloudName, uploadPreset });
      }
      return { cloudName, uploadPreset, source: "backend" };
    }
  } catch (e) {
    console.error("[Agrosense Cloudinary] Failed to fetch backend config:", e);
  }

  console.error(
    "[Agrosense Cloudinary] Fix: add to Agrosense_ai/.env → VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET — or add to backend/.env → CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET (unsigned preset). Restart dev servers."
  );
  throw new Error(CLOUDINARY_CONFIG_ERROR);
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error("No image to upload.");
  }

  const { cloudName, uploadPreset, source } = await resolveCloudinaryUploadConfig();
  console.log(
    "[Agrosense Cloudinary] Upload start:",
    "source=" + source,
    "file=" + file.name,
    "size=" + file.size,
    "cloud=" + cloudName
  );

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", uploadPreset);

  const res = await fetch(endpoint, { method: "POST", body });
  let data: { secure_url?: string; error?: { message?: string } } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error("Cloudinary returned an invalid response.");
  }

  if (!res.ok) {
    const msg =
      typeof data.error?.message === "string" ? data.error.message : `Cloudinary upload failed (${res.status})`;
    console.error("[Agrosense Cloudinary] Upload error:", data);
    throw new Error(msg);
  }

  const secureUrl = data.secure_url;
  if (typeof secureUrl !== "string" || !secureUrl) {
    console.error("[Agrosense Cloudinary] No secure_url in response:", data);
    throw new Error("Cloudinary did not return a secure_url.");
  }

  console.log("[Agrosense Cloudinary] Upload OK, secure_url length:", secureUrl.length);
  return secureUrl;
}
