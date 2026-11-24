import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { z } from "zod";
import {
  createGeoLocation,
  type GeoLocation,
  type OsrmProfile,
  OsrmProfileSchema,
  type RouteMode,
  RouteModeSchema,
  type SolverEngineId,
  SolverEngineIdSchema,
} from "./types";

const HASH_PREFIX = "#r=";
const MAX_COMPRESSED_CHARS = 16_384;
const MAX_DECOMPRESSED_CHARS = 65_536;

const CompactLocationSchema = z.object({
  n: z.string().max(300).optional(),
  b: z.string().max(100).optional(),
  st: z.string().max(300).optional(),
  u: z.string().max(100).optional(),
  c: z.string().max(200).optional(),
  stt: z.string().max(200).optional(),
  z: z.string().max(50).optional(),
  co: z.string().max(200).optional(),
  o: z.string().max(64).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

type CompactLocation = z.infer<typeof CompactLocationSchema>;

const SharedPayloadV1Schema = z.object({
  v: z.literal(1),
  m: RouteModeSchema.catch("ROUND_TRIP_FASTEST"),
  e: SolverEngineIdSchema.catch("osrm-trip"),
  p: OsrmProfileSchema.catch("car"),
  h: CompactLocationSchema.optional(),
  s: z.array(CompactLocationSchema).max(100),
});

export interface SharedRouteState {
  home?: GeoLocation;
  stops: GeoLocation[];
  mode: RouteMode;
  solverEngine: SolverEngineId;
  osrmProfile: OsrmProfile;
}

function toCompactLocation(loc: GeoLocation): CompactLocation {
  return {
    ...(loc.name ? { n: loc.name } : {}),
    ...(loc.building ? { b: loc.building } : {}),
    ...(loc.street ? { st: loc.street } : {}),
    ...(loc.unit ? { u: loc.unit } : {}),
    ...(loc.city ? { c: loc.city } : {}),
    ...(loc.state ? { stt: loc.state } : {}),
    ...(loc.zip ? { z: loc.zip } : {}),
    ...(loc.country ? { co: loc.country } : {}),
    ...(loc.osmId ? { o: loc.osmId } : {}),
    lat: Number(loc.lat.toFixed(6)),
    lng: Number(loc.lng.toFixed(6)),
  };
}

function fromCompactLocation(c: CompactLocation, id: string): GeoLocation {
  return createGeoLocation({
    id,
    name: c.n,
    building: c.b,
    street: c.st,
    unit: c.u,
    city: c.c,
    state: c.stt,
    zip: c.z,
    country: c.co,
    osmId: c.o,
    lat: c.lat,
    lng: c.lng,
  });
}

/**
 * Encodes route inputs into a compact, privacy-preserving `#r=...` URL fragment.
 * Because browsers never send `#fragment` over HTTP, Home and stop addresses stay client-side.
 */
export function encodeSharedRouteHash(state: SharedRouteState): string {
  const payload: z.input<typeof SharedPayloadV1Schema> = {
    v: 1,
    m: state.mode,
    e: state.solverEngine,
    p: state.osrmProfile,
    ...(state.home ? { h: toCompactLocation(state.home) } : {}),
    s: state.stops.map(toCompactLocation),
  };
  return `${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

/**
 * Replaces any existing `#fragment` on `baseHref` with the encoded `#r=...` route hash.
 */
export function buildShareableRouteUrl(
  baseHref: string,
  state: SharedRouteState
): string {
  const withoutHash = baseHref.split("#")[0];
  return `${withoutHash}${encodeSharedRouteHash(state)}`;
}

/**
 * Safely decompresses and validates an untrusted `#r=...` URL hash.
 * Enforces strict compressed/decompressed byte caps and Zod coordinate/string bounds.
 */
export function decodeSharedRouteHash(hash: string): SharedRouteState | null {
  const trimmed = hash.trim();
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!normalized.startsWith(HASH_PREFIX)) return null;

  const encoded = normalized.slice(HASH_PREFIX.length);
  if (!encoded || encoded.length > MAX_COMPRESSED_CHARS) return null;

  try {
    const rawJson = decompressFromEncodedURIComponent(encoded);
    if (!rawJson || rawJson.length > MAX_DECOMPRESSED_CHARS) return null;

    const parsed: unknown = JSON.parse(rawJson);
    const check = SharedPayloadV1Schema.safeParse(parsed);
    if (!check.success) return null;

    const { h, s, m, e, p } = check.data;
    return {
      home: h ? fromCompactLocation(h, "shared-home") : undefined,
      stops: s.map((item, idx) => fromCompactLocation(item, `shared-stop-${idx + 1}`)),
      mode: m,
      solverEngine: e,
      osrmProfile: p,
    };
  } catch {
    return null;
  }
}
