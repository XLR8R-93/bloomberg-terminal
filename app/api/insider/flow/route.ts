// GET /api/insider/flow?days=30|60|90
// Returns biggest insider buys and sells across S&P + ASX universe
// ranked by total dollar value
export const maxDuration = 60  // Vercel: allow up to 60s (Pro) / use cache on free tier
import { NextResponse, type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface FlowTransaction {
  symbol:           string
  exchange:         'NYSE/NASDAQ' | 'ASX'
  name:             string       // insider name
  transactionCode:  string
  transactionDate:  string
  share:            number
  transactionPrice: number | null
  value:            number       // share × price (always positive)
}

export interface InsiderFlow {
  days:    number
  topBuys: FlowTransaction[]
  topSells: FlowTransaction[]
}

// ~50 stock universe: S&P large-caps + ASX top names
// ASX use base symbols (Finnhub insider endpoint accepts them without .AX)
const UNIVERSE_US = [
  'AAPL','MSFT','GOOGL','NVDA','META','AMZN','TSLA','JPM','JNJ','UNH',
  'COST','ABBV','LLY','PG','KO','MCD','NFLX','ADBE','AMD','AVGO',
  'NOW','WMT','HD','XOM','CVX','GS','MS','BAC','WFC','ORCL',
  'CSCO','INTC','MU','CRM','PANW','QCOM','AMAT','V','MA','TXN',
]
const UNIVERSE_ASX = [
  'BHP','CBA','CSL','WES','MQG','ANZ','NAB','WBC','RIO','GMG',
  'REA','ALL','COH','WOW','FMG','XRO','RMD','SHL',
]

const EXCHANGE_MAP: Record<string, 'ASX'> = Object.fromEntries(
  UNIVERSE_ASX.map(s => [s, 'ASX'])
)

async function fetchInsider(symbol: string, from: string, to: string, apiKey: string) {
  const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []) as {
      name: string; transactionDate: string; transactionCode: string
      transactionPrice: number | null; share: number; change: number
      isDerivative: boolean; filingDate: string
    }[]
  } catch {
    return []
  }
}

// Batch fetcher: process symbols N at a time with small delay
async function batchFetch(
  symbols: string[], from: string, to: string, apiKey: string, batchSize = 5
): Promise<Map<string, Awaited<ReturnType<typeof fetchInsider>>>> {
  const results = new Map<string, Awaited<ReturnType<typeof fetchInsider>>>()
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(batch.map(async sym => {
      results.set(sym, await fetchInsider(sym, from, to, apiKey))
    }))
    // Respect Finnhub rate limit (60/min free tier) — 5 calls per batch, wait 6s between batches
    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, 6000))
    }
  }
  return results
}

export async function GET(req: NextRequest) {
  const days = Math.min(90, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)))

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })

  const cacheKey = `insider:flow:${days}`
  const hit = getCached(cacheKey)
  if (hit) return NextResponse.json(hit)

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date().toISOString().slice(0, 10)

  const allSymbols = [...UNIVERSE_US, ...UNIVERSE_ASX]

  // Fetch all symbols
  const allResults = await batchFetch(allSymbols, from, to, apiKey, 5)

  const buys:  FlowTransaction[] = []
  const sells: FlowTransaction[] = []

  for (const symbol of allSymbols) {
    const txns = allResults.get(symbol) ?? []
    const exchange = EXCHANGE_MAP[symbol] ?? 'NYSE/NASDAQ'

    for (const t of txns) {
      // Open-market only
      if (!['P', 'S'].includes(t.transactionCode)) continue
      if (t.isDerivative) continue
      if (!t.transactionDate || t.transactionDate < from) continue

      const shares = Math.abs(t.share ?? 0)
      const price  = t.transactionPrice ?? 0
      const value  = shares * price
      if (value < 1000) continue  // filter tiny noise transactions

      const tx: FlowTransaction = {
        symbol,
        exchange,
        name: t.name ?? '',
        transactionCode: t.transactionCode,
        transactionDate: t.transactionDate,
        share: shares,
        transactionPrice: t.transactionPrice,
        value,
      }
      if (t.transactionCode === 'P') buys.push(tx)
      else sells.push(tx)
    }
  }

  // Sort descending by value, take top 30 each
  buys.sort((a, b) => b.value - a.value)
  sells.sort((a, b) => b.value - a.value)

  const result: InsiderFlow = {
    days,
    topBuys:  buys.slice(0, 30),
    topSells: sells.slice(0, 30),
  }

  // Cache 4h — bulk fetch is expensive
  setCached(cacheKey, result, 4 * 60 * 60 * 1000)
  return NextResponse.json(result)
}
