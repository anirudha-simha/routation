import { LatLng } from "./types";

export type { LatLng };

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Computes the great-circle (Haversine) distance in meters between two coordinates.
 *Used for:
 * 1. Re-ranking geocoder candidates by distance from Home.
 * 2. Fallback distance/duration estimation if OSRM is unreachable.
 *
 * TODO (internals): Implement the Haversine formula (or review the placeholder below).
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
