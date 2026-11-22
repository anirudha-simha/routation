import { BridgedNavLink, GeoLocation } from "./types";

/**
 * Splits an array into overlapping chunks of at most `maxChunkSize` items,
 * where the last item of chunk K is repeated as the first item ("bridge") of chunk K+1.
 */
export function chunkWithOverlap<T>(items: T[], maxChunkSize: number): T[][] {
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

/**
 * Builds chained Google Maps Universal (`api=1`) navigation URLs from an ordered list of stops.
 */
export function buildBridgedGoogleMapsLinks(
  orderedStops: GeoLocation[],
  maxStopsPerUrl = 10
): BridgedNavLink[] {
  const chunks = chunkWithOverlap(orderedStops, maxStopsPerUrl);
  const stride = maxStopsPerUrl - 1;

  return chunks.map((chunk, idx) => {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const startNum = idx * stride + 1;
    const endNum = idx * stride + chunk.length;

    const origin = `${first.lat.toFixed(6)},${first.lng.toFixed(6)}`;
    const destination = `${last.lat.toFixed(6)},${last.lng.toFixed(6)}`;
    const waypoints = chunk
      .slice(1, -1)
      .map((s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`)
      .join("|");

    const params = new URLSearchParams({
      api: "1",
      origin,
      destination,
      travelmode: "driving",
    });
    if (waypoints.length > 0) {
      params.set("waypoints", waypoints);
    }

    return {
      batchNumber: idx + 1,
      stopRangeLabel: `Link ${idx + 1}: Stops #${startNum}–#${endNum}`,
      fromName: first.name,
      toName: last.name,
      stopCount: chunk.length,
      bridgeStopId: idx > 0 ? first.id : undefined,
      googleMapsUrl: `https://www.google.com/maps/dir/?${params.toString()}`,
    };
  });
}
