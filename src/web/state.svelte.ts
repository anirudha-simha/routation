import { PersistedState } from "runed";
import {
  type ByokProviderId,
  createGeoLocation,
  defaultProviderContext,
  type GeoLocation,
  type GeoLocationInit,
  type LocalMatrixSource,
  type OptimizedRouteResult,
  type OsrmProfile,
  type RouteMode,
  type RouteStatus,
  runRouteOptimizationPipeline,
  type SolverEngineId,
} from "../core";
import defaults from "../resources/defaults.json";

/**
 * Custom `PersistedState` serializer for `GeoLocation[]` arrays in `localStorage`:
 * 1. Safely catches malformed/corrupted `localStorage` JSON without crashing startup.
 * 2. Filters out any invalid items missing numeric `lat` / `lng`.
 * 3. Strips cached `fullAddress` and re-hydrates each item via `createGeoLocation`
 *    so derived address fields stay up to date.
 */
const geoLocationArraySerializer = {
  serialize: (items: GeoLocation[]) => JSON.stringify(items),
  deserialize: (raw: string): GeoLocation[] => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).lat === "number" &&
            typeof (item as Record<string, unknown>).lng === "number"
        )
        .map(({ fullAddress: _ignored, ...rest }) =>
          createGeoLocation(rest as unknown as GeoLocationInit)
        );
    } catch {
      return [];
    }
  },
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
    { serializer: geoLocationArraySerializer }
  );

  readonly #stops = new PersistedState<GeoLocation[]>(
    "route-optimizer-stops",
    DEFAULT_STOPS,
    { serializer: geoLocationArraySerializer }
  );

  readonly #mode = new PersistedState<RouteMode>(
    "route-optimizer-mode",
    "ROUND_TRIP_FASTEST"
  );

  readonly #solverEngine = new PersistedState<SolverEngineId>(
    "route-optimizer-solver",
    "osrm-trip"
  );

  readonly #osrmProfile = new PersistedState<OsrmProfile>(
    "route-optimizer-osrm-profile",
    "car"
  );

  localMatrixSource = $state<LocalMatrixSource>("osrm-table");
  byokProvider = $state<ByokProviderId>("openrouteservice");
  apiKey = $state("");

  isOptimizing = $state(false);
  #solvedSignature = $state<string | null>(null);

  statusMessage = $state<string | null>(null);
  errorMessage = $state<string | null>(null);
  result = $state<OptimizedRouteResult | null>(null);
  selectedLocationId = $state<string | null>(null);

  readonly #inputSignature = $derived(
    JSON.stringify([
      this.home?.id,
      this.stops.map((s) => s.id),
      this.mode,
      this.solverEngine,
      this.osrmProfile,
      this.localMatrixSource,
      this.byokProvider,
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
    return this.#solverEngine.current;
  }
  set solverEngine(value: SolverEngineId) {
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
    this.selectedLocationId = id;
  }

  async optimize(): Promise<void> {
    if (this.isOptimizing) return;

    const home = this.home;
    if (!home || this.stops.length === 0) {
      this.errorMessage = "Please lock in a Home location and at least 1 stop.";
      return;
    }

    this.isOptimizing = true;
    this.errorMessage = null;
    this.statusMessage = `Running ${this.solverEngine} solver...`;

    try {
      const res = await runRouteOptimizationPipeline(
        {
          home,
          stops: this.stops,
          config: {
            mode: this.mode,
            solverEngine: this.solverEngine,
            solverOptions: {
              osrmProfile: this.osrmProfile,
              localMatrixSource: this.localMatrixSource,
              byokProvider: this.byokProvider,
              apiKey: this.apiKey.trim() || undefined,
            },
          },
        },
        defaultProviderContext,
        (progress) => {
          this.statusMessage = progress.message;
        }
      );
      this.result = res;
      const orderedNonHomeStops = res.orderedLegs
        .filter((leg) => !leg.isHome)
        .map((leg) => leg.stop);
      if (orderedNonHomeStops.length > 0) {
        this.#stops.current = orderedNonHomeStops;
      }
      this.#solvedSignature = this.#inputSignature;
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
