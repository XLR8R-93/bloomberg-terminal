import { getCached, setCached } from '@/lib/cache'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; bloomberg-terminal/1.0)',
  'Accept': 'application/json',
}

export interface MoverQuote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
}

async function fetchScreener(scrId: string): Promise<MoverQuote[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=10&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Yahoo screener ${scrId} ${res.status}`)
  const json = await res.json()
  const quotes: MoverQuote[] = json?.finance?.result?.[0]?.quotes ?? []
  return quotes.filter(
    (q) =>
      q.symbol &&
      typeof q.regularMarketPrice === 'number' &&
      !isNaN(q.regularMarketPrice) &&
      typeof q.regularMarketChangePercent === 'number' &&
      !isNaN(q.regularMarketChangePercent)
  )
}

export async function GET() {
  const key = 'movers:top'
  const cached = getCached<{ gainers: MoverQuote[]; losers: MoverQuote[] }>(key)
  if (cached) return Response.json(cached)

  try {
    const [gainers, losers] = await Promise.all([
      fetchScreener('day_gainers'),
      fetchScreener('day_losers'),
    ])
    const data = { gainers, losers }
    setCached(key, data, 3 * 60_000) // 3-minute TTL for movers
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
