import { type NextRequest } from 'next/server'
import { fetchChartData } from '@/lib/providers/chart'
import { getCached, setCached, TTL } from '@/lib/cache'

type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y'
const VALID_RANGES: Range[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const range = (request.nextUrl.searchParams.get('range') || '1M') as Range

  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })
  if (!VALID_RANGES.includes(range)) return Response.json({ error: 'invalid range' }, { status: 400 })

  const intraday = range === '1D' || range === '5D'
  const ttl = intraday ? TTL.CHART_INTRADAY : TTL.CHART_DAILY
  const key = `chart:${symbol}:${range}`

  const cached = getCached(key)
  if (cached) return Response.json({ bars: cached, _cached: true })

  try {
    const bars = await fetchChartData(symbol, range)
    setCached(key, bars, ttl)
    return Response.json({ bars })
  } catch (e: unknown) {
    const c = getCached(key)
    if (c) return Response.json({ bars: c, _cached: true })
    return Response.json({ error: String(e), bars: [] }, { status: 503 })
  }
}
