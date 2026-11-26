const R = 6371008.8; // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres (Haversine). */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Move a point by `distance` metres along `bearing` degrees. */
export function offsetPoint(lat: number, lng: number, distance: number, bearing: number) {
  const δ = distance / R;
  const θ = toRad(bearing);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: toDeg(λ2) };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Approximate "search zone" shown to participants when an organiser enables
 * reveal_zone. The true target is guaranteed to be inside the circle but is
 * NOT its centre, so the exact coordinates are never exposed.
 */
export function fuzzedZone(clueId: string, lat: number, lng: number, radius: number) {
  const h = hashString(clueId);
  const displayRadius = Math.max(radius * 3, 120);
  const shift = displayRadius * (0.25 + ((h % 1000) / 1000) * 0.4); // 25–65% of display radius
  const bearing = (h >>> 10) % 360;
  const c = offsetPoint(lat, lng, shift, bearing);
  return { lat: round(c.lat, 6), lng: round(c.lng, 6), radius_m: Math.round(displayRadius) };
}

export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Human-readable distance, deliberately coarse when far away. */
export function coarseDistance(m: number): number {
  if (m < 100) return Math.round(m);
  if (m < 1000) return Math.round(m / 10) * 10;
  return Math.round(m / 50) * 50;
}

export const IIT_PATNA = { lat: 25.5357, lng: 84.8512 };
