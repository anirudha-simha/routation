import { ProviderContext } from "../context";
import { haversineMeters } from "../geo";
import {
  attachHomeToStops,
  RouteLegMetric,
  RouteSolver,
  SolverInput,
  SolverOutput,
  toLineStringFeatureCollection,
} from "./solver";

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
    this.validate(input);
    const orderedStops = attachHomeToStops(
      input.home,
      input.stops,
      input.mode
    );

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

    const routeGeoJson = toLineStringFeatureCollection(
      orderedStops.map((stop) => [stop.lng, stop.lat])
    );

    return {
      orderedStops,
      legs,
      routeGeoJson,
    };
  }
}
