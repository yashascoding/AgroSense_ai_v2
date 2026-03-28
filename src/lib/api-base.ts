/** Backend URL. Use VITE_API_BASE in .env when needed; otherwise same host as the app on port 5000. */
export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5000`;
  }
  return "http://127.0.0.1:5000";
}
