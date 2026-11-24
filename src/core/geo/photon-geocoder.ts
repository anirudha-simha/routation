import {
  createDefaultContext,
  defaultProviderContext,
  type ProviderContext,
} from "../context";
import { createGeoLocation, GeoLocation, LatLng } from "../types";
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

  private readonly ctx: ProviderContext;

  constructor(ctxOrFetch: ProviderContext | typeof fetch = defaultProviderContext) {
    super();
    this.ctx =
      typeof ctxOrFetch === "function"
        ? createDefaultContext({
            fetch: ctxOrFetch,
            defaultLimiter: { schedule: (fn) => fn() },
          })
        : ctxOrFetch;
  }

  override async addressLookup(
    address: string,
    bias?: LatLng,
    signal?: AbortSignal
  ): Promise<GeoLocation[]> {
    const features = await this.searchPhotonSuggestions(address, bias, signal);
    const locations = features
      .map((f) => this.formatPhotonFeature(f))
      .filter((loc): loc is GeoLocation => loc !== null);

    // Deduplicate by `name|fullAddress|roundedCoords` so distinct branches on the same road survive
    const seen = new Set<string>();
    return locations.filter((loc) => {
      const key = `${loc.name}|${loc.fullAddress}|${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  override async latLongLookup(
    coords: LatLng,
    signal?: AbortSignal
  ): Promise<GeoLocation[]> {
    const cacheKey = `photon:rev:${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    const cached = await this.ctx.cache.get<GeoLocation[]>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      lat: String(coords.lat),
      lon: String(coords.lng),
      limit: "3",
      lang: "en",
    });

    try {
      const res = await this.fetchPhoton(
        `https://photon.komoot.io/reverse?${params.toString()}`,
        signal
      );
      if (res.ok) {
        const data = (await res.json()) as GeoJSON.FeatureCollection<
          GeoJSON.Point,
          PhotonProperties
        >;
        const mapped = (data.features ?? [])
          .map((f) => this.formatPhotonFeature(f))
          .filter((loc): loc is GeoLocation => loc !== null);
        if (mapped.length > 0) {
          await this.ctx.cache.set(cacheKey, mapped);
          return mapped;
        }
      }
    } catch {
      // Fall through to raw coordinate GeoLocation below
    }

    return [createGeoLocation({ lat: coords.lat, lng: coords.lng })];
  }

  /**
   * Fetches raw GeoJSON features from Komoot Photon for a search query,
   * optionally biased toward a center coordinate (e.g. Home Base).
   */
  async searchPhotonSuggestions(
    query: string,
    bias?: LatLng,
    signal?: AbortSignal
  ): Promise<GeoJSON.Feature<GeoJSON.Point, PhotonProperties>[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }

    const biasKey = bias ? `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}` : "none";
    const cacheKey = `photon:q:${trimmed.toLowerCase()}:${biasKey}`;
    const cached =
      await this.ctx.cache.get<
        GeoJSON.Feature<GeoJSON.Point, PhotonProperties>[]
      >(cacheKey);
    if (cached) return cached;

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
      const res = await this.fetchPhoton(
        `https://photon.komoot.io/api/?${params.toString()}`,
        signal
      );
      if (!res.ok) return [];
      const data = (await res.json()) as GeoJSON.FeatureCollection<
        GeoJSON.Point,
        PhotonProperties
      >;
      const features = data.features ?? [];
      await this.ctx.cache.set(cacheKey, features);
      return features;
    } catch {
      return [];
    }
  }

  private fetchPhoton(url: string, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.ctx.userAgent) {
      headers["User-Agent"] = this.ctx.userAgent;
    }
    return this.ctx.defaultLimiter.schedule(() => {
      signal?.throwIfAborted();
      return this.ctx.fetch(url, { headers, signal });
    });
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
      p.osm_type && p.osm_id
        ? `${p.osm_type.toUpperCase()}${p.osm_id}`
        : undefined;

    return createGeoLocation({
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

export const photonGeoCoder = new PhotonGeoCoder();
