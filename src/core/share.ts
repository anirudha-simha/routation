import { z } from "zod";
import {
  createGeoLocation,
  type GeoLocation,
  GeoLocationInitSchema,
  type OsrmProfile,
  OsrmProfileSchema,
  type RouteMode,
  RouteModeSchema,
  type SolverEngineId,
  SolverEngineIdSchema,
} from "./types";

const HASH_PREFIX = "#r=";
const MAX_ENCODED_CHARS = 16_384;
const MAX_DECOMPRESSED_BYTES = 65_536;

const SharedLocationSchema = GeoLocationInitSchema.omit({
  id: true,
  address: true,
});
type SharedLocation = z.infer<typeof SharedLocationSchema>;

const SharedRoutePayloadSchema = z.discriminatedUnion("version", [
  z.object({
    version: z.literal(1),
    mode: RouteModeSchema.catch("ROUND_TRIP_FASTEST"),
    solverEngine: SolverEngineIdSchema.catch("osrm-trip"),
    osrmProfile: OsrmProfileSchema.catch("car"),
    home: SharedLocationSchema.optional(),
    stops: z.array(SharedLocationSchema).max(100),
  }),
]);

export interface SharedRouteState {
  home?: GeoLocation;
  stops: GeoLocation[];
  mode: RouteMode;
  solverEngine: SolverEngineId;
  osrmProfile: OsrmProfile;
}

export type SharedHashParseResult =
  | { status: "none" }
  | { status: "ok"; state: SharedRouteState }
  | { status: "invalid"; reason: string };

function toSharedLocation(location: GeoLocation): SharedLocation {
  const candidate = {
    ...(location.name ? { name: location.name } : {}),
    ...(location.building ? { building: location.building } : {}),
    ...(location.street ? { street: location.street } : {}),
    ...(location.unit ? { unit: location.unit } : {}),
    ...(location.city ? { city: location.city } : {}),
    ...(location.state ? { state: location.state } : {}),
    ...(location.zip ? { zip: location.zip } : {}),
    ...(location.country ? { country: location.country } : {}),
    ...(location.osmId ? { osmId: location.osmId } : {}),
    lat: Number(location.lat.toFixed(6)),
    lng: Number(location.lng.toFixed(6)),
  };

  const check = SharedLocationSchema.safeParse(candidate);
  if (!check.success) {
    throw new Error(
      "Cannot encode route share URL with out-of-range coordinates or invalid location fields."
    );
  }
  return check.data;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  let padded = token.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) {
    padded += "=";
  }

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // Canonical check catches trailing padding-bit edits on the final base64url character
    return bytesToBase64Url(bytes) === token ? bytes : null;
  } catch {
    return null;
  }
}

async function compressGzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decompressGzipBounded(
  compressedBytes: Uint8Array,
  maxBytes = MAX_DECOMPRESSED_BYTES
): Promise<string> {
  const stream = new Blob([compressedBytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(
          "Decompressed route payload exceeds maximum allowed size."
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

/**
 * Encodes route inputs as a gzipped, base64url `#r=...` URL fragment with RFC 1952 CRC-32 integrity.
 * Because browsers never send `#fragment` over HTTP, Home and stop addresses stay client-side.
 */
export async function encodeSharedRouteHash(
  state: SharedRouteState
): Promise<string> {
  const payload: z.input<typeof SharedRoutePayloadSchema> = {
    version: 1,
    mode: state.mode,
    solverEngine: state.solverEngine,
    osrmProfile: state.osrmProfile,
    ...(state.home ? { home: toSharedLocation(state.home) } : {}),
    stops: state.stops.map(toSharedLocation),
  };

  const compressed = await compressGzip(JSON.stringify(payload));
  return `${HASH_PREFIX}${bytesToBase64Url(compressed)}`;
}

/**
 * Replaces any existing `#fragment` on `baseHref` with the encoded `#r=...` route hash.
 */
export async function buildShareableRouteUrl(
  baseHref: string,
  state: SharedRouteState
): Promise<string> {
  const baseWithoutHash = baseHref.split("#")[0];
  const hash = await encodeSharedRouteHash(state);
  return `${baseWithoutHash}${hash}`;
}

/**
 * Parses, decompresses, and Zod-validates an untrusted `#r=...` URL hash into a
 * discriminated result (`none` | `ok` | `invalid`) with native gzip CRC-32 verification.
 */
export async function parseSharedRouteHash(
  hash: string
): Promise<SharedHashParseResult> {
  const trimmed = hash.trim();
  if (!trimmed || trimmed === "#") {
    return { status: "none" };
  }

  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!normalized.startsWith(HASH_PREFIX)) {
    return {
      status: "invalid",
      reason: "Unrecognized URL hash format (expected #r=...).",
    };
  }

  const token = normalized.slice(HASH_PREFIX.length);
  if (!token || token.length > MAX_ENCODED_CHARS) {
    return {
      status: "invalid",
      reason: "Shared route link in URL is empty or exceeds maximum length.",
    };
  }

  const compressedBytes = base64UrlToBytes(token);
  if (!compressedBytes) {
    return {
      status: "invalid",
      reason:
        "Shared route link encoding is invalid — the URL hash may have been edited or truncated.",
    };
  }

  try {
    const rawJson = await decompressGzipBounded(compressedBytes);
    const parsed: unknown = JSON.parse(rawJson);
    const check = SharedRoutePayloadSchema.safeParse(parsed);
    if (!check.success) {
      return {
        status: "invalid",
        reason: "Shared route payload failed schema validation.",
      };
    }

    const { home, stops, mode, solverEngine, osrmProfile } = check.data;
    return {
      status: "ok",
      state: {
        home: home
          ? createGeoLocation({ ...home, id: "shared-home" })
          : undefined,
        stops: stops.map((stop, idx) =>
          createGeoLocation({ ...stop, id: `shared-stop-${idx + 1}` })
        ),
        mode,
        solverEngine,
        osrmProfile,
      },
    };
  } catch {
    return {
      status: "invalid",
      reason:
        "Shared route link failed integrity check — the URL hash was modified or truncated.",
    };
  }
}

/**
 * Convenience wrapper returning `SharedRouteState | null`.
 */
export async function decodeSharedRouteHash(
  hash: string
): Promise<SharedRouteState | null> {
  const result = await parseSharedRouteHash(hash);
  return result.status === "ok" ? result.state : null;
}
