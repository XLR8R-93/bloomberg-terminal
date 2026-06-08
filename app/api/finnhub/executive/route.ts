import { type NextRequest } from 'next/server'
import { getCached, setCached, TTL } from '@/lib/cache'

const BASE = 'https://finnhub.io/api/v1'

export interface Executive {
  name: string
  position: string
  positionCode: string
  age: number | null
  since: string | null
  compensation: number | null
  currency: string | null
}

async function fetchExecutives(symbol: string): Promise<Executive[]> {
  const url = `${BASE}/stock/executive?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Finnhub executive ${res.status}`)
  const json = await res.json()
  return json.executive ?? []
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `executive:${symbol}`
  const cached = getCached<Executive[]>(key)
  if (cached) return Response.json(cached)

  try {
    const data = await fetchExecutives(symbol)
    setCached(key, data, TTL.PROFILE)
    return Response.json(data)
  } catch (e) {
    const cached = getCached<Executive[]>(key)
    if (cached) return Response.json(cached)
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
