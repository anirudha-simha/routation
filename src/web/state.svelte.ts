import { PersistedState } from "runed";
import {
  createGeoLocation,
  createSchemaSerializer,
  defaultProviderContext,
  type GeoLocation,
  type OptimizedRouteResult,
  type OsrmProfile,
  OsrmProfileSchema,
  parseStoredGeoLocations,
  type RouteMode,
  RouteModeSchema,
  type RouteStatus,
  runRouteOptimizationPipeline,
  type SolverEngineId,
  SolverEngineIdSchema,
} from "../core";
import defaults from "../resources/defaults.json";

const IMPLEMENTED_SOLVERS: ReadonlySet<SolverEngineId> = new Set([
  "osrm-trip",
  "no-solver",
]);

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probeKey = "__routation_storage_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

const storageConnected = isLocalStorageAvailable();

const geoLocationArraySerializer = {
  serialize: (items: GeoLocation[]) => JSON.stringify(items),
  deserialize: (raw: string): GeoLocation[] => parseStoredGeoLocations(raw),
};

const DEFAULT_HOME = defaults.home.map((d) => createGeoLocation(d));
const DEFAULT_STOPS = defaults.stops.map((d) => createGeoLocation(d));

/**
 * Reactive application state & controller singleton (`.svelte.ts` enables Svelte 5 runes inside a class).
 * Staleness is derived declaratively (ETag-style) by comparing `#inputSignature` against `#solvedSignature`.
 */
class RouteStore {
  readonly #homeLocations = new PersistedState<GeoLocation[]>(
    "route-optimizer-home",
    DEFAULT_HOME,
    { connected: storageConnected, serializer: geoLocationArraySerializer }
  );

  readonly #stops = new PersistedState<GeoLocation[]>(
    "route-optimizer-stops",
    DEFAULT_STOPS,
    { connected: storageConnected, serializer: geoLocationArraySerializer }
  );

  readonly #mode = new PersistedState<RouteMode>(
    "route-optimizer-mode",
    "ROUND_TRIP_FASTEST",
    {
      connected: storageConnected,
      serializer: createSchemaSerializer(RouteModeSchema, "ROUND_TRIP_FASTEST"),
    }
  );

  readonly #solverEngine = new PersistedState<SolverEngineId>(
    "route-optimizer-solver",
    "osrm-trip",
    {
      connected: storageConnected,
      serializer: createSchemaSerializer(SolverEngineIdSchema, "osrm-trip"),
    }
  );

  readonly #osrmProfile = new PersistedState<OsrmProfile>(
    "route-optimizer-osrm-profile",
    "car",
    {
      connected: storageConnected,
      serializer: createSchemaSerializer(OsrmProfileSchema, "car"),
    }
  );

  isOptimizing = $state(false);
  #solvedSignature = $state<string | null>(null);

  statusMessage = $state<string | null>(null);
  errorMessage = $state<string | null>(null);
  result = $state<OptimizedRouteResult | null>(null);
  selectedLocationId = $state<string | null>(null);

  readonly #inputSignature = $derived(
    JSON.stringify([
      this.home ? `${this.home.id}:${this.home.lat},${this.home.lng}` : null,
      this.stops.map((s) => `${s.id}:${s.lat},${s.lng}`),
      this.mode,
      this.solverEngine,
      this.osrmProfile,
    ])
  );

  readonly status = $derived<RouteStatus>(
    this.isOptimizing
      ? "optimizing"
      : !this.result
        ? "unoptimized"
        : this.#solvedSignature === this.#inputSignature
          ? "optimized"
          : "stale"
  );

  get homeLocations(): GeoLocation[] {
    return this.#homeLocations.current;
  }
  set homeLocations(value: GeoLocation[]) {
    this.#homeLocations.current = value;
  }

  get stops(): GeoLocation[] {
    return this.#stops.current;
  }
  set stops(value: GeoLocation[]) {
    this.#stops.current = value;
  }

  get mode(): RouteMode {
    return this.#mode.current;
  }
  set mode(value: RouteMode) {
    this.#mode.current = value;
  }

  get solverEngine(): SolverEngineId {
    return IMPLEMENTED_SOLVERS.has(this.#solverEngine.current)
      ? this.#solverEngine.current
      : "osrm-trip";
  }
  set solverEngine(value: SolverEngineId) {
    if (!IMPLEMENTED_SOLVERS.has(value)) return;
    this.#solverEngine.current = value;
  }

  get osrmProfile(): OsrmProfile {
    return this.#osrmProfile.current;
  }
  set osrmProfile(value: OsrmProfile) {
    this.#osrmProfile.current = value;
  }

  get home(): GeoLocation | undefined {
    return this.homeLocations[0];
  }

  get selectedLocation(): GeoLocation | undefined {
    if (!this.selectedLocationId) return undefined;
    if (this.home?.id === this.selectedLocationId) return this.home;
    return this.stops.find((s) => s.id === this.selectedLocationId);
  }

  get solverBadge(): string {
    return this.solverEngine === "osrm-trip"
      ? `${this.solverEngine} • ${this.osrmProfile}`
      : this.solverEngine;
  }

  selectLocation(id: string | null) {
    if (!id) {
      this.selectedLocationId = null;
      return;
    }
    const exists =
      this.home?.id === id || this.stops.some((stop) => stop.id === id);
    if (exists) {
      this.selectedLocationId = id;
    }
  }

  async optimize(): Promise<void> {
    if (this.isOptimizing) return;

    const home = this.home;
    if (!home || this.stops.length === 0) {
      this.errorMessage = "Please lock in a Home location and at least 1 stop.";
      return;
    }

    // Ensure no stop accidentally shares `home.id` (e.g. from tampered localStorage)
    const safeStops = this.stops.map((s, idx) =>
      s.id === home.id ? { ...s, id: `${s.id}-stop-${idx}` } : s
    );

    const requestSignature = this.#inputSignature;
    this.isOptimizing = true;
    this.errorMessage = null;
    this.statusMessage = `Running ${this.solverEngine} solver...`;

    try {
      const res = await runRouteOptimizationPipeline(
        {
          home,
          stops: safeStops,
          config: {
            mode: this.mode,
            solverEngine: this.solverEngine,
            solverOptions: {
              osrmProfile: this.osrmProfile,
            },
          },
        },
        defaultProviderContext,
        (progress) => {
          this.statusMessage = progress.message;
        }
      );
      this.result = res;

      // Only overwrite `stops` and mark `"optimized"` if inputs did not change mid-flight
      if (this.#inputSignature === requestSignature) {
        const orderedNonHomeStops = res.orderedLegs
          .filter((leg) => !leg.isHome)
          .map((leg) => leg.stop);
        if (orderedNonHomeStops.length > 0) {
          this.#stops.current = orderedNonHomeStops;
        }
        this.#solvedSignature = this.#inputSignature;
      } else {
        this.#solvedSignature = requestSignature;
      }
      this.statusMessage = null;
    } catch (err) {
      this.errorMessage =
        err instanceof Error ? err.message : "Route optimization failed";
      this.statusMessage = null;
    } finally {
      this.isOptimizing = false;
    }
  }
}

export const routeStore = new RouteStore();
