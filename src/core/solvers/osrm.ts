import { ProviderContext } from "../context";
import { GeoLocation, OsrmProfile, RouteMode } from "../types";
import {
  orientRoundTripLoop,
  RouteLegMetric,
  RouteSolver,
  SolverInput,
  SolverOutput,
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
 * OSRM Trip API solver backed by FOSSGIS (`routing.openstreetmap.de/routed-{car,bike,foot}`).
 *
 * - Open-ended modes (`OPEN_END_START_AT_HOME`, `OPEN_START_END_AT_HOME`) use FOSSGIS's native
 *   `roundtrip=false` with `source=first&destination=any` or `source=any&destination=last` in 1 call.
 * - Round-trip modes use `roundtrip=true&source=first` + `orientRoundTripLoop(...)`, only calling `/route`
 *   if the round-trip loop needs to be reversed to satisfy `END_CLOSEST` / `START_CLOSEST`.
 */
export class OsrmSolver extends RouteSolver {
  readonly id = "osrm-trip" as const;
  readonly label = "OSRM Trip API (FOSSGIS Server TSP)";

  override validate(input: SolverInput): void {
    super.validate(input);
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
      `https://routing.openstreetmap.de/routed-${profile}`;

    // Validate URL syntax and restrict protocol to http/https
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      throw new Error(`Invalid OSRM base URL: "${baseUrl}".`);
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error(
        `Unsupported OSRM base URL protocol "${parsedUrl.protocol}". Only http: and https: are allowed.`
      );
    }

    input.solverOptions.osrmBaseUrl = baseUrl;
  }

  /**
   * Orders input coordinates for OSRM `/trip`.
   * - `OPEN_START_END_AT_HOME` places `home` last so `destination=last` pins Home as the end.
   * - All other modes start at Home (`source=first`), so `home` must be index `0`.
   */
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
    }
  }

  /**
   * Builds the query parameters for OSRM `/trip` based on the routing mode.
   */
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
    }

    return tripParams;
  }

  override async solve(
    input: SolverInput,
    ctx: ProviderContext
  ): Promise<SolverOutput> {
    this.validate(input);

    const profile: OsrmProfile = input.solverOptions!.osrmProfile!;
    const osrmProfileSegment = profile === "car" ? "driving" : profile;
    const baseUrl = input.solverOptions!.osrmBaseUrl!;

    const requestNodes = this.stopsOrder(input.mode, input.home, input.stops);
    const tripParams = this.buildTripParams(input.mode);

    const tripData = await this.fetchJson<OsrmTripResponse>(
      this.buildUrl(baseUrl, "trip", osrmProfileSegment, requestNodes, tripParams),
      ctx
    );

    if (tripData.code !== "Ok" || !tripData.trips?.[0] || !tripData.waypoints) {
      throw new Error(
        `OSRM /trip failed (${tripData.code}): ${tripData.message ?? "no trip returned"}`
      );
    }

    const trip = tripData.trips[0];

    // OSRM returns `waypoints` in input order; `waypoint_index` is the solved visit position
    const solvedInputIndices = new Array<number>(requestNodes.length);
    tripData.waypoints.forEach((wp, inputIdx) => {
      solvedInputIndices[wp.waypoint_index] = inputIdx;
    });

    // Open modes: OSRM solved the exact open path directly in 1 request!
    if (
      input.mode === "OPEN_END_START_AT_HOME" ||
      input.mode === "OPEN_START_END_AT_HOME"
    ) {
      const orderedStops = solvedInputIndices.map((idx) => requestNodes[idx]);
      return {
        orderedStops,
        legs: this.toLegMetrics(trip.legs),
        routeGeoJson: this.toFeatureCollection(trip.geometry),
      };
    }

    // Round-trip modes: apply desired loop orientation (Fastest / End Closest / Start Closest)
    const forwardFirstLegSeconds = trip.legs[0]?.duration ?? 0;
    const forwardLastLegSeconds =
      trip.legs[trip.legs.length - 1]?.duration ?? 0;

    const { orderedIndices, reversed } = orientRoundTripLoop({
      cycleFromHome: solvedInputIndices,
      mode: input.mode,
      forwardFirstLegSeconds,
      forwardLastLegSeconds,
    });

    const orderedStops = orderedIndices.map((idx) => requestNodes[idx]);

    // Forward round-trip: reuse `/trip` legs & road geometry directly (1 request total)
    if (!reversed) {
      return {
        orderedStops,
        legs: this.toLegMetrics(trip.legs),
        routeGeoJson: this.toFeatureCollection(trip.geometry),
      };
    }

    // Reversed round-trip: fetch `/route` once so road geometry & one-way leg times match reversed order
    const routeParams = new URLSearchParams({
      steps: "false",
      geometries: "geojson",
      overview: "full",
    });

    const routeData = await this.fetchJson<OsrmRouteResponse>(
      this.buildUrl(baseUrl, "route", osrmProfileSegment, orderedStops, routeParams),
      ctx
    );

    if (routeData.code !== "Ok" || !routeData.routes?.[0]) {
      throw new Error(
        `OSRM /route failed (${routeData.code}): ${routeData.message ?? "no route returned"}`
      );
    }

    const route = routeData.routes[0];
    return {
      orderedStops,
      legs: this.toLegMetrics(route.legs),
      routeGeoJson: this.toFeatureCollection(route.geometry),
    };
  }

  private toFeatureCollection(
    geometry: GeoJSON.LineString
  ): GeoJSON.FeatureCollection {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry,
        },
      ],
    };
  }

  private toLegMetrics(legs: OsrmLeg[]): RouteLegMetric[] {
    return legs.map((leg) => ({
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
    }));
  }

  private buildUrl(
    baseUrl: string,
    service: "trip" | "route",
    profileSegment: string,
    nodes: GeoLocation[],
    params: URLSearchParams
  ): string {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const coords = nodes.map((n) => `${n.lng},${n.lat}`).join(";");
    return `${cleanBase}/${service}/v1/${profileSegment}/${coords}?${params.toString()}`;
  }

  private async fetchJson<T>(url: string, ctx: ProviderContext): Promise<T> {
    const headers: Record<string, string> = {};
    if (ctx.userAgent) {
      headers["User-Agent"] = ctx.userAgent;
    }

    const res = await ctx.defaultLimiter.schedule(() =>
      ctx.fetch(url, { headers })
    );

    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }
}
