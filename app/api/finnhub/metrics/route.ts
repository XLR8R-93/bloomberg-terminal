import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { yahooMetrics } from '@/lib/providers/yahoo'
import { getCached, setCached, TTL } from '@/lib/cache'

function isInternational(symbol: string) {
  return symbol.includes('.')
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `metrics:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json({ ...cached as object, _cached: true })

  try {
    let data
    if (isInternational(symbol)) {
      data = await yahooMetrics(symbol)
    } else {
      try {
        data = await finnhub.metrics(symbol)
        if (!data?.metric || Object.values(data.metric).every((v) => v == null)) {
          data = await yahooMetrics(symbol)
        } else {
          // Normalize Finnhub field names → add aliases used by RV / KS panels
          // Finnhub uses 'currentEv/ebitdaTTM'; panels expect 'evToEbitda' / 'evEbitdaTTM'
          const m = data.metric as Record<string, number | null>
          const evEbitda = m['currentEv/ebitdaTTM'] ?? m['evEbitdaTTM'] ?? null
          if (evEbitda != null) {
            m['evToEbitda']  = m['evToEbitda']  ?? evEbitda
            m['evEbitdaTTM'] = m['evEbitdaTTM'] ?? evEbitda
          }
          // EV/Revenue alias
          const evRev = m['currentEv/revenuesTTM'] ?? m['evRevenuesTTM'] ?? null
          if (evRev != null) {
            m['evToRevenue'] = m['evToRevenue'] ?? evRev
          }
        }
      } catch {
        data = await yahooMetrics(symbol)
      }
    }
    setCached(key, data, TTL.METRICS)
    return Response.json(data)
  } catch (e: unknown) {
    const c = getCached(key)
    if (c) return Response.json({ ...c as object, _cached: true })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
