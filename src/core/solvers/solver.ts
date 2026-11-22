import { ProviderContext } from "../context";
import {
  GeoLocation,
  RouteMode,
  SolverEngineId,
  SolverSpecificOptions,
} from "../types";

export interface RouteLegMetric {
  durationSeconds: number;
  distanceMeters: number;
}

export interface SolverInput {
  home: GeoLocation;
  stops: GeoLocation[];
  mode: RouteMode;
  solverOptions?: SolverSpecificOptions;
}

export interface SolverOutput {
  /**
   * Ordered stops for the final itinerary (including Home at the start, end, or both
   * depending on `mode`).
   */
  orderedStops: GeoLocation[];
  /**
   * Per-leg duration and distance between `orderedStops[i]` and `orderedStops[i + 1]`.
   * Length is `orderedStops.length - 1`.
   */
  legs: RouteLegMetric[];
  /**
   * Road polyline geometry for rendering on MapLibre.
   */
  routeGeoJson: GeoJSON.FeatureCollection;
}

export abstract class RouteSolver {
  abstract readonly id: SolverEngineId;
  abstract readonly label: string;

  /**
   * Base input validation shared by all solvers.
   * Subclasses can override this and call `super.validate(input)` first
   * to enforce solver-specific limits or options (e.g., OSRM max stops, BYOK API key).
   */
  validate(input: SolverInput): void {
    if (
      !input.home ||
      Number.isNaN(input.home.lat) ||
      Number.isNaN(input.home.lng)
    ) {
      throw new Error("A valid Home location with coordinates is required.");
    }

    if (!input.stops || input.stops.length === 0) {
      throw new Error("At least 1 stop is required to optimize a route.");
    }

    for (const stop of input.stops) {
      if (Number.isNaN(stop.lat) || Number.isNaN(stop.lng)) {
        throw new Error(`Stop "${stop.name}" has invalid coordinates.`);
      }
    }
  }

  abstract solve(
    input: SolverInput,
    ctx: ProviderContext
  ): Promise<SolverOutput>;
}

export type RoundTripMode = Extract<
  RouteMode,
  | "ROUND_TRIP_FASTEST"
  | "ROUND_TRIP_END_CLOSEST_TO_HOME"
  | "ROUND_TRIP_START_CLOSEST_TO_HOME"
>;

/**
 * Pure helper for orienting a closed round-trip loop starting at Home (`index 0`):
 *   `cycleFromHome = [0, s_1, s_2, ..., s_N]`
 *
 * - `ROUND_TRIP_FASTEST`: keeps `[0, s_1, ..., s_N, 0]` untouched (`reversed: false`).
 * - `ROUND_TRIP_END_CLOSEST_TO_HOME`: reverses to `[0, s_N, ..., s_1, 0]` if `0 -> s_1` is shorter than `s_N -> 0`.
 * - `ROUND_TRIP_START_CLOSEST_TO_HOME`: reverses to `[0, s_N, ..., s_1, 0]` if `s_N -> 0` is shorter than `0 -> s_1`.
 */
export function orientRoundTripLoop(params: {
  /** Closed cycle without trailing 0 repeat, e.g. `[0, s1, s2, ..., sN]` where `0` is Home. */
  cycleFromHome: number[];
  mode: RoundTripMode;
  /** Leg duration from `0 -> s1` (first leg of forward loop). */
  forwardFirstLegSeconds: number;
  /** Leg duration from `sN -> 0` (last leg of forward loop). */
  forwardLastLegSeconds: number;
}): {
  orderedIndices: number[];
  reversed: boolean;
} {
  const { cycleFromHome, mode, forwardFirstLegSeconds, forwardLastLegSeconds } =
    params;
  const rest = cycleFromHome.slice(1);

  switch (mode) {
    case "ROUND_TRIP_FASTEST":
      return { orderedIndices: [0, ...rest, 0], reversed: false };

    case "ROUND_TRIP_END_CLOSEST_TO_HOME": {
      const reversed = forwardFirstLegSeconds < forwardLastLegSeconds;
      const orderedRest = reversed ? [...rest].reverse() : rest;
      return { orderedIndices: [0, ...orderedRest, 0], reversed };
    }

    case "ROUND_TRIP_START_CLOSEST_TO_HOME": {
      const reversed = forwardLastLegSeconds < forwardFirstLegSeconds;
      const orderedRest = reversed ? [...rest].reverse() : rest;
      return { orderedIndices: [0, ...orderedRest, 0], reversed };
    }
  }
}


