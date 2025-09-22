export const RAW_API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
export const API_BASE = typeof RAW_API_BASE === "string" ? RAW_API_BASE.replace(/\/$/, "") : "";
export const STATIC_BASE = API_BASE.startsWith("http") ? API_BASE : "";
