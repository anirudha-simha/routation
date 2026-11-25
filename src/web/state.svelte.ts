import { PersistedState } from "runed";
import {
  buildShareableRouteUrl,
  createGeoLocation,
  createSchemaSerializer,
  defaultProviderContext,
  type GeoLocation,
  type LatLng,
  type OptimizedRouteResult,
  type OsrmProfile,
  OsrmProfileSchema,
  parseSharedRouteHash,
  parseStoredGeoLocations,
  photonGeoCoder,
  type RouteMode,
  RouteModeSchema,
  type RouteStatus,
  runRouteOptimizationPipeline,
  type SharedRouteState,
  type SolverEngineId,
  SolverEngineIdSchema,
} from "../core";
import defaults from "../resources/defaults.json";

const IMPLEMENTED_SOLVERS: ReadonlySet<SolverEngineId> = new Set([
  "osrm-trip",
  "osrm-route",
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

const DEFAULT_HOME = defaults.home.map(createGeoLocation);
const DEFAULT_STOPS = defaults.stops.map(createGeoLocation);

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
  isDroppingPin = $state(false);
  #solvedSignature = $state<string | null>(null);

  statusMessage = $state<string | null>(null);
  errorMessage = $state<string | null>(null);
  result = $state<OptimizedRouteResult | null>(null);
  selectedLocationId = $state<string | null>(null);

  constructor() {
    if (typeof window !== "undefined") {
      void this.#hydrateFromUrlHash();
      window.addEventListener("hashchange", () => {
        void this.#hydrateFromUrlHash();
      });
    }
  }

  async #hydrateFromUrlHash(): Promise<void> {
    const parsed = await parseSharedRouteHash(window.location.hash);
    if (parsed.status === "none") return;

    // Clear the consumed `#r=` fragment so re-pasting the same link later always triggers `hashchange`
    this.#clearUrlHash();

    if (parsed.status === "invalid") {
      this.statusMessage = null;
      this.errorMessage = parsed.reason;
      return;
    }

    this.applySharedRoute(parsed.state);
  }

  #resetRouteOutput(): void {
    this.result = null;
    this.#solvedSignature = null;
    this.errorMessage = null;
    this.statusMessage = null;
  }

  #clearUrlHash(): void {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  applySharedRoute(shared: SharedRouteState): void {
    this.selectedLocationId = null;
    this.#homeLocations.current = shared.home ? [shared.home] : [];
    this.#stops.current = shared.stops;
    this.#mode.current = shared.mode;
    if (IMPLEMENTED_SOLVERS.has(shared.solverEngine)) {
      this.#solverEngine.current = shared.solverEngine;
    }
    this.#osrmProfile.current = shared.osrmProfile;
    this.#resetRouteOutput();
    this.statusMessage = `Loaded shared route (${shared.stops.length} ${shared.stops.length === 1 ? "stop" : "stops"}). Click Optimize Route to calculate roads.`;
  }

  async buildShareUrl(): Promise<string> {
    const baseHref =
      typeof window !== "undefined"
        ? window.location.href
        : "https://routation.anirudhasimha.com/";
    return buildShareableRouteUrl(baseHref, {
      home: this.home,
      stops: this.stops,
      mode: this.mode,
      solverEngine: this.solverEngine,
      osrmProfile: this.osrmProfile,
    });
  }

  syncUrlHashFallback(url: string): void {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", url);
    }
  }

  readonly #inputSignature = $derived(
    JSON.stringify([
      this.home ? `${this.home.id}:${this.home.lat},${this.home.lng}` : null,
      this.stops.map((stop) => `${stop.id}:${stop.lat},${stop.lng}`),
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
    return this.stops.find((stop) => stop.id === this.selectedLocationId);
  }

  get solverBadge(): string {
    return this.solverEngine === "osrm-trip" || this.solverEngine === "osrm-route"
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

  clearStops() {
    if (this.selectedLocationId && this.selectedLocationId !== this.home?.id) {
      this.selectedLocationId = null;
    }
    this.#stops.current = [];
    this.#resetRouteOutput();
    this.#clearUrlHash();
  }

  resetDemo() {
    this.selectedLocationId = null;
    this.#homeLocations.current = defaults.home.map(createGeoLocation);
    this.#stops.current = defaults.stops.map(createGeoLocation);
    this.#resetRouteOutput();
    this.#clearUrlHash();
  }

  async addLocationFromCoords(coords: LatLng): Promise<void> {
    if (this.isDroppingPin) return;
    this.isDroppingPin = true;
    this.errorMessage = null;

    try {
      const resolved = await photonGeoCoder.resolve(
        `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
      );
      const entry: GeoLocation = {
        ...resolved,
        lat: coords.lat,
        lng: coords.lng,
        id: crypto.randomUUID(),
      };

      if (!this.home) {
        this.#homeLocations.current = [entry];
      } else {
        this.#stops.current = [...this.stops, entry];
      }
      this.selectedLocationId = entry.id;
    } finally {
      this.isDroppingPin = false;
    }
  }

  async keepOrderAndRoute(): Promise<void> {
    this.solverEngine = "osrm-route";
    await this.optimize();
  }

  async optimize(): Promise<void> {
    if (this.isOptimizing) return;

    const home = this.home;
    if (!home || this.stops.length === 0) {
      this.errorMessage = "Please lock in a Home location and at least 1 stop.";
      return;
    }

    // Ensure no stop accidentally shares `home.id` (e.g. from tampered localStorage)
    const safeStops = this.stops.map((stop, idx) =>
      stop.id === home.id ? { ...stop, id: `${stop.id}-stop-${idx}` } : stop
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
