import { createDefaultContext, ProviderContext } from "./context";
import { GoogleMapsLinkBuilder } from "./google-maps-link";
import { NoSolver } from "./solvers/no-solver";
import { OsrmSolver } from "./solvers/osrm";
import { RouteSolver, SolverInput, SolverOutput } from "./solvers/solver";
import {
  GeoLocation,
  OptimizedRouteResult,
  OptimizerConfig,
  OrderedStopLeg,
  SolverEngineId,
} from "./types";

export interface PipelineInput {
  home: GeoLocation;
  stops: GeoLocation[];
  config: OptimizerConfig;
}

export type PipelineProgressCallback = (event: {
  phase: "solving" | "done";
  message: string;
}) => void;

function getSolver(engineId: SolverEngineId): RouteSolver {
  switch (engineId) {
    case "no-solver":
      return new NoSolver();
    case "osrm-trip":
      return new OsrmSolver();
    default:
      throw new Error(`Solver engine "${engineId}" is not implemented yet.`);
  }
}

/**
 * Pure helper that converts a solver's ordered stops and leg metrics into
 * cumulative `OrderedStopLeg` entries for itinerary display and summary stats.
 */
export function buildOrderedLegs(
  home: GeoLocation,
  solverOutput: SolverOutput
): OrderedStopLeg[] {
  let cumulativeDurationSeconds = 0;
  let cumulativeDistanceMeters = 0;
  let stopSequenceCounter = 0;

  return solverOutput.orderedStops.map((stop, idx) => {
    const prevLeg = idx > 0 ? solverOutput.legs[idx - 1] : undefined;
    const legDurationSeconds = prevLeg?.durationSeconds ?? 0;
    const legDistanceMeters = prevLeg?.distanceMeters ?? 0;

    cumulativeDurationSeconds += legDurationSeconds;
    cumulativeDistanceMeters += legDistanceMeters;

    const isHome = stop.id === home.id;
    const sequenceNumber = isHome ? 0 : ++stopSequenceCounter;

    return {
      sequenceNumber,
      stop,
      isHome,
      legDurationSeconds,
      legDistanceMeters,
      cumulativeDurationSeconds,
      cumulativeDistanceMeters,
    };
  });
}

/**
 * End-to-end route optimization pipeline:
 * 1. Resolves the requested `RouteSolver`.
 * 2. Validates inputs (base checks + solver-specific checks).
 * 3. Runs `solver.solve(...)`.
 * 4. Maps ordered stops + leg metrics via `buildOrderedLegs(...)`.
 */
export async function runRouteOptimizationPipeline(
  input: PipelineInput,
  ctx: ProviderContext = createDefaultContext(),
  onProgress?: PipelineProgressCallback
): Promise<OptimizedRouteResult> {
  const { home, stops, config } = input;
  const { solverEngine, mode, solverOptions } = config;

  const solver = getSolver(solverEngine);
  const solverInput: SolverInput = {
    home,
    stops,
    mode,
    solverOptions,
  };

  // Run base + solver-specific validation immediately before executing
  solver.validate(solverInput);

  onProgress?.({
    phase: "solving",
    message: `Running ${solverEngine} on ${stops.length} stops...`,
  });

  const solverOutput = await solver.solve(solverInput, ctx);
  const orderedLegs = buildOrderedLegs(home, solverOutput);
  const lastLeg = orderedLegs[orderedLegs.length - 1];

  const travelMode = solverOptions?.osrmProfile ?? "car";
  const googleMapsLinks = new GoogleMapsLinkBuilder().buildDirectionsLink(
    travelMode,
    solverOutput.orderedStops
  );

  onProgress?.({
    phase: "done",
    message: "Route optimization complete.",
  });

  return {
    mode,
    solverEngine,
    home,
    orderedLegs,
    totalDurationSeconds: lastLeg?.cumulativeDurationSeconds ?? 0,
    totalDistanceMeters: lastLeg?.cumulativeDistanceMeters ?? 0,
    routeGeoJson: solverOutput.routeGeoJson,
    googleMapsLinks,
  };
}
