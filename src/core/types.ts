import { z } from "zod";

/**
 * The 5 Home-relative directional routing modes.
 */
export const RouteModeSchema = z.enum([
  "ROUND_TRIP_FASTEST",               // Home -> ... -> Home (solver's fastest loop direction)
  "ROUND_TRIP_END_CLOSEST_TO_HOME",   // Home -> Farthest -> ... -> Closest -> Home
  "ROUND_TRIP_START_CLOSEST_TO_HOME", // Home -> Closest -> ... -> Farthest -> Home
  "OPEN_START_END_AT_HOME",           // Optimal outer first stop -> ... -> Home
  "OPEN_END_START_AT_HOME",           // Home -> ... -> Optimal outer final stop
]);

export type RouteMode = z.infer<typeof RouteModeSchema>;

/**
 * Pluggable solver engine identifier (Decision D11).
 */
export const SolverEngineIdSchema = z.enum([
  "osrm-trip",
  "no-solver",
  "ts-local",
  "byok-api",
]);
export type SolverEngineId = z.infer<typeof SolverEngineIdSchema>;

export const OsrmProfileSchema = z.enum(["car", "bike", "foot"]);
export type OsrmProfile = z.infer<typeof OsrmProfileSchema>;

export type LocalMatrixSource = "osrm-table" | "haversine-offline";
export type ByokProviderId = "google-routes" | "openrouteservice";

export type RouteStatus = "unoptimized" | "optimizing" | "optimized" | "stale";

/**
 * Dynamic per-solver configuration passed from the UI into the pipeline/solver.
 */
export interface SolverSpecificOptions {
  /** For `osrm-trip`: FOSSGIS OSRM travel profile ("car" | "bike" | "foot", default: "car") */
  osrmProfile?: OsrmProfile;
  /** For `osrm-trip`: Optional OSRM server base URL override */
  osrmBaseUrl?: string;
  /** Explicit opt-in required to contact a custom self-hosted OSRM origin (prevents SSRF / coordinate exfiltration) */
  allowCustomOsrmOrigin?: boolean;
  /** For `ts-local`: where to get pairwise weights (OSRM /table road times vs offline Haversine) */
  localMatrixSource?: LocalMatrixSource;
  /** For `byok-api`: which key-based routing provider to call */
  byokProvider?: ByokProviderId;
  /** For `byok-api`: user-supplied API key (kept strictly in browser, never committed) */
  apiKey?: string;
}

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Plain, immutable JSON-serializable location DTO.
 * Kept as a plain object (no class prototype) so Svelte 5 `$state` proxies,
 * `localStorage`, and future CLI/MCP boundaries serialize and clone it cleanly.
 */
export interface GeoLocation extends LatLng {
  readonly id: string;
  readonly name: string;
  readonly building?: string;
  readonly street?: string;
  readonly unit?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly country?: string;
  /** Optional OpenStreetMap identifier (e.g. "W123456" or "N7890") for exact Nominatim lookup */
  readonly osmId?: string;
  /** Street-level address (e.g. "57 Van Steuben Road" or "32 South Road #302"), falling back to name or coordinates. */
  readonly address: string;
  /** Complete postal address for Google Maps & full display. */
  readonly fullAddress: string;
}

export interface GeoLocationInit {
  id?: string;
  name?: string;
  building?: string;
  street?: string;
  unit?: string;
  address?: string;
  fullAddress?: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  osmId?: string;
}

export const GeoLocationInitSchema = z.object({
  id: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
  building: z.string().max(100).optional(),
  street: z.string().max(300).optional(),
  unit: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  city: z.string().max(200).optional(),
  state: z.string().max(200).optional(),
  zip: z.string().max(50).optional(),
  country: z.string().max(200).optional(),
  osmId: z.string().max(64).optional(),
});

/**
 * Safely deserializes a JSON array of untrusted `GeoLocation` objects (e.g. from `localStorage`
 * or URL `#hash`), stripping derived `fullAddress`, rejecting out-of-bounds/non-finite coords,
 * and deduplicating colliding IDs so keyed UI lists never crash.
 */
export function parseStoredGeoLocations(raw: string): GeoLocation[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    const results: GeoLocation[] = [];

    for (const item of parsed) {
      const check = GeoLocationInitSchema.safeParse(item);
      if (!check.success) continue;
      const loc = createGeoLocation(check.data);
      const uniqueLoc = seenIds.has(loc.id)
        ? { ...loc, id: `${loc.id}-${results.length}` }
        : loc;
      seenIds.add(uniqueLoc.id);
      results.push(uniqueLoc);
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Creates a safe JSON serializer/deserializer backed by a runtime Zod schema and fallback value.
 */
export function createSchemaSerializer<T>(schema: z.ZodType<T>, fallback: T) {
  return {
    serialize: (value: T) => JSON.stringify(value),
    deserialize: (raw: string): T => {
      try {
        const parsed: unknown = JSON.parse(raw);
        const check = schema.safeParse(parsed);
        return check.success ? check.data : fallback;
      } catch {
        return fallback;
      }
    },
  };
}

/**
 * Pure factory that normalizes optional address components into an immutable `GeoLocation` plain object.
 */
export function createGeoLocation(init: GeoLocationInit): GeoLocation {
  const building = init.building?.trim() || undefined;
  const street = init.street?.trim() || undefined;
  const unit = init.unit?.trim() || undefined;
  const city = init.city?.trim() || undefined;
  const state = init.state?.trim() || undefined;
  const zip = init.zip?.trim() || undefined;
  const country = init.country?.trim() || undefined;
  const osmId = init.osmId?.trim() || undefined;

  // 1. Assemble street-level line (e.g. "32 South Road #302"), falling back to name or coordinates
  const coordsFallback = `${init.lat.toFixed(5)}, ${init.lng.toFixed(5)}`;
  const unitPart = unit ? (unit.startsWith("#") ? unit : `#${unit}`) : undefined;
  const streetLine = [building, street, unitPart].filter(Boolean).join(" ");

  const address =
    init.address?.trim() ||
    streetLine ||
    init.name?.trim() ||
    coordsFallback;
  const name = init.name?.trim() || address;

  // 2. Assemble full postal address for Google Maps (omitting POI name & zip so geocoders resolve cleanly)
  const assembledFull = [
    address !== coordsFallback ? address : undefined,
    city,
    state,
    country,
  ]
    .filter((part): part is string => Boolean(part))
    .filter((part, idx, arr) => arr.indexOf(part) === idx)
    .join(", ");

  const fullAddress = init.fullAddress?.trim() || assembledFull || coordsFallback;
  const id =
    init.id?.trim() ||
    `${init.lat.toFixed(6)},${init.lng.toFixed(6)}-${osmId ?? fullAddress}-${name}`;

  return {
    id,
    name,
    building,
    street,
    unit,
    city,
    state,
    zip,
    country,
    osmId,
    address,
    fullAddress,
    lat: init.lat,
    lng: init.lng,
  };
}

export interface OrderedStopLeg {
  sequenceNumber: number; // 0 = Home start (when starting at Home), 1..N = stops
  stop: GeoLocation;
  isHome: boolean;
  isBridgeWaypoint?: boolean;
  legDurationSeconds: number;
  legDistanceMeters: number;
  cumulativeDurationSeconds: number;
  cumulativeDistanceMeters: number;
}

export interface BridgedNavLink {
  batchNumber: number;
  stopRangeLabel: string;
  fromName: string;
  toName: string;
  stopCount: number;
  bridgeStopId?: string;
  googleMapsUrl: string;
}

export interface OptimizedRouteResult {
  mode: RouteMode;
  solverEngine: SolverEngineId;
  home: GeoLocation;
  orderedLegs: OrderedStopLeg[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  routeGeoJson: GeoJSON.FeatureCollection;
  googleMapsLinks: BridgedNavLink[];
}

export interface OptimizerConfig {
  mode: RouteMode;
  solverEngine: SolverEngineId;
  solverOptions?: SolverSpecificOptions;
}
