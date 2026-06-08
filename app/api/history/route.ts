// GET /api/history?symbol=AAPL&range=1y
// Returns daily close prices from Yahoo Finance v8 chart API
import { type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

type RangeKey = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max'

const RANGE_TTL: Record<RangeKey, number> = {
  '1mo': 15 * 60_000,
  '3mo': 30 * 60_000,
  '6mo': 60 * 60_000,
  '1y':  60 * 60_000,
  '2y':  60 * 60_000,
  '5y':  4 * 60 * 60_000,
  'max': 4 * 60 * 60_000,
}

export interface HistoryPoint { t: string; c: number }   // t = 'YYYY-MM-DD', c = close

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase()
  const range  = (req.nextUrl.searchParams.get('range')  ?? '1y') as RangeKey
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const cacheKey = `history:${symbol}:${range}`
  const cached = getCached(cacheKey)
  if (cached) return Response.json(cached)

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Yahoo ${res.status}`)

    const json   = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No result')

    const timestamps: number[] = result.timestamp ?? []
    const closes: number[]     = result.indicators?.quote?.[0]?.close ?? []

    const points: HistoryPoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i]
      if (c == null || isNaN(c)) continue
      const d = new Date(timestamps[i] * 1000)
      const t = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      points.push({ t, c })
    }

    const ttl = RANGE_TTL[range] ?? 60 * 60_000
    setCached(cacheKey, points, ttl)
    return Response.json(points)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}
