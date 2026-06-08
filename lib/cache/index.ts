interface CacheEntry {
  data: unknown
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs })
}

export const TTL = {
  QUOTE: 15_000,
  PROFILE: 24 * 60 * 60_000,
  NEWS: 5 * 60_000,
  CHART_INTRADAY: 5 * 60_000,
  CHART_DAILY: 12 * 60 * 60_000,
  FUNDAMENTALS: 24 * 60 * 60_000,
  PEERS: 24 * 60 * 60_000,
  EARNINGS: 60 * 60_000,
  METRICS: 24 * 60 * 60_000,
  SEARCH: 60_000,
}
