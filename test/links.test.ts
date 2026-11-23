import { describe, expect, it, vi } from "vitest";
import {
  buildBridgedGoogleMapsLinks,
  chunkWithOverlap,
  GeoLocation,
  GoogleMapsLinkBuilder,
  InfoCardGenerator,
} from "../src/core";

function makeFakeStop(index: number): GeoLocation {
  return new GeoLocation({
    id: `stop-${index}`,
    name: `Stop ${index}`,
    address: `${index} Market St, San Francisco, CA`,
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

describe("buildBridgedGoogleMapsLinks", () => {
  it("builds chained 10-point Google Maps api=1 URLs with bridge stop IDs", () => {
    const stops = Array.from({ length: 15 }, (_, i) => makeFakeStop(i + 1));
    const links = buildBridgedGoogleMapsLinks(stops, 10);

    expect(links).toHaveLength(2);
    expect(links[0].stopCount).toBe(10);
    expect(links[0].bridgeStopId).toBeUndefined();
    expect(links[1].stopCount).toBe(6); // stops 10..15
    expect(links[1].bridgeStopId).toBe("stop-10");
    expect(links[0].googleMapsUrl).toContain(
      "https://www.google.com/maps/dir/?api=1"
    );
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

describe("InfoCardGenerator", () => {
  it("merges OSM extratags and Wikipedia summary while sanitizing untrusted URLs", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify({
            name: "Painted Ladies",
            extratags: {
              opening_hours: "Mo-Su 09:00-18:00",
              website: "https://sfrecpark.org/painted-ladies",
              phone: "+1 415-831-2700",
              wikipedia: "en:Painted Ladies",
            },
          }),
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
    const stop = new GeoLocation({
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

  it("converts OSM File: and commons.wikimedia.org/wiki/File: tags to Special:FilePath thumbnails", () => {
    expect(
      InfoCardGenerator.resolveCommonsThumbnail("File:Alamo Square SF.jpg")
    ).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alamo_Square_SF.jpg?width=320"
    );
    expect(
      InfoCardGenerator.resolveCommonsThumbnail(
        "https://commons.wikimedia.org/wiki/File:Alamo_Square_SF.jpg"
      )
    ).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alamo_Square_SF.jpg?width=320"
    );
  });

  it("rejects dangerous non-HTTP schemes in sanitizeHttpUrl", () => {
    expect(InfoCardGenerator.sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(InfoCardGenerator.sanitizeHttpUrl("data:text/html,hi")).toBeNull();
    expect(
      InfoCardGenerator.sanitizeHttpUrl("https://anirudhasimha.com")?.hostname
    ).toBe("anirudhasimha.com");
  });
});
