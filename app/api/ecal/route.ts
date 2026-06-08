// GET /api/ecal?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns upcoming + recent earnings for a curated universe of stocks
import { NextResponse, type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface EarningsEvent {
  symbol:          string
  date:            string    // YYYY-MM-DD
  hour:            string    // 'bmo' | 'amc' | 'dmh' | ''
  epsEstimate:     number | null
  epsActual:       number | null
  epsSurprise:     number | null    // % surprise
  revenueEstimate: number | null
  revenueActual:   number | null
  revSurprise:     number | null
  quarter:         number
  year:            number
  dateConfirmed:   boolean
}

// Curated universe — same as SCRN roughly (US + ASX major names)
const UNIVERSE = new Set([
  'AAPL','MSFT','GOOGL','GOOG','NVDA','META','AMZN','TSLA','V','MA',
  'JPM','JNJ','UNH','COST','ABBV','LLY','PG','KO','MCD','NFLX',
  'ADBE','AMD','AVGO','TXN','NOW','INTU','WMT','HD','XOM','CVX',
  'WM','NEE','PYPL','QCOM','AMAT','CRM','PANW','SBUX','DIS','BA',
  'GS','MS','BAC','WFC','C','BRK-B','CAT','DE','MMM','IBM',
  'ORCL','CSCO','INTC','MU','LRCX','KLAC','SNPS','CDNS','MRVL',
  // ASX — Finnhub uses .AX suffix but earnings calendar uses base symbols
  'BHP','CBA','CSL','WES','MQG','ANZ','NAB','WBC','RIO','GMG',
  'REA','ALL','COH','WOW','SHL','RMD','FMG','XRO',
])

export async function GET(req: NextRequest) {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })

  // Default: 2 weeks back + 4 weeks ahead
  const from = req.nextUrl.searchParams.get('from')
    ?? new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const to   = req.nextUrl.searchParams.get('to')
    ?? new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10)

  const cacheKey = `ecal:${from}:${to}`
  const hit = getCached(cacheKey)
  if (hit) return NextResponse.json(hit)

  try {
    const res  = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      { next: { revalidate: 1800 } }
    )
    if (!res.ok) throw new Error(`Finnhub ${res.status}`)
    const json = await res.json()

    const raw: {
      symbol: string; date: string; hour: string
      epsEstimate: number | null; eps: number | null
      revenueEstimate: number | null; revenueActual: number | null
      quarter: number; year: number; dateConfirmed: boolean
    }[] = json.earningsCalendar ?? []

    // Filter to universe and map to clean shape
    const events: EarningsEvent[] = raw
      .filter(e => UNIVERSE.has(e.symbol))
      .map(e => {
        const epsActual     = e.eps ?? null
        const epsEstimate   = e.epsEstimate ?? null
        const epsSurprise   = epsActual != null && epsEstimate != null && epsEstimate !== 0
          ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
          : null
        const revenueActual   = e.revenueActual ?? null
        const revenueEstimate = e.revenueEstimate ?? null
        const revSurprise     = revenueActual != null && revenueEstimate != null && revenueEstimate !== 0
          ? ((revenueActual - revenueEstimate) / Math.abs(revenueEstimate)) * 100
          : null
        return {
          symbol:          e.symbol,
          date:            e.date,
          hour:            e.hour ?? '',
          epsEstimate,
          epsActual,
          epsSurprise,
          revenueEstimate,
          revenueActual,
          revSurprise,
          quarter:         e.quarter,
          year:            e.year,
          dateConfirmed:   e.dateConfirmed ?? false,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    setCached(cacheKey, events, 30 * 60 * 1000)
    return NextResponse.json(events)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
