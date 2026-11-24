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
  osm_type?: string;
  osm_id?: number;
}

export class PhotonGeoCoder extends AddressLookup {
  /**
   * Lower `location_bias_scale` (0.0..1.0) prioritizes geographic proximity to `bias`
   * over global OSM prominence so local branches ("Target", "Trader Joe's") rank first.
   */
  private static readonly LOCATION_BIAS_SCALE = "0.1";

  override async addressLookup(
    address: string,
    bias?: LatLng
  ): Promise<GeoLocation[]> {
    const features = await this.searchPhotonSuggestions(address, bias);
    const locations = features
      .map((f) => this.formatPhotonFeature(f))
      .filter((loc): loc is GeoLocation => loc !== null);

    // Deduplicate by `name|fullAddress` so distinct businesses in the same plaza aren't collapsed
    const seen = new Set<string>();
    return locations.filter((loc) => {
      const key = `${loc.name}|${loc.fullAddress}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  override async latLongLookup(coords: LatLng): Promise<GeoLocation[]> {
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lon: String(coords.lng),
      limit: "3",
      lang: "en",
    });

    try {
      const res = await fetch(
        `https://photon.komoot.io/reverse?${params.toString()}`
      );
      if (res.ok) {
        const data = (await res.json()) as GeoJSON.FeatureCollection<
          GeoJSON.Point,
          PhotonProperties
        >;
        const mapped = (data.features ?? [])
          .map((f) => this.formatPhotonFeature(f))
          .filter((loc): loc is GeoLocation => loc !== null);
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // Fall through to raw coordinate GeoLocation below
    }

    return [new GeoLocation({ lat: coords.lat, lng: coords.lng })];
  }

  /**
   * Fetches raw GeoJSON features from Komoot Photon for a search query,
   * optionally biased toward a center coordinate (e.g. Home Base).
   */
  async searchPhotonSuggestions(
    query: string,
    bias?: LatLng
  ): Promise<GeoJSON.Feature<GeoJSON.Point, PhotonProperties>[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }

    const params = new URLSearchParams({
      q: trimmed,
      limit: "6",
      lang: "en",
    });

    if (bias) {
      params.set("lat", bias.lat.toFixed(5));
      params.set("lon", bias.lng.toFixed(5));
      params.set("zoom", "12");
      params.set("location_bias_scale", PhotonGeoCoder.LOCATION_BIAS_SCALE);
    }

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
    const osmId =
      p.osm_type && p.osm_id ? `${p.osm_type.toUpperCase()}${p.osm_id}` : undefined;

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
      osmId,
    });
  }
}
