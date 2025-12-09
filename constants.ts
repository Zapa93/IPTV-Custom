
// URLs retrieved from environment variables
// Note: These process.env accesses are replaced by strings at build time via vite.config.ts
export const SPORT_URL = process.env.VITE_SPORT_URL || "";
export const ENTERTAINMENT_URL = process.env.VITE_ENTERTAINMENT_URL || "";
export const MANUAL_EPG_URL = process.env.VITE_EPG_URL || "";

// API Keys
export const FOOTBALL_API_KEY = process.env.VITE_FOOTBALL_DATA_KEY || "";

// Fallback Logo
export const DEFAULT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234B5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='7' width='20' height='15' rx='2' ry='2'/%3E%3Cpolyline points='17 2 12 7 7 2'/%3E%3C/svg%3E";
