import {
  buildJsonHeaders,
  type ProviderContext,
  resolveProviderContext,
} from "../context";
import { GoogleMapsLinkBuilder } from "../google-maps-link";
import { GeoLocation } from "../types";

/**
 * Unified, sanitized Place Info Card returned by `InfoCardGenerator`.
 * UI components render this directly without knowing about Nominatim,
 * Wikipedia, Wikimedia Commons, or Google Maps URL construction.
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
  cuisine?: string;
  wheelchair?: string;
  wikipediaUrl?: string;
  googleMapsUrl: string;
  googleMapsEmbedUrl: string;
}

type OsmTags = Record<string, string | undefined>;

interface NominatimPlaceResponse {
  name?: string;
  extratags?: OsmTags;
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

interface LookupOutcome<T> {
  data: T | null;
  transientError: boolean;
}

const STOP_WORDS = new Set(["the", "and", "san", "park"]);
const MIN_MATCH_SCORE = 0.4;
const SEARCH_VIEWBOX_RADIUS_DEG = 0.02;

export class InfoCardGenerator {
  private static readonly NOMINATIM_BASE =
    "https://nominatim.openstreetmap.org";
  private static readonly WIKI_ACTION_API =
    "https://en.wikipedia.org/w/api.php";

  private readonly ctx: ProviderContext;

  constructor(ctxOrFetch?: ProviderContext | typeof fetch) {
    this.ctx = resolveProviderContext(ctxOrFetch);
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
   * Coordinates lookup in parallel across:
   * 1. OpenStreetMap Nominatim (`/lookup` by `osmId` or bounded `/search` by name around `lat,lng`)
   * 2. Wikipedia (`w/api.php` geosearch returning up to 15 ranked candidates, or OSM's explicit `wikipedia` tag)
   */
  async generate(
    location: GeoLocation,
    signal?: AbortSignal
  ): Promise<PlaceInfoCard> {
    const cacheKey = `infocard:${location.lat.toFixed(5)},${location.lng.toFixed(5)}:${location.osmId ?? ""}:${location.name}`;
    const cached = await this.ctx.cache.get<PlaceInfoCard>(cacheKey);
    if (cached) return cached;

    const card = this.getBaseCard(location);

    // Run Nominatim and Wikipedia proximity lookup in parallel so Wikipedia never waits on OSM
    const [nomOutcome, geoWikiOutcome] = await Promise.all([
      this.fetchNominatimDetails(location, signal),
      this.fetchWikipedia(location, undefined, signal),
    ]);
    signal?.throwIfAborted();

    let hadTransientError =
      nomOutcome.transientError || geoWikiOutcome.transientError;
    const tags: OsmTags = nomOutcome.data?.extratags ?? {};

    card.openingHours = tags.opening_hours?.trim() || undefined;
    card.phone = (tags.phone ?? tags["contact:phone"])?.trim() || undefined;
    card.websiteUrl = InfoCardGenerator.sanitizeHttpUrl(
      tags.website ?? tags["contact:website"]
    )?.href;
    card.cuisine = InfoCardGenerator.formatCuisine(tags.cuisine);
    card.wheelchair = InfoCardGenerator.formatWheelchair(tags.wheelchair);

    // Prefer OSM's explicit English `wikipedia` tag over proximity geosearch when they disagree,
    // reusing `geoWiki` with zero extra network calls when it already matched that exact article.
    const osmWikiTitle = InfoCardGenerator.extractEnglishWikiTitle(
      tags.wikipedia
    );
    let wiki = geoWikiOutcome.data;
    if (
      osmWikiTitle &&
      wiki?.title?.toLowerCase() !== osmWikiTitle.toLowerCase()
    ) {
      const exactWikiOutcome = await this.fetchWikipedia(
        location,
        osmWikiTitle,
        signal
      );
      signal?.throwIfAborted();
      hadTransientError ||= exactWikiOutcome.transientError;
      wiki = exactWikiOutcome.data ?? wiki;
    }

    if (wiki) {
      card.subtitle = wiki.description?.trim() || undefined;
      card.summary = wiki.extract?.trim() || undefined;
      card.thumbnailUrl = InfoCardGenerator.sanitizeTrustedWikiUrl(
        wiki.thumbnail?.source,
        "wikimedia.org"
      );
      card.wikipediaUrl = InfoCardGenerator.sanitizeTrustedWikiUrl(
        wiki.fullurl,
        "wikipedia.org"
      );
    }

    // Fall back to OSM's own `description` tag if Wikipedia had no summary (common for local businesses)
    if (!card.summary && tags.description?.trim()) {
      card.summary = tags.description.trim();
    }

    if (!card.thumbnailUrl) {
      card.thumbnailUrl = InfoCardGenerator.resolveCommonsThumbnail(
        tags.image ?? tags.wikimedia_commons
      );
    }

    // Only cache when neither upstream suffered a transient network/5xx/429 failure
    if (!hadTransientError) {
      await this.ctx.cache.set(cacheKey, card);
    }

    return card;
  }

  private async fetchNominatimDetails(
    location: GeoLocation,
    signal?: AbortSignal
  ): Promise<LookupOutcome<NominatimPlaceResponse>> {
    try {
      let url: string;
      const stopName = location.name?.trim();
      const cleanedName = stopName
        ? InfoCardGenerator.stripParenthetical(stopName)
        : undefined;

      if (location.osmId) {
        // Exact OSM object lookup when we have an `osmId` from Photon search
        url = `${InfoCardGenerator.NOMINATIM_BASE}/lookup?osm_ids=${encodeURIComponent(location.osmId)}&format=json&extratags=1`;
      } else if (cleanedName && !/^\d/.test(cleanedName)) {
        // Bounded name search within ~2km of the pin avoids `/reverse` snapping to nearby street furniture
        const radius = SEARCH_VIEWBOX_RADIUS_DEG;
        const viewbox = `${(location.lng - radius).toFixed(5)},${(location.lat + radius).toFixed(5)},${(location.lng + radius).toFixed(5)},${(location.lat - radius).toFixed(5)}`;
        const query = location.city
          ? `${cleanedName}, ${location.city}`
          : cleanedName;
        const params = new URLSearchParams({
          q: query,
          viewbox,
          bounded: "1",
          format: "json",
          extratags: "1",
          limit: "5",
        });
        url = `${InfoCardGenerator.NOMINATIM_BASE}/search?${params.toString()}`;
      } else {
        url = `${InfoCardGenerator.NOMINATIM_BASE}/reverse?lat=${location.lat}&lon=${location.lng}&zoom=18&format=json&extratags=1`;
      }

      const headers = buildJsonHeaders(this.ctx);
      const res = await this.ctx.nominatimLimiter.schedule(
        () => this.ctx.fetch(url, { headers, signal }),
        signal
      );
      if (!res.ok) {
        return {
          data: null,
          transientError: res.status === 429 || res.status >= 500,
        };
      }

      const data: unknown = await res.json();
      const items: NominatimPlaceResponse[] = Array.isArray(data)
        ? (data as NominatimPlaceResponse[])
        : data
          ? [data as NominatimPlaceResponse]
          : [];

      if (items.length === 0) return { data: null, transientError: false };
      if (location.osmId) return { data: items[0], transientError: false };

      // Keep candidates whose OSM `name` meaningfully matches `stopName`,
      // then prefer the richest object (e.g., landmark building over a transit stop with the same name).
      const matching = stopName
        ? items.filter(
            (item) =>
              item.name &&
              InfoCardGenerator.scoreTitleMatch(stopName, item.name) >=
                MIN_MATCH_SCORE
          )
        : items;

      if (matching.length === 0) return { data: null, transientError: false };
      matching.sort(
        (a, b) =>
          InfoCardGenerator.scoreOsmRichness(b.extratags) -
          InfoCardGenerator.scoreOsmRichness(a.extratags)
      );
      return { data: matching[0], transientError: false };
    } catch {
      signal?.throwIfAborted();
      return { data: null, transientError: true };
    }
  }

  /**
   * Unified Wikipedia query against `w/api.php`:
   * - If given an explicit `exactTitle` (from OSM's `extratags.wikipedia`), fetches `titles=...` directly.
   * - Otherwise runs a 400m coordinate `generator=geosearch` for up to 15 candidates (with `pilimit=max`
   *   and `exlimit=max` so MediaWiki populates thumbnails & extracts for every candidate, not just #1)
   *   and picks the highest-scoring title match.
   */
  private async fetchWikipedia(
    location: GeoLocation,
    exactTitle?: string,
    signal?: AbortSignal
  ): Promise<LookupOutcome<WikiPageItem>> {
    const stopName = location.name?.trim();
    if (!exactTitle && (!stopName || /^\d/.test(stopName))) {
      return { data: null, transientError: false };
    }

    try {
      const params = new URLSearchParams({
        action: "query",
        prop: "pageimages|extracts|description|info",
        inprop: "url",
        piprop: "thumbnail",
        pithumbsize: "330",
        pilimit: "max",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
        exlimit: "max",
        redirects: "1",
        format: "json",
        origin: "*",
      });

      if (exactTitle) {
        params.set("titles", exactTitle);
      } else {
        params.set("generator", "geosearch");
        params.set("ggscoord", `${location.lat}|${location.lng}`);
        params.set("ggsradius", "400");
        params.set("ggslimit", "15");
      }

      const headers = buildJsonHeaders(this.ctx);
      const url = `${InfoCardGenerator.WIKI_ACTION_API}?${params.toString()}`;
      const res = await this.ctx.defaultLimiter.schedule(
        () => this.ctx.fetch(url, { headers, signal }),
        signal
      );
      if (!res.ok) {
        return {
          data: null,
          transientError: res.status === 429 || res.status >= 500,
        };
      }

      const data = (await res.json()) as WikiQueryResponse;
      const pages = Object.values(data.query?.pages ?? {}).filter(
        (p) => p.missing === undefined
      );

      if (exactTitle) {
        return { data: pages[0] ?? null, transientError: false };
      }
      if (!stopName) return { data: null, transientError: false };

      // Score all returned candidates and pick the best match above threshold
      let bestPage: WikiPageItem | null = null;
      let bestScore = 0;

      for (const page of pages) {
        if (!page.title) continue;
        const score = InfoCardGenerator.scoreTitleMatch(stopName, page.title);
        if (score >= MIN_MATCH_SCORE && score > bestScore) {
          bestScore = score;
          bestPage = page;
        }
      }

      return { data: bestPage, transientError: false };
    } catch {
      signal?.throwIfAborted();
      return { data: null, transientError: true };
    }
  }

  /**
   * Scores how closely a candidate title (Wikipedia or OSM) matches a stop's name (`0` to `1`).
   * Exact matches score `1.0`; matches after stripping disambiguators like `"(San Francisco)"`
   * score `0.9`; partial matches use Dice coefficient over meaningful tokens so `"Chase Center"`
   * beats `"UCSF/Chase Center station"` and `"Japanese Tea Garden"` beats `"San Francisco Botanical Garden"`.
   */
  static scoreTitleMatch(query: string, candidate: string): number {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const normalizedQuery = normalize(query);
    const normalizedCandidate = normalize(candidate);
    if (!normalizedQuery || !normalizedCandidate) return 0;
    if (normalizedQuery === normalizedCandidate) return 1.0;

    const baseQuery = normalize(InfoCardGenerator.stripParenthetical(query));
    const baseCandidate = normalize(
      InfoCardGenerator.stripParenthetical(candidate)
    );
    if (baseQuery && baseCandidate && baseQuery === baseCandidate) return 0.9;

    const tokenize = (value: string) =>
      value
        .split(" ")
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

    const queryTokens = new Set(tokenize(baseQuery || normalizedQuery));
    const candidateTokens = new Set(
      tokenize(baseCandidate || normalizedCandidate)
    );

    if (queryTokens.size === 0 || candidateTokens.size === 0) {
      return normalizedQuery.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedQuery)
        ? 0.5
        : 0;
    }

    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) overlap++;
    }
    if (overlap === 0) return 0;

    // Dice coefficient scaled below exact/disambiguated matches (max 0.85)
    const dice = (2 * overlap) / (queryTokens.size + candidateTokens.size);
    return Math.min(0.85, dice);
  }

  private static scoreOsmRichness(tags?: OsmTags): number {
    if (!tags) return 0;
    let score = Object.keys(tags).length;
    if (tags.opening_hours) score += 10;
    if (tags.website || tags["contact:website"]) score += 6;
    if (tags.phone || tags["contact:phone"]) score += 5;
    if (tags.wikipedia) score += 5;
    if (tags.cuisine) score += 3;
    return score;
  }

  private static stripParenthetical(raw: string): string {
    return raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  private static extractEnglishWikiTitle(wikiTag?: string): string | undefined {
    if (!wikiTag) return undefined;
    const trimmed = wikiTag.trim();
    if (!trimmed) return undefined;
    if (!trimmed.includes(":")) return trimmed;

    const colonIdx = trimmed.indexOf(":");
    const lang = trimmed.slice(0, colonIdx).toLowerCase();
    // Only query en.wikipedia.org for English tags (or titles containing a colon without a 2-3 char lang prefix)
    if (lang === "en") return trimmed.slice(colonIdx + 1).trim() || undefined;
    if (/^[a-z]{2,3}(-[a-z]+)?$/.test(lang)) return undefined;
    return trimmed;
  }

  private static formatCuisine(raw?: string): string | undefined {
    if (!raw) return undefined;
    const parts = raw
      .split(";")
      .map((s) => s.trim().replace(/_/g, " "))
      .filter(Boolean)
      .slice(0, 3)
      .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    return parts.length > 0 ? parts.join(" • ") : undefined;
  }

  private static formatWheelchair(raw?: string): string | undefined {
    const val = raw?.trim().toLowerCase();
    if (val === "yes") return "Wheelchair accessible";
    if (val === "limited") return "Limited wheelchair access";
    if (val === "no") return "Not wheelchair accessible";
    return undefined;
  }

  static resolveCommonsThumbnail(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();

    const fileMatch =
      trimmed.match(/^File:(.+)$/i) ??
      trimmed.match(/wikimedia\.org\/wiki\/File:([^?#]+)/i);
    if (fileMatch?.[1]) {
      let rawFileName = fileMatch[1];
      try {
        rawFileName = decodeURIComponent(rawFileName);
      } catch {
        // Keep raw filename if OSM tag contained an unescaped '%' character
      }
      const normalized = rawFileName.trim().replace(/ /g, "_");
      if (!normalized) return undefined;
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized)}?width=320`;
    }

    return InfoCardGenerator.sanitizeTrustedWikiUrl(trimmed, "wikimedia.org");
  }

  /**
   * Validates and upgrades Wikimedia/Wikipedia URLs strictly to `https:` on the expected domain.
   */
  static sanitizeTrustedWikiUrl(
    raw: string | undefined,
    requiredDomain: "wikimedia.org" | "wikipedia.org"
  ): string | undefined {
    const parsed = InfoCardGenerator.sanitizeHttpUrl(raw);
    if (!parsed) return undefined;
    const host = parsed.hostname.toLowerCase();
    if (host !== requiredDomain && !host.endsWith(`.${requiredDomain}`)) {
      return undefined;
    }
    parsed.protocol = "https:";
    return parsed.href;
  }

  /**
   * Sanitizes untrusted external URLs (e.g. OSM `website` tags):
   * - Rejects non-HTTP(S) schemes (`javascript:`, `data:`, `mailto:`, `tel:`, `file:`) and protocol-relative `//` URLs.
   * - Rejects embedded `username`/`password` (`https://trusted.org@evil.com` spoofing).
   * - Rejects `localhost`, IP literals, and dotless hostnames.
   */
  static sanitizeHttpUrl(raw?: string): URL | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) return null;

    if (
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed) &&
      !/^https?:\/\//i.test(trimmed)
    ) {
      return null;
    }

    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = URL.parse(withProto);
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      return null;
    }
    if (url.username || url.password) return null;

    const host = url.hostname.toLowerCase();
    if (
      !host.includes(".") ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.startsWith("[") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    ) {
      return null;
    }

    return url;
  }
}

export const infoCardGenerator = new InfoCardGenerator();
