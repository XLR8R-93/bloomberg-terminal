// GET /api/insider?symbol=AAPL
// Returns insider transactions for a given symbol via Finnhub
import { NextResponse, type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface InsiderTransaction {
  name:             string
  filingDate:       string
  transactionDate:  string
  transactionCode:  string   // P=purchase S=sale A=award/grant F=tax M=exercise
  transactionPrice: number | null
  share:            number   // shares in transaction (positive)
  change:           number   // negative = sale, positive = buy
  isDerivative:     boolean
  currency:         string
}

export interface InsiderData {
  symbol:      string
  transactions: InsiderTransaction[]
  // Aggregated 90-day sentiment
  netShares:   number    // positive = net buying, negative = net selling
  netValue:    number    // approx dollar value
  buyCount:    number
  sellCount:   number
}

// TX_CODE moved to lib/insider-codes.ts (Next.js route files cannot export non-handler values)

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const key = process.env.FINNHUB_API_KEY
  if (!key) return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })

  const cacheKey = `insider:${symbol}`
  const hit = getCached(cacheKey)
  if (hit) return NextResponse.json(hit)

  // Fetch 12 months of insider data
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date().toISOString().slice(0, 10)

  try {
    const res  = await fetch(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&from=${from}&to=${to}&token=${key}`
    )
    if (!res.ok) throw new Error(`Finnhub ${res.status}`)
    const json = await res.json()

    const raw: {
      name: string; filingDate: string; transactionDate: string
      transactionCode: string; transactionPrice: number | null
      share: number; change: number; isDerivative: boolean; currency: string
    }[] = (json.data ?? [])

    // Filter to meaningful open-market transactions (P=purchase, S=sale)
    // Include M (exercise) and A (award) for context but mark differently
    const transactions: InsiderTransaction[] = raw
      .filter(t => !t.isDerivative || ['M', 'X'].includes(t.transactionCode))
      .map(t => ({
        name:             t.name ?? '',
        filingDate:       t.filingDate ?? '',
        transactionDate:  t.transactionDate ?? t.filingDate ?? '',
        transactionCode:  t.transactionCode ?? '',
        transactionPrice: t.transactionPrice ?? null,
        share:            Math.abs(t.share ?? 0),
        change:           t.change ?? 0,
        isDerivative:     t.isDerivative ?? false,
        currency:         t.currency ?? 'USD',
      }))
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .slice(0, 50)  // most recent 50

    // 90-day sentiment summary (open-market buys/sells only)
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    const recent = transactions.filter(t =>
      t.transactionDate >= cutoff && ['P', 'S'].includes(t.transactionCode)
    )
    const buys  = recent.filter(t => t.transactionCode === 'P')
    const sells = recent.filter(t => t.transactionCode === 'S')

    const netShares = buys.reduce((s, t) => s + t.share, 0)
                    - sells.reduce((s, t) => s + t.share, 0)
    const netValue  = buys.reduce((s, t) => s + t.share * (t.transactionPrice ?? 0), 0)
                    - sells.reduce((s, t) => s + t.share * (t.transactionPrice ?? 0), 0)

    const result: InsiderData = {
      symbol,
      transactions,
      netShares,
      netValue,
      buyCount:  buys.length,
      sellCount: sells.length,
    }

    setCached(cacheKey, result, 60 * 60 * 1000)  // 1h cache
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
