import { GeoLocation, OsrmProfile } from "./types";

export class GoogleMapsLinkBuilder {
  private static readonly BASE_URL = "https://www.google.com/maps/dir/";
  private static readonly SEARCH_BASE_URL =
    "https://www.google.com/maps/search/";
  private static readonly EMBED_BASE_URL = "https://maps.google.com/maps";
  private static readonly MAX_STOPS_PER_LINK = 9;
  private static readonly TRAVEL_MODE_MAP: Record<OsrmProfile, string> = {
    car: "driving",
    bike: "bicycling",
    foot: "walking",
  };

  private static formatCoords(stop: GeoLocation): string {
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
   * Builds a keyless Google Maps Universal (`api=1`) Place Search link for a single location.
   * Clicking this opens Google Maps (or the native mobile app) pinned to the location's Place Card.
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
   * Note: We omit `ll=` when a named query is present so Google Maps snaps to the matched POI card.
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
   * Iterates through `orderedStops` and produces Google Maps Universal (`api=1`) directions links.
   * If there are more than `maxStopsPerLink` (default 9),
   * it splits the route into bridged chunks where the destination of link K is the origin of link K+1.
   */
  buildDirectionsLink(
    travelMode: OsrmProfile,
    orderedStops: GeoLocation[],
    maxStopsPerLink = GoogleMapsLinkBuilder.MAX_STOPS_PER_LINK
  ): string[] {
    if (orderedStops.length < 2) {
      return [];
    }

    const chunks: GeoLocation[][] = this.chunkStopsWithBridge(
      orderedStops,
      maxStopsPerLink
    );
    return chunks.map((chunk: GeoLocation[]) =>
      this.buildUrl(travelMode, chunk)
    );
  }

  /**
   * Builds a single Google Maps directions URL for a chunk of 2..N ordered stops.
   */
  buildUrl(travelMode: OsrmProfile, chunk: GeoLocation[]): string {
    const params = new URLSearchParams({
      api: "1",
      origin: this.extractOrigin(chunk),
      destination: this.extractDestination(chunk),
      travelmode: GoogleMapsLinkBuilder.TRAVEL_MODE_MAP[travelMode],
    });

    const waypoints = this.extractWaypoints(chunk);
    if (waypoints.length > 0) {
      params.set("waypoints", waypoints);
    }

    return `${GoogleMapsLinkBuilder.BASE_URL}?${params.toString()}`;
  }

  private extractOrigin(orderedStops: GeoLocation[]): string {
    return orderedStops[0].fullAddress;
  }

  private extractWaypoints(orderedStops: GeoLocation[]): string {
    // Only include intermediate stops (exclude index 0 origin and last index destination)
    return orderedStops
      .slice(1, orderedStops.length - 1)
      .map((stop) => stop.fullAddress)
      .join("|");
  }

  private extractDestination(orderedStops: GeoLocation[]): string {
    return orderedStops[orderedStops.length - 1].fullAddress;
  }

  /**
   * Splits `orderedStops` into overlapping chunks of at most `maxChunkSize` stops,
   * repeating the last stop of chunk K as the first stop ("bridge") of chunk K+1.
   */
  private chunkStopsWithBridge(
    orderedStops: GeoLocation[],
    maxChunkSize: number
  ): GeoLocation[][] {
    if (maxChunkSize < 2) {
      throw new Error("maxStopsPerLink must be at least 2.");
    }

    const chunks: GeoLocation[][] = [];
    // Step by (maxChunkSize - 1) so the last stop of chunk K becomes the first stop of chunk K+1
    const stride = maxChunkSize - 1;
    for (let i = 0; i < orderedStops.length - 1; i += stride) {
      const slice = orderedStops.slice(i, i + maxChunkSize);
      if (slice.length < 2) break;
      chunks.push(slice);
    }
    return chunks;
  }
}