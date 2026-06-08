import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { yahooQuote } from '@/lib/providers/yahoo'
import { getCached, setCached, TTL } from '@/lib/cache'

function isInternational(symbol: string) {
  return symbol.includes('.') || symbol.includes('=') || symbol.startsWith('^')
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `quote:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json({ ...cached, _cached: true })

  try {
    let data
    if (isInternational(symbol)) {
      data = await yahooQuote(symbol)
    } else {
      try {
        data = await finnhub.quote(symbol)
        // Finnhub returns all zeros for unknown symbols — fall back to Yahoo
        if (!data.c) data = await yahooQuote(symbol)
      } catch {
        data = await yahooQuote(symbol)
      }
    }
    setCached(key, data, TTL.QUOTE)
    return Response.json(data)
  } catch (e: unknown) {
    const c = getCached(key)
    if (c) return Response.json({ ...c, _cached: true, _error: String(e) })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
