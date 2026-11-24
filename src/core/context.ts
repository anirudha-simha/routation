/**
 * Isomorphic dependency injection context so `src/core` stays free of direct
 * browser (`IndexedDB`/`localStorage`) or Node (`fs`) globals, and unit tests
 * can inject fake `fetch`, instant timers, and isolated caches.
 */

export interface KeyValueCache {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  /**
   * Read-through helper with singleflight deduplication: concurrent callers
   * requesting the same `key` share a single in-flight `loader()` promise.
   */
  getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T>;
}

export interface RateLimiter {
  /**
   * Schedules `fn` so consecutive calls are separated by at least `minIntervalMs`.
   * If `signal` aborts before `fn` starts, cancels immediately without burning a rate-limit slot.
   */
  schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export interface ProviderContext {
  fetch: typeof globalThis.fetch;
  cache: KeyValueCache;
  /** Rate limiter for Nominatim (strictly <= 1 req/sec per OSMF policy). */
  nominatimLimiter: RateLimiter;
  /** Rate limiter for Photon / OSRM community servers. */
  defaultLimiter: RateLimiter;
  /** Optional custom User-Agent header (required by Nominatim/OSM when running in Node). */
  userAgent?: string;
}

export interface MemoryCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

/**
 * Bounded LRU + TTL in-memory cache with singleflight request coalescing.
 */
export function createMemoryCache(
  options: MemoryCacheOptions = {}
): KeyValueCache {
  const { maxEntries = 250, ttlMs = 15 * 60_000 } = options;
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const inFlight = new Map<string, Promise<unknown>>();

  const get = async <T = unknown>(key: string): Promise<T | undefined> => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    // Refresh insertion order for LRU eviction
    store.delete(key);
    store.set(key, entry);
    return entry.value as T;
  };

  const set = async <T = unknown>(key: string, value: T): Promise<void> => {
    if (store.has(key)) {
      store.delete(key);
    } else if (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  const getOrLoad = async <T>(
    key: string,
    loader: () => Promise<T>
  ): Promise<T> => {
    const cached = await get<T>(key);
    if (cached !== undefined) return cached;

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const task = (async () => {
      try {
        const fresh = await loader();
        await set(key, fresh);
        return fresh;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, task);
    return task;
  };

  return { get, set, getOrLoad };
}

/**
 * Creates a FIFO rate limiter that enforces at least `minIntervalMs` between task starts.
 */
export function createRateLimiter(minIntervalMs: number): RateLimiter {
  let nextAllowedTime = 0;
  let queue: Promise<unknown> = Promise.resolve();

  return {
    schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const run = async (): Promise<T> => {
        signal?.throwIfAborted();
        const now = Date.now();
        const waitMs = Math.max(0, nextAllowedTime - now);
        if (waitMs > 0) {
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timer);
              reject(
                signal?.reason ?? new DOMException("Aborted", "AbortError")
              );
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener("abort", onAbort);
              resolve();
            }, waitMs);
            signal?.addEventListener("abort", onAbort, { once: true });
          });
        }
        signal?.throwIfAborted();
        nextAllowedTime = Date.now() + minIntervalMs;
        return fn();
      };
      const result = queue.then(run, run);
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}

export function createDefaultContext(
  overrides: Partial<ProviderContext> = {}
): ProviderContext {
  return {
    fetch: overrides.fetch ?? globalThis.fetch.bind(globalThis),
    cache: overrides.cache ?? createMemoryCache(),
    nominatimLimiter: overrides.nominatimLimiter ?? createRateLimiter(1100),
    defaultLimiter: overrides.defaultLimiter ?? createRateLimiter(350),
    userAgent: overrides.userAgent,
  };
}

/**
 * Shared application-wide `ProviderContext` singleton so all browser/CLI services
 * share one bounded cache and enforce global per-upstream rate limits.
 */
export const defaultProviderContext = createDefaultContext();
