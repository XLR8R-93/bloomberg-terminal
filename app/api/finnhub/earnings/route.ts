import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { getCached, setCached, TTL } from '@/lib/cache'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `earnings:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json(cached)

  try {
    const [earnings, recs] = await Promise.all([
      finnhub.earnings(symbol),
      finnhub.recommendations(symbol),
    ])
    const data = { earnings, recommendations: recs }
    setCached(key, data, TTL.EARNINGS)
    return Response.json(data)
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
