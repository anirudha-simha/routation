import { createDefaultContext, type ProviderContext } from "../context";
import { GoogleMapsLinkBuilder } from "../google-maps-link";
import { GeoLocation } from "../types";

/**
 * Unified, sanitized Place Info Card returned by `InfoCardGenerator`.
 * UI components render this directly without knowing about Nominatim, Wikipedia,
 * Wikimedia Commons, or Google Maps URL construction.
 */
export interface PlaceInfoCard {
  title: string;
  subtitle?: string;
  address: string;
  coordinates: string;
  thumbnailUrl?: string;
  summary?: string;
  openingHours?: string;
  websiteUrl?: string;
  phone?: string;
  wikipediaUrl?: string;
  googleMapsUrl: string;
  googleMapsEmbedUrl: string;
}

interface NominatimPlaceResponse {
  name?: string;
  extratags?: Record<string, string | undefined>;
}

interface WikiPageItem {
  missing?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  fullurl?: string;
}

interface WikiQueryResponse {
  query?: {
    pages?: Record<string, WikiPageItem>;
  };
}

export class InfoCardGenerator {
  private static readonly NOMINATIM_BASE =
    "https://nominatim.openstreetmap.org";
  private static readonly WIKI_ACTION_API =
    "https://en.wikipedia.org/w/api.php";

  private readonly ctx: ProviderContext;

  constructor(ctxOrFetch?: ProviderContext | typeof fetch) {
    this.ctx =
      typeof ctxOrFetch === "function"
        ? createDefaultContext({
            fetch: ctxOrFetch,
            nominatimLimiter: { schedule: (fn) => fn() },
          })
        : (ctxOrFetch ?? createDefaultContext());
  }

  /**
   * Synchronously constructs the baseline card (0ms, no network calls)
   * so the popup can render immediately while rich details resolve.
   */
  getBaseCard(location: GeoLocation): PlaceInfoCard {
    return {
      title: location.name?.trim() || location.fullAddress,
      address: location.fullAddress,
      coordinates: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
      googleMapsUrl: GoogleMapsLinkBuilder.buildPlaceSearchUrl(location),
      googleMapsEmbedUrl: GoogleMapsLinkBuilder.buildPlaceEmbedUrl(location),
    };
  }

  /**
   * Coordinates lookup across OpenStreetMap Nominatim (`extratags=1`),
   * Wikimedia Commons (`Special:FilePath`), and Wikipedia (`w/api.php`)
   * using `ProviderContext` caching, rate limiting, and strict URL sanitization.
   */
  async generate(location: GeoLocation): Promise<PlaceInfoCard> {
    const cacheKey = `infocard:${location.lat.toFixed(5)},${location.lng.toFixed(5)}:${location.name}`;
    const cached = await this.ctx.cache.get<PlaceInfoCard>(cacheKey);
    if (cached) return cached;

    const card = this.getBaseCard(location);
    const nominatim = await this.fetchNominatimDetails(location);
    const tags = nominatim?.extratags ?? {};

    card.openingHours = tags.opening_hours?.trim() || undefined;
    card.phone = (tags.phone ?? tags["contact:phone"])?.trim() || undefined;
    card.websiteUrl = InfoCardGenerator.sanitizeHttpUrl(
      tags.website ?? tags["contact:website"]
    )?.href;

    const wiki = await this.fetchWikipedia(location, tags.wikipedia);
    if (wiki) {
      card.subtitle = wiki.description?.trim() || undefined;
      card.summary = wiki.extract?.trim() || undefined;
      card.thumbnailUrl = InfoCardGenerator.sanitizeHttpUrl(
        wiki.thumbnail?.source
      )?.href;
      card.wikipediaUrl = InfoCardGenerator.sanitizeHttpUrl(wiki.fullurl)?.href;
    }

    if (!card.thumbnailUrl) {
      card.thumbnailUrl = InfoCardGenerator.resolveCommonsThumbnail(
        tags.image ?? tags.wikimedia_commons
      );
    }

    await this.ctx.cache.set(cacheKey, card);
    return card;
  }

  private async fetchNominatimDetails(
    location: GeoLocation
  ): Promise<NominatimPlaceResponse | null> {
    try {
      const url = location.osmId
        ? `${InfoCardGenerator.NOMINATIM_BASE}/lookup?osm_ids=${encodeURIComponent(location.osmId)}&format=json&extratags=1`
        : `${InfoCardGenerator.NOMINATIM_BASE}/reverse?lat=${location.lat}&lon=${location.lng}&zoom=18&format=json&extratags=1`;

      const res = await this.ctx.nominatimLimiter.schedule(() =>
        this.ctx.fetch(url, { headers: { Accept: "application/json" } })
      );
      if (!res.ok) return null;

      const data: unknown = await res.json();
      const item = Array.isArray(data)
        ? ((data[0] as NominatimPlaceResponse) ?? null)
        : ((data as NominatimPlaceResponse) ?? null);
      if (!item) return null;

      // When falling back to `/reverse` (no exact `osmId`), ignore random nearby street furniture
      // (benches, waste baskets, toll booths) whose OSM `name` doesn't match `location.name`.
      if (
        !location.osmId &&
        location.name &&
        (!item.name || !InfoCardGenerator.namesOverlap(location.name, item.name))
      ) {
        return null;
      }
      return item;
    } catch {
      return null;
    }
  }

  /**
   * Unified Wikipedia query against `w/api.php`:
   * - If OSM provided an explicit `extratags.wikipedia` tag (e.g. `"en:Painted Ladies"`), looks up `titles=...` directly.
   * - Otherwise performs a 300m coordinate `generator=geosearch` and accepts a page only if its title overlaps `location.name`.
   */
  private async fetchWikipedia(
    location: GeoLocation,
    wikiTag?: string
  ): Promise<WikiPageItem | null> {
    const tagTitle = wikiTag
      ? (wikiTag.includes(":") ? wikiTag.split(":").slice(1).join(":") : wikiTag).trim()
      : undefined;
    const stopName = location.name?.trim();

    if (!tagTitle && (!stopName || /^\d/.test(stopName))) {
      return null;
    }

    try {
      const params = new URLSearchParams({
        action: "query",
        prop: "pageimages|extracts|description|info",
        inprop: "url",
        piprop: "thumbnail",
        pithumbsize: "330",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
        redirects: "1",
        format: "json",
        origin: "*",
      });

      if (tagTitle) {
        params.set("titles", tagTitle);
      } else {
        params.set("generator", "geosearch");
        params.set("ggscoord", `${location.lat}|${location.lng}`);
        params.set("ggsradius", "300");
        params.set("ggslimit", "5");
      }

      const res = await this.ctx.fetch(
        `${InfoCardGenerator.WIKI_ACTION_API}?${params.toString()}`
      );
      if (!res.ok) return null;

      const data = (await res.json()) as WikiQueryResponse;
      const pages = Object.values(data.query?.pages ?? {}).filter(
        (p) => p.missing === undefined
      );

      if (tagTitle) {
        return pages[0] ?? null;
      }
      return (
        pages.find(
          (p) =>
            p.title &&
            stopName &&
            InfoCardGenerator.namesOverlap(stopName, p.title)
        ) ?? null
      );
    } catch {
      return null;
    }
  }

  static namesOverlap(a: string, b: string): boolean {
    const tokenize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (w) => w.length >= 3 && !["the", "and", "san", "park"].includes(w)
        );

    const tokensA = tokenize(a);
    const tokensB = new Set(tokenize(b));
    if (tokensA.length === 0 || tokensB.size === 0) {
      return (
        a.toLowerCase().includes(b.toLowerCase()) ||
        b.toLowerCase().includes(a.toLowerCase())
      );
    }
    return tokensA.some((t) => tokensB.has(t));
  }

  static resolveCommonsThumbnail(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();

    const fileMatch =
      trimmed.match(/^File:(.+)$/i) ??
      trimmed.match(/wikimedia\.org\/wiki\/File:([^?#]+)/i);
    if (fileMatch?.[1]) {
      const decoded = decodeURIComponent(fileMatch[1]).trim().replace(/ /g, "_");
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decoded)}?width=320`;
    }

    const parsed = InfoCardGenerator.sanitizeHttpUrl(trimmed);
    return parsed?.hostname.endsWith(".wikimedia.org") ? parsed.href : undefined;
  }

  static sanitizeHttpUrl(raw?: string): URL | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = URL.parse(withProto);
    return url && (url.protocol === "https:" || url.protocol === "http:")
      ? url
      : null;
  }
}

export const infoCardGenerator = new InfoCardGenerator();
