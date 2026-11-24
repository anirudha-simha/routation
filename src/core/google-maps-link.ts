import { BridgedNavLink, GeoLocation, OsrmProfile } from "./types";

/**
 * Splits an array into overlapping chunks of at most `maxChunkSize` items,
 * where the last item of chunk K is repeated as the first item ("bridge") of chunk K+1.
 */
export function chunkWithOverlap<T>(
  items: readonly T[],
  maxChunkSize: number
): T[][] {
  if (maxChunkSize < 2) {
    throw new Error("maxChunkSize must be at least 2");
  }
  if (items.length === 0) return [];
  if (items.length <= maxChunkSize) return [items.slice()];

  const chunks: T[][] = [];
  const stride = maxChunkSize - 1;
  for (let i = 0; i < items.length - 1; i += stride) {
    const slice = items.slice(i, i + maxChunkSize);
    if (slice.length < 2) break;
    chunks.push(slice);
  }
  return chunks;
}

export class GoogleMapsLinkBuilder {
  private static readonly BASE_URL = "https://www.google.com/maps/dir/";
  private static readonly SEARCH_BASE_URL =
    "https://www.google.com/maps/search/";
  private static readonly EMBED_BASE_URL = "https://maps.google.com/maps";
  static readonly MAX_STOPS_PER_LINK = 9;

  private static readonly TRAVEL_MODE_MAP: Record<OsrmProfile, string> = {
    car: "driving",
    bike: "bicycling",
    foot: "walking",
  };

  static formatCoords(stop: GeoLocation): string {
    return `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`;
  }

  /**
   * Formats a place query that includes BOTH the POI `name` (e.g. "Painted Ladies (Alamo Square)")
   * and the postal `fullAddress` so Google Maps resolves the named Place Card (reviews, photos, hours)
   * rather than falling back to a bare street intersection.
   */
  private static formatPlaceQuery(stop: GeoLocation): string {
    const name = stop.name?.trim();
    const addr = stop.fullAddress?.trim();
    if (name && addr && !addr.toLowerCase().includes(name.toLowerCase())) {
      return `${name}, ${addr}`;
    }
    return addr || name || GoogleMapsLinkBuilder.formatCoords(stop);
  }

  /**
   * Formats a stop for turn-by-turn directions (`origin`, `destination`, `waypoints`).
   * Uses `fullAddress` when a street-level address exists; otherwise falls back to exact coordinates
   * so parks or landmarks without street numbers never mis-route to a city center.
   */
  private static formatDirectionsStop(stop: GeoLocation): string {
    if (stop.street) {
      return stop.fullAddress;
    }
    return GoogleMapsLinkBuilder.formatCoords(stop);
  }

  /**
   * Builds a keyless Google Maps Universal (`api=1`) Place Search link for a single location.
   */
  static buildPlaceSearchUrl(stop: GeoLocation): string {
    const params = new URLSearchParams({
      api: "1",
      query: GoogleMapsLinkBuilder.formatPlaceQuery(stop),
    });
    return `${GoogleMapsLinkBuilder.SEARCH_BASE_URL}?${params.toString()}`;
  }

  /**
   * Builds a keyless Google Maps `output=embed` URL suitable for an on-demand `<iframe>` preview.
   */
  static buildPlaceEmbedUrl(stop: GeoLocation, zoom = 15): string {
    const params = new URLSearchParams({
      q: GoogleMapsLinkBuilder.formatPlaceQuery(stop),
      z: String(zoom),
      output: "embed",
    });
    return `${GoogleMapsLinkBuilder.EMBED_BASE_URL}?${params.toString()}`;
  }

  /**
   * Produces bridged Google Maps Universal (`api=1`) navigation links for an ordered itinerary.
   * When `orderedStops.length > maxStopsPerLink` (default 9), consecutive links share a 1-stop
   * overlap ("bridge waypoint") so navigation continues seamlessly.
   */
  static buildDirectionsLinks(
    orderedStops: readonly GeoLocation[],
    travelMode: OsrmProfile = "car",
    maxStopsPerLink = GoogleMapsLinkBuilder.MAX_STOPS_PER_LINK
  ): BridgedNavLink[] {
    if (orderedStops.length < 2) {
      return [];
    }

    const chunks = chunkWithOverlap(orderedStops, maxStopsPerLink);
    const stride = maxStopsPerLink - 1;

    return chunks.map((chunk, idx) => {
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      const startNum = idx * stride + 1;
      const endNum = idx * stride + chunk.length;

      const params = new URLSearchParams({
        api: "1",
        origin: GoogleMapsLinkBuilder.formatDirectionsStop(first),
        destination: GoogleMapsLinkBuilder.formatDirectionsStop(last),
        travelmode: GoogleMapsLinkBuilder.TRAVEL_MODE_MAP[travelMode],
      });

      const waypoints = chunk
        .slice(1, -1)
        .map((stop) => GoogleMapsLinkBuilder.formatDirectionsStop(stop))
        .join("|");
      if (waypoints.length > 0) {
        params.set("waypoints", waypoints);
      }

      return {
        batchNumber: idx + 1,
        stopRangeLabel: `Part ${idx + 1}: Stops #${startNum}–#${endNum}`,
        fromName: first.name,
        toName: last.name,
        stopCount: chunk.length,
        bridgeStopId: idx > 0 ? first.id : undefined,
        googleMapsUrl: `${GoogleMapsLinkBuilder.BASE_URL}?${params.toString()}`,
      };
    });
  }
}
