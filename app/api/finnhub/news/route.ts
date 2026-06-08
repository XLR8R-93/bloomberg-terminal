import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { yahooNews } from '@/lib/providers/yahoo'
import { getCached, setCached, TTL } from '@/lib/cache'

function dateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function isInternational(symbol: string) {
  return symbol.includes('.')
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()

  if (!symbol) {
    const key = 'news:general'
    const cached = getCached(key)
    if (cached) return Response.json(cached)
    try {
      const data = await finnhub.marketNews()
      setCached(key, data, TTL.NEWS)
      return Response.json(data)
    } catch (e: unknown) {
      return Response.json({ error: String(e) }, { status: 503 })
    }
  }

  const key = `news:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json(cached)

  try {
    let data
    if (isInternational(symbol)) {
      data = await yahooNews(symbol)
    } else {
      try {
        const to = new Date()
        const from = new Date(to)
        from.setDate(from.getDate() - 30)
        data = await finnhub.companyNews(symbol, dateStr(from), dateStr(to))
        if (!data?.length) data = await yahooNews(symbol)
      } catch {
        data = await yahooNews(symbol)
      }
    }
    setCached(key, data, TTL.NEWS)
    return Response.json(data)
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
