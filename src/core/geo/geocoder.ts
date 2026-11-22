import { GeoLocation, LatLng } from "../types";

const COORDINATE_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export abstract class AddressLookup {
  /**
   * Subclasses implement provider-specific address search (e.g. Photon `/api/?q=...`)
   * and return matching GeoLocations.
   */
  abstract addressLookup(address: string): Promise<GeoLocation[]>;

  /**
   * Subclasses implement provider-specific reverse geocoding (e.g. Photon `/reverse?lat=...&lon=...`)
   * and return matching GeoLocations.
   */
  abstract latLongLookup(coords: LatLng): Promise<GeoLocation[]>;

  /**
   * Automatically routes a raw user string to `latLongLookup` if it's a `"lat, lng"` pair,
   * or `addressLookup` if it's a place/address query.
   */
  async lookup(input: string): Promise<GeoLocation[]> {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const coords = this.parseCoordinateInput(trimmed);
    return coords
      ? this.latLongLookup(coords)
      : this.addressLookup(trimmed);
  }

  /**
   * Resolves a query string into the single best matching GeoLocation.
   */
  async resolve(input: string): Promise<GeoLocation> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Location query cannot be empty.");
    }

    const coords = this.parseCoordinateInput(trimmed);
    if (coords) {
      const results = await this.latLongLookup(coords);
      if (results.length > 0) return results[0];
      return new GeoLocation({ lat: coords.lat, lng: coords.lng });
    }

    const results = await this.lookup(trimmed);
    if (results.length === 0) {
      throw new Error(`Could not resolve location: "${trimmed}"`);
    }

    return results[0];
  }

  /**
   * Checks if a raw query string is already a `"lat, lng"` coordinate pair
   * (with valid latitude in [-90, 90] and longitude in [-180, 180]).
   */
  parseCoordinateInput(query: string): LatLng | null {
    const match = query.match(COORDINATE_REGEX);
    if (!match) return null;
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }
}
