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

export type OsrmProfile = "car" | "bike" | "foot";
export type LocalMatrixSource = "osrm-table" | "haversine-offline";
export type ByokProviderId = "google-routes" | "openrouteservice";

export type RouteStatus = "unoptimized" | "optimizing" | "optimized" | "stale";
export type RouteEvent =
  | "OPTIMIZE_START"
  | "OPTIMIZE_SUCCESS"
  | "OPTIMIZE_ERROR"
  | "INPUTS_CHANGED";

/**
 * Dynamic per-solver configuration passed from Row 3 of the UI into the pipeline/solver.
 */
export interface SolverSpecificOptions {
  /** For `osrm-trip`: FOSSGIS OSRM travel profile ("car" | "bike" | "foot", default: "car") */
  osrmProfile?: OsrmProfile;
  /** For `osrm-trip`: Optional OSRM server base URL override */
  osrmBaseUrl?: string;
  /** For `ts-local`: where to get pairwise weights (OSRM /table road times vs offline Haversine) */
  localMatrixSource?: LocalMatrixSource;
  /** For `byok-api`: which key-based routing provider to call */
  byokProvider?: ByokProviderId;
  /** For `byok-api`: user-supplied API key (kept strictly in browser, never committed) */
  apiKey?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export class GeoLocation implements LatLng {
  id: string;
  name: string;
  building?: string;
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  /** Optional OpenStreetMap identifier (e.g. "W123456" or "N7890") for exact Nominatim lookup */
  osmId?: string;
  /** Street-level address (e.g. "57 Van Steuben Road" or "32 South Road #302"), falling back to name or coordinates. */
  address: string;
  /** Complete postal address for Google Maps & full display . */
  fullAddress: string;
  lat: number;
  lng: number;

  constructor(init: {
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
  }) {
    this.lat = init.lat;
    this.lng = init.lng;
    this.building = init.building?.trim() || undefined;
    this.street = init.street?.trim() || undefined;
    this.unit = init.unit?.trim() || undefined;
    this.city = init.city?.trim() || undefined;
    this.state = init.state?.trim() || undefined;
    this.zip = init.zip?.trim() || undefined;
    this.country = init.country?.trim() || undefined;
    this.osmId = init.osmId?.trim() || undefined;

    // 1. Assemble street-level line (e.g. "32 South Road #302"), falling back to name or coordinates
    const coordsFallback = `${init.lat.toFixed(5)}, ${init.lng.toFixed(5)}`;
    const unitPart = this.unit
      ? this.unit.startsWith("#")
        ? this.unit
        : `#${this.unit}`
      : undefined;
    const streetLine = [this.building, this.street, unitPart]
      .filter(Boolean)
      .join(" ");

    this.address =
      init.address?.trim() ||
      streetLine ||
      init.name?.trim() ||
      coordsFallback;
    this.name = init.name?.trim() || this.address;

    // 2. Assemble full postal address for Google Maps (omitting POI name & zip so geocoders resolve cleanly)
    const assembledFull = [
      this.address !== coordsFallback ? this.address : undefined,
      this.city,
      this.state,
      this.country,
    ]
      .filter((part): part is string => Boolean(part))
      .filter((part, idx, arr) => arr.indexOf(part) === idx)
      .join(", ");

    this.fullAddress =
      init.fullAddress?.trim() || assembledFull || coordsFallback;

    this.id =
      init.id?.trim() ||
      `${init.lat.toFixed(6)},${init.lng.toFixed(6)}-${this.name}`;
  }
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
  googleMapsLinks: string[];
}

export interface OptimizerConfig {
  mode: RouteMode;
  solverEngine: SolverEngineId;
  solverOptions?: SolverSpecificOptions; // Dynamic solver-specific options from Row 3
}
