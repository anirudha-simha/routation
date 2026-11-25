import { buildJsonHeaders, ProviderContext } from "../context";
import { GeoLocation, OsrmProfile, RouteMode } from "../types";
import {
  attachHomeToStops,
  orientRoundTripLoop,
  RouteLegMetric,
  RouteSolver,
  SolverInput,
  SolverOutput,
  toLineStringFeatureCollection,
} from "./solver";

interface OsrmWaypoint {
  waypoint_index: number;
  trips_index: number;
  location: [number, number];
  name: string;
}

interface OsrmLeg {
  distance: number; // meters
  duration: number; // seconds
}

interface OsrmRouteOrTrip {
  distance: number;
  duration: number;
  geometry: GeoJSON.LineString;
  legs: OsrmLeg[];
}

interface OsrmTripResponse {
  code: string;
  message?: string;
  waypoints?: OsrmWaypoint[];
  trips?: OsrmRouteOrTrip[];
}

interface OsrmRouteResponse {
  code: string;
  message?: string;
  routes?: OsrmRouteOrTrip[];
}

/**
 * Shared validation, URL builder, and response mappers for FOSSGIS OSRM solvers (`/trip` and `/route`).
 */
abstract class BaseOsrmSolver extends RouteSolver {
  protected static readonly DEFAULT_ORIGIN = "https://routing.openstreetmap.de";

  override validate(input: SolverInput): void {
    super.validate(input);
    const isRoundTrip =
      input.mode !== "OPEN_END_START_AT_HOME" &&
      input.mode !== "OPEN_START_END_AT_HOME";

    // `/route` on a round-trip sends `[home, ...stops, home]` (`stops.length + 2` points against OSRM's 100-coord cap)
    if (this.id === "osrm-route" && isRoundTrip && input.stops.length > 98) {
      throw new Error(
        "OSRM round-trip routing supports at most 98 stops (+ start/end Home = 100 coordinates)."
      );
    }
    if (input.stops.length > 99) {
      throw new Error(
        "OSRM supports at most 99 stops (+ 1 Home = 100 coordinates) per request."
      );
    }

    input.solverOptions ??= {};
    input.solverOptions.osrmProfile ??= "car";

    const profile = input.solverOptions.osrmProfile;
    if (profile !== "car" && profile !== "bike" && profile !== "foot") {
      throw new Error(`Unsupported OSRM profile: "${String(profile)}".`);
    }

    const baseUrl =
      input.solverOptions.osrmBaseUrl?.trim() ||
      `${BaseOsrmSolver.DEFAULT_ORIGIN}/routed-${profile}`;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      throw new Error(`Invalid OSRM base URL: "${baseUrl}".`);
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new Error("OSRM base URL must not contain embedded credentials.");
    }

    if (
      baseUrl.includes("?") ||
      baseUrl.includes("#") ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new Error(
        "OSRM base URL must not contain query parameters or fragments."
      );
    }

    const isLoopbackHttp =
      parsedUrl.protocol === "http:" &&
      (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");

    if (parsedUrl.protocol !== "https:" && !isLoopbackHttp) {
      throw new Error(
        `Unsupported OSRM base URL protocol "${parsedUrl.protocol}". Only https: (or http://localhost) is allowed.`
      );
    }

    if (
      !input.solverOptions.allowCustomOsrmOrigin &&
      parsedUrl.origin !== BaseOsrmSolver.DEFAULT_ORIGIN
    ) {
      throw new Error(
        `Untrusted OSRM origin "${parsedUrl.origin}". Set allowCustomOsrmOrigin to use a self-hosted server.`
      );
    }

    input.solverOptions.osrmBaseUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, "")}`;
  }

  protected resolveEndpointConfig(input: SolverInput): {
    baseUrl: string;
    osrmProfileSegment: string;
  } {
    const profile: OsrmProfile = input.solverOptions!.osrmProfile!;
    return {
      baseUrl: input.solverOptions!.osrmBaseUrl!,
      osrmProfileSegment: profile === "car" ? "driving" : profile,
    };
  }

  protected toFeatureCollection(
    geometry: GeoJSON.LineString
  ): GeoJSON.FeatureCollection {
    return toLineStringFeatureCollection(
      geometry.coordinates as [number, number][]
    );
  }

  protected toLegMetrics(legs: OsrmLeg[]): RouteLegMetric[] {
    return legs.map((leg) => ({
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
    }));
  }

  protected buildUrl(
    baseUrl: string,
    service: "trip" | "route",
    profileSegment: string,
    stops: GeoLocation[],
    params: URLSearchParams
  ): string {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const coords = stops.map((stop) => `${stop.lng},${stop.lat}`).join(";");
    return `${cleanBase}/${service}/v1/${profileSegment}/${coords}?${params.toString()}`;
  }

  protected async fetchRouteGeometry(
    baseUrl: string,
    osrmProfileSegment: string,
    orderedStops: GeoLocation[],
    ctx: ProviderContext
  ): Promise<OsrmRouteOrTrip> {
    const routeParams = new URLSearchParams({
      steps: "false",
      geometries: "geojson",
      overview: "full",
    });

    const routeData = await this.fetchJson<OsrmRouteResponse>(
      this.buildUrl(
        baseUrl,
        "route",
        osrmProfileSegment,
        orderedStops,
        routeParams
      ),
      ctx
    );

    if (
      routeData.code !== "Ok" ||
      !routeData.routes?.[0] ||
      routeData.routes[0].legs.length !== orderedStops.length - 1
    ) {
      throw new Error(
        `OSRM /route failed (${routeData.code}): ${routeData.message ?? "no route returned"}`
      );
    }

    return routeData.routes[0];
  }

  protected async fetchJson<T>(url: string, ctx: ProviderContext): Promise<T> {
    const headers = buildJsonHeaders(ctx);
    const res = await ctx.defaultLimiter.schedule(() =>
      ctx.fetch(url, { headers })
    );

    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }
}

/**
 * OSRM Trip API solver (`osrm-trip`) backed by FOSSGIS (`routing.openstreetmap.de/routed-{car,bike,foot}`).
 */
export class OsrmSolver extends BaseOsrmSolver {
  readonly id = "osrm-trip" as const;
  readonly label = "OSRM Optimize (FOSSGIS TSP)";

  stopsOrder(
    mode: RouteMode,
    home: GeoLocation,
    stops: GeoLocation[]
  ): GeoLocation[] {
    switch (mode) {
      case "OPEN_START_END_AT_HOME":
        return [...stops, home];
      case "OPEN_END_START_AT_HOME":
      case "ROUND_TRIP_FASTEST":
      case "ROUND_TRIP_END_CLOSEST_TO_HOME":
      case "ROUND_TRIP_START_CLOSEST_TO_HOME":
        return [home, ...stops];
      default:
        throw new Error(`Unsupported route mode: "${String(mode)}".`);
    }
  }

  buildTripParams(mode: RouteMode): URLSearchParams {
    const tripParams = new URLSearchParams({
      steps: "false",
      geometries: "geojson",
      overview: "full",
    });

    switch (mode) {
      case "OPEN_END_START_AT_HOME":
        tripParams.set("roundtrip", "false");
        tripParams.set("source", "first");
        tripParams.set("destination", "any");
        break;
      case "OPEN_START_END_AT_HOME":
        tripParams.set("roundtrip", "false");
        tripParams.set("source", "any");
        tripParams.set("destination", "last");
        break;
      case "ROUND_TRIP_FASTEST":
      case "ROUND_TRIP_END_CLOSEST_TO_HOME":
      case "ROUND_TRIP_START_CLOSEST_TO_HOME":
        tripParams.set("roundtrip", "true");
        tripParams.set("source", "first");
        break;
      default:
        throw new Error(`Unsupported route mode: "${String(mode)}".`);
    }

    return tripParams;
  }

  override async solve(
    input: SolverInput,
    ctx: ProviderContext
  ): Promise<SolverOutput> {
    this.validate(input);
    const { baseUrl, osrmProfileSegment } = this.resolveEndpointConfig(input);

    const requestStops = this.stopsOrder(input.mode, input.home, input.stops);
    const tripParams = this.buildTripParams(input.mode);

    const tripData = await this.fetchJson<OsrmTripResponse>(
      this.buildUrl(baseUrl, "trip", osrmProfileSegment, requestStops, tripParams),
      ctx
    );

    if (tripData.code !== "Ok" || !tripData.trips?.[0] || !tripData.waypoints) {
      throw new Error(
        `OSRM /trip failed (${tripData.code}): ${tripData.message ?? "no trip returned"}`
      );
    }

    if (
      tripData.trips.length !== 1 ||
      tripData.waypoints.length !== requestStops.length ||
      !tripData.waypoints.every(
        (waypoint) => waypoint && waypoint.trips_index === 0
      )
    ) {
      throw new Error(
        "One or more stops cannot be reached by road from the rest of the route."
      );
    }

    const trip = tripData.trips[0];

    const solvedInputIndices = new Array<number>(requestStops.length);
    tripData.waypoints.forEach((waypoint, inputIndex) => {
      solvedInputIndices[waypoint.waypoint_index] = inputIndex;
    });

    if (
      input.mode === "OPEN_END_START_AT_HOME" ||
      input.mode === "OPEN_START_END_AT_HOME"
    ) {
      const orderedStops = solvedInputIndices.map((idx) => requestStops[idx]);
      return {
        orderedStops,
        legs: this.toLegMetrics(trip.legs),
        routeGeoJson: this.toFeatureCollection(trip.geometry),
      };
    }

    const forwardFirstLegSeconds = trip.legs[0]?.duration ?? 0;
    const forwardLastLegSeconds =
      trip.legs[trip.legs.length - 1]?.duration ?? 0;

    const { orderedIndices, reversed } = orientRoundTripLoop({
      cycleFromHome: solvedInputIndices,
      mode: input.mode,
      forwardFirstLegSeconds,
      forwardLastLegSeconds,
    });

    const orderedStops = orderedIndices.map((idx) => requestStops[idx]);

    if (!reversed) {
      return {
        orderedStops,
        legs: this.toLegMetrics(trip.legs),
        routeGeoJson: this.toFeatureCollection(trip.geometry),
      };
    }

    const route = await this.fetchRouteGeometry(
      baseUrl,
      osrmProfileSegment,
      orderedStops,
      ctx
    );
    const reversedFirstLegSeconds = route.legs[0]?.duration ?? Infinity;
    const reversedLastLegSeconds =
      route.legs[route.legs.length - 1]?.duration ?? Infinity;

    const reversalMadeTargetWorse =
      (input.mode === "ROUND_TRIP_END_CLOSEST_TO_HOME" &&
        reversedLastLegSeconds > forwardLastLegSeconds) ||
      (input.mode === "ROUND_TRIP_START_CLOSEST_TO_HOME" &&
        reversedFirstLegSeconds > forwardFirstLegSeconds);

    if (reversalMadeTargetWorse) {
      const forwardStops = [...solvedInputIndices, 0].map(
        (idx) => requestStops[idx]
      );
      return {
        orderedStops: forwardStops,
        legs: this.toLegMetrics(trip.legs),
        routeGeoJson: this.toFeatureCollection(trip.geometry),
      };
    }

    return {
      orderedStops,
      legs: this.toLegMetrics(route.legs),
      routeGeoJson: this.toFeatureCollection(route.geometry),
    };
  }
}

/**
 * Manual-order road router (`osrm-route`): preserves the user's exact stop sequence,
 * attaches Home at the start/end per `mode`, and fetches real turn-by-turn road geometry
 * and per-leg travel durations from FOSSGIS `/route/v1/{driving,bike,foot}` in 1 request.
 */
export class OsrmRouteSolver extends BaseOsrmSolver {
  readonly id = "osrm-route" as const;
  readonly label = "Keep My Order (FOSSGIS Roads & ETAs)";

  override async solve(
    input: SolverInput,
    ctx: ProviderContext
  ): Promise<SolverOutput> {
    this.validate(input);
    const { baseUrl, osrmProfileSegment } = this.resolveEndpointConfig(input);
    const orderedStops = attachHomeToStops(
      input.home,
      input.stops,
      input.mode
    );

    const route = await this.fetchRouteGeometry(
      baseUrl,
      osrmProfileSegment,
      orderedStops,
      ctx
    );

    return {
      orderedStops,
      legs: this.toLegMetrics(route.legs),
      routeGeoJson: this.toFeatureCollection(route.geometry),
    };
  }
}
