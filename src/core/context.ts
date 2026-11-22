/**
 * Isomorphic dependency injection context so `@route-optimizer/core` stays free
 * of direct browser (`IndexedDB`/`localStorage`) or Node (`fs`) globals, and
 * unit tests can inject fake `fetch`, instant timers, and in-memory caches.
 */

export interface KeyValueCache {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
}

export interface RateLimiter {
  /**
   * Schedules `fn` so consecutive calls are separated by at least `minIntervalMs`.
   */
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ProviderContext {
  fetch: typeof globalThis.fetch;
  cache: KeyValueCache;
  /** Rate limiter for Nominatim (strictly <= 1 req/sec per OSMF policy). */
  nominatimLimiter: RateLimiter;
  /** Rate limiter for Photon / OSRM demo servers. */
  defaultLimiter: RateLimiter;
  /** Optional custom User-Agent header (required by Nominatim when running in Node). */
  userAgent?: string;
}

/**
 * Simple in-memory cache implementation (works in browser, Node, and tests).
 */
export function createMemoryCache(): KeyValueCache {
  const store = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
  };
}

/**
 * Creates a FIFO rate limiter that enforces at least `minIntervalMs` between task starts.
 *
 * TODO (internals): If you want to practice async queues, inspect or customize how
 * promises chain here so concurrent callers wait their turn without race conditions.
 */
export function createRateLimiter(minIntervalMs: number): RateLimiter {
  let nextAllowedTime = 0;
  let queue: Promise<unknown> = Promise.resolve();

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        const now = Date.now();
        const waitMs = Math.max(0, nextAllowedTime - now);
        nextAllowedTime = Math.max(now, nextAllowedTime) + minIntervalMs;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
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
