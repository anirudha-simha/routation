import { GeoLocation, LatLng } from "../types";
import { AddressLookup } from "./geocoder";

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  locality?: string;
  district?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export class PhotonGeoCoder extends AddressLookup {
  override async addressLookup(address: string): Promise<GeoLocation[]> {
    const features = await this.searchPhotonSuggestions(address);
    const locations = features
      .map((f) => this.formatPhotonFeature(f))
      .filter((loc): loc is GeoLocation => loc !== null);

    // Deduplicate by full formatted address so the dropdown doesn't show identical rows
    const seen = new Set<string>();
    return locations.filter((loc) => {
      if (seen.has(loc.fullAddress)) return false;
      seen.add(loc.fullAddress);
      return true;
    });
  }

  override async latLongLookup(coords: LatLng): Promise<GeoLocation[]> {
    // TODO: Fetch `https://photon.komoot.io/reverse?lat=${coords.lat}&lon=${coords.lng}`
    // and map features through `this.formatPhotonFeature(f)`!
    void coords;
    return [];
  }

  /**
   * Fetches raw GeoJSON features from Komoot Photon for a search query.
   */
  async searchPhotonSuggestions(
    query: string
  ): Promise<GeoJSON.Feature<GeoJSON.Point, PhotonProperties>[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }

    const params = new URLSearchParams({
      q: trimmed,
      limit: "5",
      lang: "en",
    });

    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as GeoJSON.FeatureCollection<
        GeoJSON.Point,
        PhotonProperties
      >;
      return data.features ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Maps a single Photon GeoJSON feature into our unified `GeoLocation` object.
   */
  formatPhotonFeature(
    f: GeoJSON.Feature<GeoJSON.Point, PhotonProperties>
  ): GeoLocation | null {
    const p = f.properties;
    const coords = f.geometry?.coordinates;
    if (!p || !coords) return null;

    const [lng, lat] = coords;

    return new GeoLocation({
      name: p.name,
      building: p.housenumber,
      street: p.street,
      lat,
      lng,
      city: p.city ?? p.locality ?? p.district ?? p.county,
      state: p.state,
      zip: p.postcode,
      country: p.country,
    });
  }
}
