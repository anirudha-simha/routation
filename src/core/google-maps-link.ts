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
   * Uses `fullAddress` ONLY when a specific street number or intersection (`&`) exists;
   * otherwise uses exact `lat,lng` coordinates so unnumbered roads ("The Embarcadero")
   * or parks never mis-route drivers to an arbitrary road midpoint or city hall.
   */
  private static formatDirectionsStop(stop: GeoLocation): string {
    const hasSpecificStreetAddress =
      Boolean(stop.building && stop.street) || Boolean(stop.street?.includes("&"));
    if (hasSpecificStreetAddress) {
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
    maxStopsPerLink = GoogleMapsLinkBuilder.MAX_STOPS_PER_LINK,
    homeId?: string
  ): BridgedNavLink[] {
    if (orderedStops.length < 2) {
      return [];
    }

    // Assign human-readable labels matching ItineraryList ("Home" vs "#1..#N")
    let nonHomeCounter = 0;
    const stopLabels = orderedStops.map((s) =>
      homeId && s.id === homeId ? "Home" : `#${++nonHomeCounter}`
    );

    const indices = orderedStops.map((_, i) => i);
    const indexChunks = chunkWithOverlap(indices, maxStopsPerLink);

    return indexChunks.map((idxChunk, batchIdx) => {
      const firstIdx = idxChunk[0];
      const lastIdx = idxChunk[idxChunk.length - 1];
      const first = orderedStops[firstIdx];
      const last = orderedStops[lastIdx];

      const params = new URLSearchParams({
        api: "1",
        origin: GoogleMapsLinkBuilder.formatDirectionsStop(first),
        destination: GoogleMapsLinkBuilder.formatDirectionsStop(last),
        travelmode: GoogleMapsLinkBuilder.TRAVEL_MODE_MAP[travelMode],
      });

      const waypoints = idxChunk
        .slice(1, -1)
        .map((i) => GoogleMapsLinkBuilder.formatDirectionsStop(orderedStops[i]))
        .join("|");
      if (waypoints.length > 0) {
        params.set("waypoints", waypoints);
      }

      return {
        batchNumber: batchIdx + 1,
        stopRangeLabel: `Part ${batchIdx + 1} (${stopLabels[firstIdx]} → ${stopLabels[lastIdx]})`,
        fromName: first.name,
        toName: last.name,
        stopCount: idxChunk.length,
        bridgeStopId: batchIdx > 0 ? first.id : undefined,
        googleMapsUrl: `${GoogleMapsLinkBuilder.BASE_URL}?${params.toString()}`,
      };
    });
  }
}
