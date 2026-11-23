import { FiniteStateMachine, PersistedState } from "runed";
import {
  type ByokProviderId,
  createDefaultContext,
  GeoLocation,
  type LocalMatrixSource,
  type OptimizedRouteResult,
  type OsrmProfile,
  type RouteEvent,
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
 * 3. Strips cached `fullAddress` and re-hydrates each item via `new GeoLocation(rest)`
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
        .map(
          ({ fullAddress: _ignored, ...rest }) =>
            new GeoLocation(
              rest as unknown as ConstructorParameters<typeof GeoLocation>[0]
            )
        );
    } catch {
      return [];
    }
  },
};

const DEFAULT_HOME = defaults.home.map((d) => new GeoLocation(d));
const DEFAULT_STOPS = defaults.stops.map((d) => new GeoLocation(d));

/**
 * Reactive application state & controller singleton (`.svelte.ts` enables Svelte 5 runes inside a class).
 */
class RouteStore {
  #homeLocations = new PersistedState<GeoLocation[]>(
    "route-optimizer-home",
    DEFAULT_HOME,
    { serializer: geoLocationArraySerializer }
  );

  #stops = new PersistedState<GeoLocation[]>(
    "route-optimizer-stops",
    DEFAULT_STOPS,
    { serializer: geoLocationArraySerializer }
  );

  #mode = new PersistedState<RouteMode>(
    "route-optimizer-mode",
    "ROUND_TRIP_FASTEST"
  );

  #solverEngine = new PersistedState<SolverEngineId>(
    "route-optimizer-solver",
    "osrm-trip"
  );

  #osrmProfile = new PersistedState<OsrmProfile>(
    "route-optimizer-osrm-profile",
    "car"
  );

  readonly #providerCtx = createDefaultContext();

  localMatrixSource = $state<LocalMatrixSource>("osrm-table");
  byokProvider = $state<ByokProviderId>("openrouteservice");
  apiKey = $state("");

  statusMessage = $state<string | null>(null);
  errorMessage = $state<string | null>(null);
  result = $state<OptimizedRouteResult | null>(null);
  selectedLocationId = $state<string | null>(null);

  fsm = new FiniteStateMachine<RouteStatus, RouteEvent>("unoptimized", {
    unoptimized: {
      OPTIMIZE_START: "optimizing",
    },
    optimizing: {
      OPTIMIZE_SUCCESS: "optimized",
      OPTIMIZE_ERROR: () => (this.result ? "stale" : "unoptimized"),
    },
    optimized: {
      INPUTS_CHANGED: "stale",
      OPTIMIZE_START: "optimizing",
    },
    stale: {
      OPTIMIZE_START: "optimizing",
    },
  });

  get status(): RouteStatus {
    return this.fsm.current;
  }

  get homeLocations(): GeoLocation[] {
    return this.#homeLocations.current;
  }
  set homeLocations(value: GeoLocation[]) {
    this.#homeLocations.current = value;
    this.fsm.send("INPUTS_CHANGED");
  }

  get stops(): GeoLocation[] {
    return this.#stops.current;
  }
  set stops(value: GeoLocation[]) {
    this.#stops.current = value;
    this.fsm.send("INPUTS_CHANGED");
  }

  get mode(): RouteMode {
    return this.#mode.current;
  }
  set mode(value: RouteMode) {
    this.#mode.current = value;
    this.fsm.send("INPUTS_CHANGED");
  }

  get solverEngine(): SolverEngineId {
    return this.#solverEngine.current;
  }
  set solverEngine(value: SolverEngineId) {
    this.#solverEngine.current = value;
    this.fsm.send("INPUTS_CHANGED");
  }

  get osrmProfile(): OsrmProfile {
    return this.#osrmProfile.current;
  }
  set osrmProfile(value: OsrmProfile) {
    this.#osrmProfile.current = value;
    this.fsm.send("INPUTS_CHANGED");
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
    if (this.status === "optimizing") return;

    const home = this.home;
    if (!home || this.stops.length === 0) {
      this.errorMessage = "Please lock in a Home location and at least 1 stop.";
      return;
    }

    this.fsm.send("OPTIMIZE_START");
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
        this.#providerCtx,
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
      this.fsm.send("OPTIMIZE_SUCCESS");
      this.statusMessage = null;
    } catch (err) {
      this.fsm.send("OPTIMIZE_ERROR");
      this.errorMessage =
        err instanceof Error ? err.message : "Route optimization failed";
      this.statusMessage = null;
    }
  }
}

export const routeStore = new RouteStore();
