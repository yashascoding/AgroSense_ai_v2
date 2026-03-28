/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Cloudinary dashboard "Cloud name" — required for browser upload. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  /** Unsigned upload preset (Settings → Upload → Upload presets). Required for browser upload. */
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
