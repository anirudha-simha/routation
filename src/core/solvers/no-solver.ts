import { ProviderContext } from "../context";
import { haversineMeters } from "../geo";
import { GeoLocation } from "../types";
import { RouteLegMetric, RouteSolver, SolverInput, SolverOutput } from "./solver";

const APPROX_METERS_PER_SECOND = 13.4112; // ~30 mph average straight-line estimate

/**
 * Pass-through solver ("no-solver"): keeps the user's current stop order as-is,
 * attaches Home at the start/end based on `input.mode`, and builds a straight-line
 * GeoJSON LineString connecting all points in order.
 */
export class NoSolver extends RouteSolver {
  readonly id = "no-solver" as const;
  readonly label = "No Solver (As-Is Stop Order)";

  override async solve(
    input: SolverInput,
    _ctx: ProviderContext
  ): Promise<SolverOutput> {
    const { home, stops, mode } = input;

    let orderedStops: GeoLocation[];
    if (mode === "OPEN_END_START_AT_HOME") {
      orderedStops = [home, ...stops];
    } else if (mode === "OPEN_START_END_AT_HOME") {
      orderedStops = [...stops, home];
    } else {
      orderedStops = [home, ...stops, home];
    }

    const legs: RouteLegMetric[] = [];
    for (let i = 0; i < orderedStops.length - 1; i++) {
      const distanceMeters = haversineMeters(
        orderedStops[i],
        orderedStops[i + 1]
      );
      const durationSeconds = Math.round(
        distanceMeters / APPROX_METERS_PER_SECOND
      );
      legs.push({ distanceMeters, durationSeconds });
    }

    const routeGeoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    return {
      orderedStops,
      legs,
      routeGeoJson,
    };
  }
}
