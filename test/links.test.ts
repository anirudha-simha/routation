import { describe, expect, it, vi } from "vitest";
import {
  buildShareableRouteUrl,
  chunkWithOverlap,
  createGeoLocation,
  createMemoryCache,
  createSchemaSerializer,
  decodeSharedRouteHash,
  encodeSharedRouteHash,
  GeoLocation,
  GoogleMapsLinkBuilder,
  InfoCardGenerator,
  parseSharedRouteHash,
  parseStoredGeoLocations,
  RouteModeSchema,
} from "../src/core";

function makeFakeStop(index: number, withStreet = true): GeoLocation {
  return createGeoLocation({
    id: `stop-${index}`,
    name: `Stop ${index}`,
    building: withStreet ? String(index) : undefined,
    street: withStreet ? "Market St" : undefined,
    city: "San Francisco",
    state: "CA",
    lat: 37.77 + index * 0.01,
    lng: -122.41 - index * 0.01,
  });
}

describe("chunkWithOverlap", () => {
  it("returns single chunk when items fit within maxChunkSize", () => {
    expect(chunkWithOverlap(["A", "B", "C"], 5)).toEqual([["A", "B", "C"]]);
  });

  it("chains consecutive chunks by 1 overlapping bridge item", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G"];
    const chunks = chunkWithOverlap(items, 3);
    expect(chunks).toEqual([
      ["A", "B", "C"],
      ["C", "D", "E"],
      ["E", "F", "G"],
    ]);
  });

  it("does not emit a trailing 1-item chunk when total hits boundary", () => {
    const items = ["A", "B", "C", "D", "E"];
    const chunks = chunkWithOverlap(items, 3);
    expect(chunks).toEqual([
      ["A", "B", "C"],
      ["C", "D", "E"],
    ]);
  });
});

describe("GoogleMapsLinkBuilder.buildDirectionsLinks", () => {
  it("builds chained 9-stop Google Maps api=1 URLs with bridge stop IDs", () => {
    const stops = Array.from({ length: 15 }, (_, i) => makeFakeStop(i + 1));
    const links = GoogleMapsLinkBuilder.buildDirectionsLinks(stops, "car", 9);

    expect(links).toHaveLength(2);
    expect(links[0].stopCount).toBe(9);
    expect(links[0].bridgeStopId).toBeUndefined();
    expect(links[1].stopCount).toBe(7); // stops 9..15
    expect(links[1].bridgeStopId).toBe("stop-9");
    expect(links[0].googleMapsUrl).toContain(
      "https://www.google.com/maps/dir/?api=1"
    );
    expect(links[0].googleMapsUrl).toContain("travelmode=driving");
  });

  it("falls back to exact coordinates when a stop lacks a street-level address", () => {
    const parkA = makeFakeStop(1, false);
    const parkB = makeFakeStop(2, false);
    const links = GoogleMapsLinkBuilder.buildDirectionsLinks([parkA, parkB], "foot");

    expect(links).toHaveLength(1);
    expect(links[0].googleMapsUrl).toContain("origin=37.780000%2C-122.420000");
    expect(links[0].googleMapsUrl).toContain("travelmode=walking");
  });
});

describe("GoogleMapsLinkBuilder place search & embed URLs", () => {
  it("includes both POI name and fullAddress so Google Maps resolves the Place Card", () => {
    const stop = makeFakeStop(1);
    const searchUrl = GoogleMapsLinkBuilder.buildPlaceSearchUrl(stop);
    const embedUrl = GoogleMapsLinkBuilder.buildPlaceEmbedUrl(stop);

    expect(searchUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Stop+1%2C+1+Market+St%2C+San+Francisco%2C+CA"
    );
    expect(embedUrl).toContain("https://maps.google.com/maps?");
    expect(embedUrl).toContain("output=embed");
    expect(embedUrl).toContain("q=Stop+1%2C+1+Market+St%2C+San+Francisco%2C+CA");
  });
});

describe("createMemoryCache singleflight & LRU", () => {
  it("coalesces concurrent getOrLoad calls and evicts oldest entries past maxEntries", async () => {
    const cache = createMemoryCache({ maxEntries: 2, ttlMs: 60_000 });
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return "value-a";
    };

    const [r1, r2] = await Promise.all([
      cache.getOrLoad("a", loader),
      cache.getOrLoad("a", loader),
    ]);
    expect(r1).toBe("value-a");
    expect(r2).toBe("value-a");
    expect(calls).toBe(1);

    await cache.set("b", "value-b");
    await cache.set("c", "value-c"); // evicts "a"
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBe("value-b");
  });
});

describe("InfoCardGenerator", () => {
  it("merges OSM extratags and Wikipedia summary while sanitizing untrusted URLs", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([
            {
              name: "Painted Ladies",
              extratags: {
                opening_hours: "Mo-Su 09:00-18:00",
                website: "https://sfrecpark.org/painted-ladies",
                phone: "+1 415-831-2700",
                wikipedia: "en:Painted Ladies",
              },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes("en.wikipedia.org/w/api.php")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "123": {
                  title: "Painted Ladies",
                  description: "Row of Victorian houses in San Francisco",
                  extract:
                    "In American architecture, painted ladies are Victorian houses.",
                  thumbnail: {
                    source:
                      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a.jpg",
                  },
                  fullurl: "https://en.wikipedia.org/wiki/Painted_Ladies",
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const generator = new InfoCardGenerator(fakeFetch);
    const stop = createGeoLocation({
      name: "Painted Ladies (Alamo Square)",
      street: "Steiner St & Hayes St",
      city: "San Francisco",
      state: "California",
      lat: 37.7762,
      lng: -122.4328,
    });

    const card = await generator.generate(stop);
    expect(card.title).toBe("Painted Ladies (Alamo Square)");
    expect(card.subtitle).toBe("Row of Victorian houses in San Francisco");
    expect(card.openingHours).toBe("Mo-Su 09:00-18:00");
    expect(card.websiteUrl).toBe("https://sfrecpark.org/painted-ladies");
    expect(card.thumbnailUrl).toContain("thumb.wikimedia.org");
    expect(card.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Painted_Ladies");
  });

  it("surfaces OSM business metadata and prefers the richest matching OSM object over transit stops", async () => {
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([
            {
              name: "Tartine Bakery",
              extratags: { public_transport: "stop_position" },
            },
            {
              name: "Tartine Bakery",
              extratags: {
                opening_hours: "Mo-Su 07:30-17:00",
                website: "https://tartinebakery.com",
                phone: "+1-415-487-2600",
                cuisine: "bakery;coffee_shop",
                wheelchair: "yes",
                description: "Famous artisan sourdough bakery in the Mission.",
              },
            },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ query: { pages: {} } }), {
        status: 200,
      });
    });

    const generator = new InfoCardGenerator(spy as unknown as typeof fetch);
    const stop = createGeoLocation({
      name: "Tartine Bakery",
      street: "600 Guerrero St",
      city: "San Francisco",
      state: "California",
      lat: 37.7614,
      lng: -122.4241,
    });

    const card = await generator.generate(stop);
    expect(card.openingHours).toBe("Mo-Su 07:30-17:00");
    expect(card.websiteUrl).toBe("https://tartinebakery.com/");
    expect(card.phone).toBe("+1-415-487-2600");
    expect(card.cuisine).toBe("Bakery • Coffee Shop");
    expect(card.wheelchair).toBe("Wheelchair accessible");
    expect(card.summary).toBe("Famous artisan sourdough bakery in the Mission.");
    expect(
      spy.mock.calls.some(([u]) => String(u).includes("overpass"))
    ).toBe(false);
  });

  it("ranks Wikipedia geosearch candidates so exact landmarks beat nearby partial matches", async () => {
    let wikiUrl = "";
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("en.wikipedia.org/w/api.php")) {
        wikiUrl = url;
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "1": {
                  title: "UCSF/Chase Center station",
                  description: "Muni Metro light rail station",
                  extract: "Light rail station outside Chase Center.",
                  fullurl: "https://en.wikipedia.org/wiki/UCSF/Chase_Center_station",
                },
                "2": {
                  title: "Chase Center",
                  description: "Indoor arena in San Francisco",
                  extract: "Chase Center is an indoor arena in Mission Bay.",
                  fullurl: "https://en.wikipedia.org/wiki/Chase_Center",
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const generator = new InfoCardGenerator(fakeFetch);
    const stop = createGeoLocation({
      name: "Chase Center",
      street: "1 Warriors Way",
      city: "San Francisco",
      state: "California",
      lat: 37.768,
      lng: -122.3877,
    });

    const card = await generator.generate(stop);
    expect(wikiUrl).toContain("ggslimit=15");
    expect(wikiUrl).toContain("pilimit=max");
    expect(wikiUrl).toContain("exlimit=max");
    expect(card.subtitle).toBe("Indoor arena in San Francisco");
    expect(card.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Chase_Center");
  });

  it("prefers OSM's explicit English wikipedia tag over a weaker proximity geosearch match", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([
            {
              name: "Fisherman's Wharf",
              extratags: {
                website: "https://fishermanswharf.org/",
                wikipedia: "en:Fisherman's Wharf, San Francisco",
              },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes("titles=Fisherman")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "42": {
                  title: "Fisherman's Wharf, San Francisco",
                  description: "Neighborhood and tourist attraction",
                  extract: "Fisherman's Wharf is a waterfront neighborhood.",
                  fullurl:
                    "https://en.wikipedia.org/wiki/Fisherman%27s_Wharf,_San_Francisco",
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "99": {
                title: "Aquarium of the Bay",
                description: "Public aquarium",
                extract: "Aquarium at Pier 39.",
              },
            },
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const generator = new InfoCardGenerator(fakeFetch);
    const stop = createGeoLocation({
      name: "Fisherman's Wharf (Pier 39)",
      street: "The Embarcadero & Beach St",
      city: "San Francisco",
      state: "California",
      lat: 37.8087,
      lng: -122.4098,
    });

    const card = await generator.generate(stop);
    expect(card.subtitle).toBe("Neighborhood and tourist attraction");
    expect(card.websiteUrl).toBe("https://fishermanswharf.org/");
  });

  it("converts OSM File: and commons.wikimedia.org/wiki/File: tags to Special:FilePath thumbnails without crashing on unescaped %", () => {
    expect(
      InfoCardGenerator.resolveCommonsThumbnail("File:Alamo Square SF.jpg")
    ).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alamo_Square_SF.jpg?width=320"
    );
    expect(
      InfoCardGenerator.resolveCommonsThumbnail("File:100% Pure SF.jpg")
    ).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/100%25_Pure_SF.jpg?width=320"
    );
    expect(
      InfoCardGenerator.resolveCommonsThumbnail(
        "https://commons.wikimedia.org/wiki/File:Alamo_Square_SF.jpg"
      )
    ).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alamo_Square_SF.jpg?width=320"
    );
  });

  it("does not cache degraded PlaceInfoCards when upstream returns HTTP 503", async () => {
    let attempts = 0;
    const flakyFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        attempts++;
        if (attempts === 1) {
          return new Response("Service Unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify([
            { name: "Coit Tower", extratags: { opening_hours: "10:00-17:00" } },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ query: { pages: {} } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const generator = new InfoCardGenerator(flakyFetch);
    const stop = createGeoLocation({
      name: "Coit Tower",
      city: "San Francisco",
      lat: 37.8024,
      lng: -122.4058,
    });

    const first = await generator.generate(stop);
    expect(first.openingHours).toBeUndefined();

    const second = await generator.generate(stop);
    expect(second.openingHours).toBe("10:00-17:00");
  });

  it("rejects dangerous non-HTTP schemes, userinfo phishing, localhost/IPs, and upgrades wikimedia http to https", () => {
    expect(InfoCardGenerator.sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("javascript:80/x")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("data:text/html,hi")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("mailto:info@shop.com")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("tel:+14155551234")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("//evil.com/path")).toBeNull();
    expect(
      InfoCardGenerator.sanitizeHttpUrl("https://sfrecpark.org@evil.com/phish")
    ).toBeNull();
    expect(
      InfoCardGenerator.sanitizeHttpUrl("http://127.0.0.1:8080/admin")
    ).toBeNull();
    expect(
      InfoCardGenerator.sanitizeHttpUrl("http://localhost:3000")
    ).toBeNull();
    expect(
      InfoCardGenerator.sanitizeTrustedWikiUrl(
        "http://upload.wikimedia.org/wikipedia/commons/a.jpg",
        "wikimedia.org"
      )
    ).toBe("https://upload.wikimedia.org/wikipedia/commons/a.jpg");
    expect(
      InfoCardGenerator.sanitizeTrustedWikiUrl(
        "https://evil-wikimedia.org/a.jpg",
        "wikimedia.org"
      )
    ).toBeUndefined();
    expect(
      InfoCardGenerator.sanitizeHttpUrl("https://anirudhasimha.com")?.hostname
    ).toBe("anirudhasimha.com");
  });
});

describe("Storage boundary Zod deserializers", () => {
  it("drops out-of-range/NaN coordinates, non-string fields, and deduplicates colliding IDs", () => {
    const raw = JSON.stringify([
      { id: "dup", name: "Valid A", lat: 37.79, lng: -122.39 },
      { id: "dup", name: "Valid B", lat: 37.8, lng: -122.4 },
      { id: "bad-lat", name: "Out of bounds", lat: 999, lng: -122.4 },
      { id: "bad-type", name: 12345, lat: 37.79, lng: -122.39 },
    ]);

    const hydrated = parseStoredGeoLocations(raw);
    expect(hydrated).toHaveLength(2);
    expect(hydrated[0].id).toBe("dup");
    expect(hydrated[1].id).toBe("dup-1");
  });

  it("falls back safely on invalid enum values or corrupted JSON", () => {
    const modeSer = createSchemaSerializer(
      RouteModeSchema,
      "ROUND_TRIP_FASTEST"
    );
    expect(modeSer.deserialize('"INVALID_MODE"')).toBe("ROUND_TRIP_FASTEST");
    expect(modeSer.deserialize("{broken-json")).toBe("ROUND_TRIP_FASTEST");
    expect(modeSer.deserialize('"OPEN_END_START_AT_HOME"')).toBe(
      "OPEN_END_START_AT_HOME"
    );
  });
});

describe("URL #hash route sharing (native gzip + Zod)", () => {
  it("round-trips Home, stops, mode, and profile into a compact #r= hash", async () => {
    const home = makeFakeStop(0);
    const stops = [makeFakeStop(1), makeFakeStop(2, false)];

    const shareUrl = await buildShareableRouteUrl(
      "https://routation.anirudhasimha.com/#old",
      {
        home,
        stops,
        mode: "ROUND_TRIP_END_CLOSEST_TO_HOME",
        solverEngine: "osrm-trip",
        osrmProfile: "bike",
      }
    );

    expect(shareUrl.startsWith("https://routation.anirudhasimha.com/#r=")).toBe(
      true
    );
    const hashPart = shareUrl.slice(shareUrl.indexOf("#"));
    const decoded = await decodeSharedRouteHash(hashPart);

    expect(decoded).not.toBeNull();
    expect(decoded?.home?.name).toBe("Stop 0");
    expect(decoded?.stops).toHaveLength(2);
    expect(decoded?.stops[0].street).toBe("Market St");
    expect(decoded?.mode).toBe("ROUND_TRIP_END_CLOSEST_TO_HOME");
    expect(decoded?.osrmProfile).toBe("bike");
  });

  it("rejects malformed, mutated, or tampered #r= hashes with explicit invalid status", async () => {
    expect(await parseSharedRouteHash("")).toEqual({ status: "none" });
    expect(await parseSharedRouteHash("#")).toEqual({ status: "none" });
    expect((await parseSharedRouteHash("#other=123")).status).toBe("invalid");
    expect((await parseSharedRouteHash("#r=not-valid-gzip")).status).toBe(
      "invalid"
    );

    const validHash = await encodeSharedRouteHash({
      home: makeFakeStop(0),
      stops: [makeFakeStop(1), makeFakeStop(2)],
      mode: "ROUND_TRIP_FASTEST",
      solverEngine: "osrm-trip",
      osrmProfile: "car",
    });

    // Mutating the final character (caught by canonical Base64URL check)
    const lastChar = validHash[validHash.length - 1];
    const flippedEnd =
      validHash.slice(0, -1) + (lastChar === "A" ? "B" : "A");
    expect((await parseSharedRouteHash(flippedEnd)).status).toBe("invalid");
    expect(await decodeSharedRouteHash(flippedEnd)).toBeNull();

    // Mutating a middle character (caught by gzip RFC 1952 CRC-32 / deflate integrity check)
    const midIdx = Math.floor(validHash.length / 2);
    const midChar = validHash[midIdx];
    const flippedMid =
      validHash.slice(0, midIdx) +
      (midChar === "A" ? "B" : "A") +
      validHash.slice(midIdx + 1);
    expect((await parseSharedRouteHash(flippedMid)).status).toBe("invalid");
    expect(await decodeSharedRouteHash(flippedMid)).toBeNull();

    // Out-of-bounds coordinates throw at encode time
    const badStop = { ...makeFakeStop(1), lat: 999 };
    await expect(
      encodeSharedRouteHash({
        stops: [badStop],
        mode: "ROUND_TRIP_FASTEST",
        solverEngine: "osrm-trip",
        osrmProfile: "car",
      })
    ).rejects.toThrow("out-of-range");
  });

  it("runs Zod validation in jitless mode without invoking dynamic Function/eval under strict CSP", async () => {
    const OriginalFunction = globalThis.Function;
    let dynamicFunctionCalls = 0;
    globalThis.Function = new Proxy(OriginalFunction, {
      construct(target, args, newTarget) {
        dynamicFunctionCalls++;
        return Reflect.construct(target, args, newTarget);
      },
      apply(target, thisArg, args) {
        dynamicFunctionCalls++;
        return Reflect.apply(target, thisArg, args);
      },
    });

    try {
      const parsed = parseStoredGeoLocations(
        JSON.stringify([{ name: "Test Stop", lat: 37.77, lng: -122.41 }])
      );
      expect(parsed).toHaveLength(1);
      const hash = await encodeSharedRouteHash({
        stops: parsed,
        mode: "ROUND_TRIP_FASTEST",
        solverEngine: "osrm-trip",
        osrmProfile: "car",
      });
      expect((await parseSharedRouteHash(hash)).status).toBe("ok");
      expect(dynamicFunctionCalls).toBe(0);
    } finally {
      globalThis.Function = OriginalFunction;
    }
  });
});
