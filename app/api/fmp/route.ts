import { type NextRequest } from 'next/server'
import { getCached, setCached, TTL } from '@/lib/cache'
import { fetchEdgarFA } from '@/lib/providers/edgar'
import { yahooFinancials } from '@/lib/providers/yahoo'

const BASE = 'https://financialmodelingprep.com/api/v3'

function isInternational(symbol: string) {
  return symbol.includes('.')
}

async function fmpGet<T>(path: string): Promise<T> {
  const key = process.env.FMP_API_KEY
  if (!key) throw new Error('FMP_API_KEY not set')
  const url = `${BASE}${path}&apikey=${key}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FMP ${path} → ${res.status}`)
  return res.json()
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const period = (request.nextUrl.searchParams.get('period') || 'annual') as 'annual' | 'quarterly'

  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const cacheKey = `fa:${symbol}:${period}`
  const cached = getCached(cacheKey)
  if (cached) return Response.json(cached)

  // International tickers: go straight to Yahoo Finance
  if (isInternational(symbol)) {
    try {
      const data = await yahooFinancials(symbol, period)
      setCached(cacheKey, data, TTL.FUNDAMENTALS)
      return Response.json(data)
    } catch (e: unknown) {
      const c = getCached(cacheKey)
      if (c) return Response.json(c)
      return Response.json({ error: String(e), income: [], balance: [], cash: [] }, { status: 503 })
    }
  }

  // US tickers: FMP → EDGAR → Yahoo fallback chain
  if (process.env.FMP_API_KEY) {
    try {
      const periodParam = period === 'quarterly' ? 'quarter' : 'annual'
      const [income, balance, cash] = await Promise.all([
        fmpGet<Record<string, unknown>[]>(`/income-statement/${symbol}?period=${periodParam}&limit=5`),
        fmpGet<Record<string, unknown>[]>(`/balance-sheet-statement/${symbol}?period=${periodParam}&limit=5`),
        fmpGet<Record<string, unknown>[]>(`/cash-flow-statement/${symbol}?period=${periodParam}&limit=5`),
      ])
      const data = { income, balance, cash, _source: 'fmp' }
      setCached(cacheKey, data, TTL.FUNDAMENTALS)
      return Response.json(data)
    } catch (_) {
      // fall through
    }
  }

  try {
    const data = await fetchEdgarFA(symbol, period)
    setCached(cacheKey, { ...data, _source: 'edgar' }, TTL.FUNDAMENTALS)
    return Response.json({ ...data, _source: 'edgar' })
  } catch (_) {
    // fall through to Yahoo
  }

  try {
    const data = await yahooFinancials(symbol, period)
    setCached(cacheKey, data, TTL.FUNDAMENTALS)
    return Response.json(data)
  } catch (e: unknown) {
    const c = getCached(cacheKey)
    if (c) return Response.json(c)
    return Response.json({ error: String(e), income: [], balance: [], cash: [] }, { status: 503 })
  }
}
