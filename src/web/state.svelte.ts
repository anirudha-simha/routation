import { FiniteStateMachine, PersistedState } from "runed";
import {
  GeoLocation,
  type OptimizedRouteResult,
  type OsrmProfile,
  type RouteEvent,
  type RouteMode,
  type RouteStatus,
  type SolverEngineId,
} from "../core";

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
        // Drop cached `fullAddress` so the GeoLocation constructor freshly derives it
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

/**
 * Reactive application state singleton (`.svelte.ts` enables Svelte 5 runes inside a class).
 * - Uses `PersistedState` from `runed` so `homeLocations`, `stops`, and `mode` automatically
 *   persist to `localStorage` across page reloads and sync across tabs.
 * - Uses `FiniteStateMachine` from `runed` to track route lifecycle:
 *   `unoptimized` -> `optimizing` -> `optimized` -> `stale` (when locations/mode change after optimizing).
 */
class RouteStore {
  #homeLocations = new PersistedState<GeoLocation[]>(
    "route-optimizer-home",
    [
      new GeoLocation({
        id: "home-default",
        name: "Ferry Building",
        building: "1",
        street: "Ferry Building",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7955,
        lng: -122.3937,
      }),
    ],
    { serializer: geoLocationArraySerializer }
  );

  #stops = new PersistedState<GeoLocation[]>(
    "route-optimizer-stops",
    [
      new GeoLocation({
        id: "stop-1",
        name: "Coit Tower",
        building: "1",
        street: "Telegraph Hill Blvd",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.8024,
        lng: -122.4058,
      }),
      new GeoLocation({
        id: "stop-2",
        name: "Twin Peaks Summit",
        building: "501",
        street: "Twin Peaks Blvd",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7544,
        lng: -122.4477,
      }),
      new GeoLocation({
        id: "stop-3",
        name: "Palace of Fine Arts",
        building: "3601",
        street: "Lyon St",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.8029,
        lng: -122.4484,
      }),
      new GeoLocation({
        id: "stop-4",
        name: "Oracle Park",
        building: "24",
        street: "Willie Mays Plaza",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7786,
        lng: -122.3893,
      }),
      new GeoLocation({
        id: "stop-5",
        name: "Golden Gate Bridge Welcome Center",
        street: "Golden Gate Bridge Toll Plaza",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.8078,
        lng: -122.475,
      }),
      new GeoLocation({
        id: "stop-6",
        name: "Painted Ladies (Alamo Square)",
        street: "Steiner St & Hayes St",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7762,
        lng: -122.4328,
      }),
      new GeoLocation({
        id: "stop-7",
        name: "Fisherman's Wharf (Pier 39)",
        street: "The Embarcadero & Beach St",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.8087,
        lng: -122.4098,
      }),
      new GeoLocation({
        id: "stop-8",
        name: "Japanese Tea Garden",
        building: "75",
        street: "Hagiwara Tea Garden Dr",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7701,
        lng: -122.4704,
      }),
      new GeoLocation({
        id: "stop-9",
        name: "Mission Dolores Park",
        street: "Dolores St & 19th St",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.7596,
        lng: -122.4269,
      }),
      new GeoLocation({
        id: "stop-10",
        name: "Lombard Street Crooked Block",
        building: "1070",
        street: "Lombard St",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.8021,
        lng: -122.4187,
      }),
      new GeoLocation({
        id: "stop-11",
        name: "Chase Center",
        building: "1",
        street: "Warriors Way",
        city: "San Francisco",
        state: "California",
        country: "United States",
        lat: 37.768,
        lng: -122.3877,
      }),
    ],
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

  result = $state<OptimizedRouteResult | null>(null);

  /** ID of the currently inspected pin/stop (opens its MapView Popup and highlights the sidebar row). */
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

  selectLocation(id: string | null) {
    this.selectedLocationId = id;
  }

  startOptimizing() {
    this.fsm.send("OPTIMIZE_START");
  }

  completeOptimizing(res: OptimizedRouteResult) {
    this.result = res;
    // Update stops array to match the solver's non-Home stop visitation order so pins 1..N renumber
    const orderedNonHomeStops = res.orderedLegs
      .filter((leg) => !leg.isHome)
      .map((leg) => leg.stop);
    if (orderedNonHomeStops.length > 0) {
      this.#stops.current = orderedNonHomeStops;
    }
    this.fsm.send("OPTIMIZE_SUCCESS");
  }

  failOptimizing() {
    this.fsm.send("OPTIMIZE_ERROR");
  }
}

export const routeStore = new RouteStore();
