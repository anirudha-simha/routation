import { defaultProviderContext, ProviderContext } from "./context";
import { GoogleMapsLinkBuilder } from "./google-maps-link";
import { NoSolver } from "./solvers/no-solver";
import { OsrmRouteSolver, OsrmSolver } from "./solvers/osrm";
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
    case "osrm-route":
      return new OsrmRouteSolver();
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
  solverOutput: SolverOutput,
  bridgeStopIds: ReadonlySet<string> = new Set()
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
      isBridgeWaypoint: bridgeStopIds.has(stop.id) || undefined,
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
 * 4. Builds bridged Google Maps links and maps cumulative `OrderedStopLeg`s.
 */
export async function runRouteOptimizationPipeline(
  input: PipelineInput,
  ctx: ProviderContext = defaultProviderContext,
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

  solver.validate(solverInput);

  onProgress?.({
    phase: "solving",
    message: `Running ${solverEngine} on ${stops.length} stops...`,
  });

  const solverOutput = await solver.solve(solverInput, ctx);
  const travelMode = solverOptions?.osrmProfile ?? "car";
  const googleMapsLinks = GoogleMapsLinkBuilder.buildDirectionsLinks(
    solverOutput.orderedStops,
    travelMode,
    GoogleMapsLinkBuilder.MAX_STOPS_PER_LINK,
    home.id
  );

  const bridgeStopIds = new Set(
    googleMapsLinks
      .map((l) => l.bridgeStopId)
      .filter((id): id is string => Boolean(id))
  );

  const orderedLegs = buildOrderedLegs(home, solverOutput, bridgeStopIds);
  const lastLeg = orderedLegs[orderedLegs.length - 1];

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
