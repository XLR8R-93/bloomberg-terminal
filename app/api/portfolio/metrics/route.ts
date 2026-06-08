// GET /api/portfolio/metrics?symbols=AAPL,BHP.AX,GC=F
// Returns per-symbol: beta, week52High, week52Low, sector, marketCap
import { type NextRequest } from 'next/server'
import { quoteSummary, fetchCrumb } from '@/lib/providers/yahoo'
import { getCached, setCached } from '@/lib/cache'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function raw(obj: unknown, key: string): number {
  if (!obj || typeof obj !== 'object') return 0
  const v = (obj as Record<string, unknown>)[key]
  if (!v || typeof v !== 'object') return 0
  return ((v as Record<string, unknown>).raw as number) ?? 0
}

interface SymbolMetrics {
  beta: number | null
  week52High: number | null
  week52Low: number | null
  sector: string | null
  industry: string | null
  marketCap: number | null
  shortName: string | null
  dividendYield: number | null
}

async function fetchMetrics(symbol: string): Promise<SymbolMetrics> {
  const key = `portmetrics:${symbol}`
  const cached = getCached(key)
  if (cached) return cached as SymbolMetrics

  // Futures / FX / indices don't have fundamental data — return nulls
  if (symbol.includes('=') || symbol.startsWith('^')) {
    // Still fetch 52w range from Yahoo v7 quote
    try {
      const { crumb, cookie } = await fetchCrumb()
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}&fields=fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName`
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } })
      if (res.ok) {
        const json = await res.json()
        const q = json?.quoteResponse?.result?.[0]
        const result: SymbolMetrics = {
          beta: null,
          week52High: q?.fiftyTwoWeekHigh ?? null,
          week52Low:  q?.fiftyTwoWeekLow  ?? null,
          sector:  null, industry: null, marketCap: null,
          shortName: q?.shortName ?? null,
          dividendYield: null,
        }
        setCached(key, result, 60 * 60 * 1000) // 1h
        return result
      }
    } catch { /* fall through */ }
    return { beta: null, week52High: null, week52Low: null, sector: null, industry: null, marketCap: null, shortName: null, dividendYield: null }
  }

  try {
    const data = await quoteSummary(symbol, 'defaultKeyStatistics,summaryDetail,assetProfile,price')
    const ks   = data.defaultKeyStatistics as Record<string, unknown> ?? {}
    const sd   = data.summaryDetail        as Record<string, unknown> ?? {}
    const ap   = data.assetProfile         as Record<string, unknown> ?? {}
    const pr   = data.price                as Record<string, unknown> ?? {}

    const result: SymbolMetrics = {
      beta:         raw(ks, 'beta')           || raw(sd, 'beta')           || null,
      week52High:   raw(sd, 'fiftyTwoWeekHigh') || raw(pr, 'fiftyTwoWeekHigh') || null,
      week52Low:    raw(sd, 'fiftyTwoWeekLow')  || raw(pr, 'fiftyTwoWeekLow')  || null,
      sector:       (ap.sector   as string) ?? null,
      industry:     (ap.industry as string) ?? null,
      marketCap:    raw(pr, 'marketCap') || raw(sd, 'marketCap') || null,
      shortName:    (pr.shortName as string) ?? null,
      dividendYield: raw(sd, 'dividendYield') ? raw(sd, 'dividendYield') * 100 : null,
    }

    setCached(key, result, 60 * 60 * 1000) // 1h
    return result
  } catch {
    return { beta: null, week52High: null, week52Low: null, sector: null, industry: null, marketCap: null, shortName: null, dividendYield: null }
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? ''
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length) return Response.json({})

  const results = await Promise.all(symbols.map(async s => ({ s, m: await fetchMetrics(s) })))
  const out: Record<string, SymbolMetrics> = {}
  for (const { s, m } of results) out[s] = m

  return Response.json(out)
}
