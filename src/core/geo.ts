import { LatLng } from "./types";

export type { LatLng };

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1609.344;

/**
 * Formats a distance in meters as miles with 1 decimal place (e.g. "14.2").
 */
export function formatMiles(meters: number): string {
  return (meters / METERS_PER_MILE).toFixed(1);
}

/**
 * Formats a duration in seconds into a compact human-readable string (e.g. "~12 min", "~1h 15m").
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1 && seconds > 0) return "<1 min";
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `~${hrs}h ${remMins}m` : `~${hrs}h`;
}

/**
 * Computes the great-circle (Haversine) distance in meters between two coordinates.
 * Used for:
 * 1. Instant search-dropdown distance badges from Home (0 API calls).
 * 2. Fallback distance/duration estimation in `NoSolver` or when OSRM is unreachable.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
