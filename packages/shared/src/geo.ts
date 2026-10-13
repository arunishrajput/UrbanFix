const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLng {
  lat: number;
  lng: number;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "12 m", "850 m", "1.2 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(1, Math.round(metres))} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** "12 meters", "1.2 kilometers" — for sentences. */
export function formatDistanceLong(metres: number): string {
  if (metres < 1000) {
    const m = Math.max(1, Math.round(metres));
    return `${m} ${m === 1 ? 'meter' : 'meters'}`;
  }
  return `${(metres / 1000).toFixed(1)} kilometers`;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Parses "west,south,east,north". Returns null when malformed or out of range. */
export function parseBBox(raw: string): BBox | null {
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (south < -90 || north > 90 || south >= north || west < -180 || east > 180 || west >= east) return null;
  return { west, south, east, north };
}
