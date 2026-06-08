import { type NextRequest } from 'next/server'
import { getCached, setCached, TTL } from '@/lib/cache'
import { yahooFinancials } from '@/lib/providers/yahoo'

const HEADERS = { 'User-Agent': 'bloomberg-terminal mark.salescom@gmail.com' }

export interface AnnualBar {
  year: number      // e.g. 2023
  date: string      // fiscal year end date e.g. "2023-09-30"
  revenue: number | null
  grossProfit: number | null
  operatingIncome: number | null
  netIncome: number | null
  eps: number | null        // basic
  epsDiluted: number | null
}

type FactUnit = { end: string; val: number; form: string; accn: string; filed: string }
type Facts = { facts: { 'us-gaap'?: Record<string, { units: { USD?: FactUnit[]; 'USD/shares'?: FactUnit[] } }> } }

let tickerMap: Record<string, string> | null = null
async function getCIK(ticker: string): Promise<string> {
  if (!tickerMap) {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS })
    const json: Record<string, { cik_str: number; ticker: string }> = await res.json()
    tickerMap = {}
    for (const v of Object.values(json)) {
      tickerMap[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, '0')
    }
  }
  const cik = tickerMap[ticker.toUpperCase()]
  if (!cik) throw new Error(`No CIK for ${ticker}`)
  return cik
}

function pickAnnual(units: FactUnit[] | undefined, n = 8): { date: string; val: number }[] {
  if (!units) return []
  const filtered = units.filter((u) => u.form === '10-K' && u.end && u.val != null)
    .sort((a, b) => b.end.localeCompare(a.end))
  const seen = new Set<string>()
  const out: { date: string; val: number }[] = []
  for (const u of filtered) {
    if (!seen.has(u.end)) { seen.add(u.end); out.push({ date: u.end, val: u.val }) }
    if (out.length >= n) break
  }
  return out
}

function bestConcept(gaap: NonNullable<Facts['facts']['us-gaap']>, names: string[], dates: string[], unit: 'USD' | 'USD/shares' = 'USD'): (number | null)[] {
  let best: (number | null)[] = dates.map(() => null)
  let bestCount = 0
  for (const name of names) {
    const units = gaap[name]?.units?.[unit]
    if (!units) continue
    const map: Record<string, number> = {}
    for (const u of units) {
      if (u.form === '10-K' && u.end) map[u.end] = u.val
    }
    const result = dates.map((d) => map[d] ?? null)
    const count = result.filter((v) => v !== null).length
    if (count > bestCount) { bestCount = count; best = result }
  }
  return best
}

async function fetchHistory(ticker: string): Promise<AnnualBar[]> {
  const cik = await getCIK(ticker)
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: HEADERS })
  if (!res.ok) throw new Error(`EDGAR facts ${res.status}`)
  const facts: Facts = await res.json()
  const gaap = facts.facts['us-gaap']
  if (!gaap) throw new Error('No us-gaap facts')

  // Determine annual dates from revenue
  const revConcepts = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet']
  let dates: string[] = []
  let bestDate = ''
  for (const name of revConcepts) {
    const p = pickAnnual(gaap[name]?.units?.USD, 8)
    if (p.length && p[0].date > bestDate) { bestDate = p[0].date; dates = p.map((x) => x.date) }
  }
  if (!dates.length) throw new Error('Could not determine fiscal periods')

  const revenue        = bestConcept(gaap, revConcepts, dates)
  const grossProfit    = bestConcept(gaap, ['GrossProfit'], dates)
  const opIncome       = bestConcept(gaap, ['OperatingIncomeLoss'], dates)
  const netIncome      = bestConcept(gaap, ['NetIncomeLoss', 'ProfitLoss'], dates)
  const eps            = bestConcept(gaap, ['EarningsPerShareBasic'], dates, 'USD/shares')
  const epsDiluted     = bestConcept(gaap, ['EarningsPerShareDiluted'], dates, 'USD/shares')

  return dates.map((date, i) => ({
    year: parseInt(date.slice(0, 4)),
    date,
    revenue: revenue[i],
    grossProfit: grossProfit[i],
    operatingIncome: opIncome[i],
    netIncome: netIncome[i],
    eps: eps[i],
    epsDiluted: epsDiluted[i],
  })).reverse() // oldest first for charting
}

async function fetchHistoryFromYahoo(symbol: string): Promise<AnnualBar[]> {
  const data = await yahooFinancials(symbol, 'annual')
  return data.income.map((row) => {
    const date = String(row.date || '')
    return {
      year: date ? parseInt(date.slice(0, 4)) : 0,
      date,
      revenue: (row.revenue as number | null) ?? null,
      grossProfit: (row.grossProfit as number | null) ?? null,
      operatingIncome: (row.operatingIncome as number | null) ?? null,
      netIncome: (row.netIncome as number | null) ?? null,
      eps: (row.eps as number | null) ?? null,
      epsDiluted: (row.epsdiluted as number | null) ?? null,
    }
  }).filter((r) => r.year > 0).reverse()
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `fin-history:${symbol}`
  const cached = getCached<AnnualBar[]>(key)
  if (cached) return Response.json(cached)

  // International: Yahoo directly
  if (symbol.includes('.')) {
    try {
      const data = await fetchHistoryFromYahoo(symbol)
      setCached(key, data, TTL.FUNDAMENTALS)
      return Response.json(data)
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 503 })
    }
  }

  // US: EDGAR primary, Yahoo fallback
  try {
    const data = await fetchHistory(symbol)
    setCached(key, data, TTL.FUNDAMENTALS)
    return Response.json(data)
  } catch (_) { /* fall through */ }

  try {
    const data = await fetchHistoryFromYahoo(symbol)
    setCached(key, data, TTL.FUNDAMENTALS)
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
