import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { getCached, setCached, TTL } from '@/lib/cache'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q || q.length < 1) return Response.json({ result: [] })

  const key = `search:${q.toLowerCase()}`
  const cached = getCached(key)
  if (cached) return Response.json(cached)

  try {
    const data = await finnhub.search(q)
    setCached(key, data, TTL.SEARCH)
    return Response.json(data)
  } catch (e: unknown) {
    return Response.json({ result: [], error: String(e) })
  }
}
