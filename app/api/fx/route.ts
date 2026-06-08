// GET /api/fx — returns FX rates relative to USD
// Uses Yahoo Finance FX pairs (AUDUSD=X, GBPUSD=X, etc.)
import { fetchCrumb } from '@/lib/providers/yahoo'
import { getCached, setCached } from '@/lib/cache'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const PAIRS = ['AUDUSD=X', 'GBPUSD=X', 'EURUSD=X', 'JPYUSD=X', 'CADUSD=X', 'HKDUSD=X', 'SGDUSD=X', 'NZDUSD=X']

export interface FXRates {
  // All rates are: 1 unit of currency = X USD
  USD: number
  AUD: number
  GBP: number
  EUR: number
  JPY: number
  CAD: number
  HKD: number
  SGD: number
  NZD: number
  updatedAt: number
}

export async function GET() {
  const key = 'fx:rates'
  const cached = getCached(key)
  if (cached) return Response.json(cached)

  try {
    const { crumb, cookie } = await fetchCrumb()
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${PAIRS.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })

    const rates: FXRates = { USD: 1, AUD: 0.65, GBP: 1.27, EUR: 1.08, JPY: 0.0067, CAD: 0.74, HKD: 0.128, SGD: 0.74, NZD: 0.61, updatedAt: Date.now() }

    if (res.ok) {
      const json = await res.json()
      for (const q of json?.quoteResponse?.result ?? []) {
        const sym = q.symbol as string
        const price = q.regularMarketPrice as number
        if (!price) continue
        if (sym === 'AUDUSD=X') rates.AUD = price
        if (sym === 'GBPUSD=X') rates.GBP = price
        if (sym === 'EURUSD=X') rates.EUR = price
        if (sym === 'JPYUSD=X') rates.JPY = price
        if (sym === 'CADUSD=X') rates.CAD = price
        if (sym === 'HKDUSD=X') rates.HKD = price
        if (sym === 'SGDUSD=X') rates.SGD = price
        if (sym === 'NZDUSD=X') rates.NZD = price
      }
    }

    rates.updatedAt = Date.now()
    setCached(key, rates, 10 * 60 * 1000) // 10 min
    return Response.json(rates)
  } catch {
    // Return sensible defaults on error
    const fallback: FXRates = { USD: 1, AUD: 0.65, GBP: 1.27, EUR: 1.08, JPY: 0.0067, CAD: 0.74, HKD: 0.128, SGD: 0.74, NZD: 0.61, updatedAt: Date.now() }
    return Response.json(fallback)
  }
}
