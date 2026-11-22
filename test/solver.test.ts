import { describe, expect, it } from "vitest";
import {
  createDefaultContext,
  createRateLimiter,
  GeoLocation,
  haversineMeters,
  orientRoundTripLoop,
  OsrmSolver,
  PhotonGeoCoder,
} from "../src/core";

describe("parseCoordinateInput & haversineMeters", () => {
  it("parses valid lat,lng strings and rejects non-coordinates", () => {
    const geocoder = new PhotonGeoCoder();
    expect(geocoder.parseCoordinateInput("37.7955, -122.3937")).toEqual({
      lat: 37.7955,
      lng: -122.3937,
    });
    expect(
      geocoder.parseCoordinateInput("Ferry Building San Francisco CA")
    ).toBeNull();
    expect(geocoder.parseCoordinateInput("95.0, -122.0")).toBeNull();
  });

  it("computes Haversine distance between San Francisco and San Jose (~60–75 km)", () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const sanJose = { lat: 37.3382, lng: -121.8863 };
    const meters = haversineMeters(sf, sanJose);
    expect(meters).toBeGreaterThan(60_000);
    expect(meters).toBeLessThan(75_000);
  });
});

describe("orientRoundTripLoop", () => {
  it("keeps forward loop untouched for ROUND_TRIP_FASTEST", () => {
    const res = orientRoundTripLoop({
      cycleFromHome: [0, 1, 2, 3],
      mode: "ROUND_TRIP_FASTEST",
      forwardFirstLegSeconds: 300,
      forwardLastLegSeconds: 900,
    });
    expect(res).toEqual({ orderedIndices: [0, 1, 2, 3, 0], reversed: false });
  });

  it("reverses round-trip loop in ROUND_TRIP_END_CLOSEST_TO_HOME when first leg is shorter than last leg", () => {
    const res = orientRoundTripLoop({
      cycleFromHome: [0, 1, 2, 3],
      mode: "ROUND_TRIP_END_CLOSEST_TO_HOME",
      forwardFirstLegSeconds: 300,
      forwardLastLegSeconds: 900,
    });
    expect(res).toEqual({ orderedIndices: [0, 3, 2, 1, 0], reversed: true });
  });

  it("reverses round-trip loop in ROUND_TRIP_START_CLOSEST_TO_HOME when last leg is shorter than first leg", () => {
    const res = orientRoundTripLoop({
      cycleFromHome: [0, 1, 2, 3],
      mode: "ROUND_TRIP_START_CLOSEST_TO_HOME",
      forwardFirstLegSeconds: 900,
      forwardLastLegSeconds: 300,
    });
    expect(res).toEqual({ orderedIndices: [0, 3, 2, 1, 0], reversed: true });
  });
});

describe("OsrmSolver (fixture tests)", () => {
  const home = new GeoLocation({
    id: "home",
    name: "Home",
    lat: 37.7955,
    lng: -122.3937,
  });
  const s1 = new GeoLocation({
    id: "s1",
    name: "Stop 1",
    lat: 37.8024,
    lng: -122.4058,
  });
  const s2 = new GeoLocation({
    id: "s2",
    name: "Stop 2",
    lat: 37.7544,
    lng: -122.4477,
  });

  it("uses native roundtrip=false&source=any&destination=last for OPEN_START_END_AT_HOME in 1 call", async () => {
    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      calledUrls.push(String(input));
      return new Response(
        JSON.stringify({
          code: "Ok",
          // Input order sent for OPEN_START_END_AT_HOME is [s1, s2, home]
          // Suppose solved order is s2 (0) -> s1 (1) -> home (2)
          waypoints: [
            { waypoint_index: 1, trips_index: 0, location: [s1.lng, s1.lat], name: "S1" },
            { waypoint_index: 0, trips_index: 0, location: [s2.lng, s2.lat], name: "S2" },
            { waypoint_index: 2, trips_index: 0, location: [home.lng, home.lat], name: "Home" },
          ],
          trips: [
            {
              distance: 25000,
              duration: 1800,
              legs: [
                { distance: 20000, duration: 1400 },
                { distance: 5000, duration: 400 },
              ],
              geometry: {
                type: "LineString",
                coordinates: [
                  [s2.lng, s2.lat],
                  [s1.lng, s1.lat],
                  [home.lng, home.lat],
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const ctx = createDefaultContext({
      fetch: mockFetch,
      defaultLimiter: createRateLimiter(0),
    });
    const solver = new OsrmSolver();
    const out = await solver.solve(
      {
        home,
        stops: [s1, s2],
        mode: "OPEN_START_END_AT_HOME",
        solverOptions: { osrmProfile: "bike" },
      },
      ctx
    );

    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain("routing.openstreetmap.de/routed-bike/trip/v1/bike/");
    expect(calledUrls[0]).toContain("roundtrip=false");
    expect(calledUrls[0]).toContain("source=any");
    expect(calledUrls[0]).toContain("destination=last");
    expect(out.orderedStops.map((s) => s.id)).toEqual(["s2", "s1", "home"]);
    expect(out.routeGeoJson.features).toHaveLength(1);
  });

  it("reverses round-trip loop via /route when ROUND_TRIP_END_CLOSEST_TO_HOME needs reversal", async () => {
    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes("/trip/")) {
        return new Response(
          JSON.stringify({
            code: "Ok",
            waypoints: [
              { waypoint_index: 0, trips_index: 0, location: [home.lng, home.lat], name: "Home" },
              { waypoint_index: 1, trips_index: 0, location: [s1.lng, s1.lat], name: "S1" },
              { waypoint_index: 2, trips_index: 0, location: [s2.lng, s2.lat], name: "S2" },
            ],
            trips: [
              {
                distance: 35000,
                duration: 2400,
                legs: [
                  { distance: 5000, duration: 300 },  // Home -> s1 (short!)
                  { distance: 15000, duration: 1100 },
                  { distance: 15000, duration: 1000 }, // s2 -> Home (long!)
                ],
                geometry: { type: "LineString", coordinates: [] },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Follow-up /route call for reversed order [home, s2, s1, home]
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 35500,
              duration: 2450,
              legs: [
                { distance: 15500, duration: 1050 },
                { distance: 15000, duration: 1100 },
                { distance: 5000, duration: 300 },
              ],
              geometry: {
                type: "LineString",
                coordinates: [
                  [home.lng, home.lat],
                  [s2.lng, s2.lat],
                  [s1.lng, s1.lat],
                  [home.lng, home.lat],
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const ctx = createDefaultContext({
      fetch: mockFetch,
      defaultLimiter: createRateLimiter(0),
    });
    const solver = new OsrmSolver();
    const out = await solver.solve(
      {
        home,
        stops: [s1, s2],
        mode: "ROUND_TRIP_END_CLOSEST_TO_HOME",
        solverOptions: { osrmProfile: "car" },
      },
      ctx
    );

    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[0]).toContain("/routed-car/trip/v1/driving/");
    expect(calledUrls[1]).toContain("/routed-car/route/v1/driving/");
    expect(out.orderedStops.map((s) => s.id)).toEqual([
      "home",
      "s2",
      "s1",
      "home",
    ]);
    expect(out.legs[2].durationSeconds).toBe(300);
  });
});
