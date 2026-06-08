import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { yahooProfile } from '@/lib/providers/yahoo'
import { getCached, setCached, TTL } from '@/lib/cache'

function isInternational(symbol: string) {
  return symbol.includes('.')
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `profile:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json({ ...cached as object, _cached: true })

  try {
    let data
    if (isInternational(symbol)) {
      data = await yahooProfile(symbol)
    } else {
      try {
        data = await finnhub.profile(symbol)
        // Finnhub returns empty object for unknown symbols
        if (!data.name) data = await yahooProfile(symbol)
      } catch {
        data = await yahooProfile(symbol)
      }
    }
    setCached(key, data, TTL.PROFILE)
    return Response.json(data)
  } catch (e: unknown) {
    const c = getCached(key)
    if (c) return Response.json({ ...c as object, _cached: true })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
