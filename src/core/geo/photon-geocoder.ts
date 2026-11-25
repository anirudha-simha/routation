import {
  buildJsonHeaders,
  type ProviderContext,
  resolveProviderContext,
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

  constructor(ctxOrFetch?: ProviderContext | typeof fetch) {
    super();
    this.ctx = resolveProviderContext(ctxOrFetch);
  }

  override async addressLookup(
    address: string,
    bias?: LatLng,
    signal?: AbortSignal
  ): Promise<GeoLocation[]> {
    const features = await this.searchPhotonSuggestions(address, bias, signal);
    const locations = features
      .map((feature) => this.formatPhotonFeature(feature))
      .filter((loc): loc is GeoLocation => loc !== null);

    // Deduplicate by `name|fullAddress|roundedCoords` AND `loc.id` so Svelte keyed `#each` never collides
    const seen = new Set<string>();
    return locations.filter((loc) => {
      const areaKey = `${loc.name}|${loc.fullAddress}|${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
      if (seen.has(areaKey) || seen.has(loc.id)) return false;
      seen.add(areaKey);
      seen.add(loc.id);
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
          .map((feature) => this.formatPhotonFeature(feature))
          .filter((loc): loc is GeoLocation => loc !== null);
        if (mapped.length > 0) {
          await this.ctx.cache.set(cacheKey, mapped);
          return mapped;
        }
      }
    } catch {
      signal?.throwIfAborted();
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
      signal?.throwIfAborted();
      return [];
    }
  }

  private fetchPhoton(url: string, signal?: AbortSignal): Promise<Response> {
    const headers = buildJsonHeaders(this.ctx);
    return this.ctx.defaultLimiter.schedule(
      () => this.ctx.fetch(url, { headers, signal }),
      signal
    );
  }

  /**
   * Maps a single Photon GeoJSON feature into our unified `GeoLocation` object.
   */
  formatPhotonFeature(
    feature: GeoJSON.Feature<GeoJSON.Point, PhotonProperties>
  ): GeoLocation | null {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!props || !coords) return null;

    const [lng, lat] = coords;
    const osmId =
      props.osm_type && props.osm_id
        ? `${props.osm_type.toUpperCase()}${props.osm_id}`
        : undefined;

    return createGeoLocation({
      name: props.name,
      building: props.housenumber,
      street: props.street,
      lat,
      lng,
      city: props.city ?? props.locality ?? props.district ?? props.county,
      state: props.state,
      zip: props.postcode,
      country: props.country,
      osmId,
    });
  }
}

export const photonGeoCoder = new PhotonGeoCoder();
