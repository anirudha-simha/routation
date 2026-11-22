import { describe, expect, it } from "vitest";
import {
  buildBridgedGoogleMapsLinks,
  chunkWithOverlap,
  GeoLocation,
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
