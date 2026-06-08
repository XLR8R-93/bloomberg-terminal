// Batch quote endpoint: /api/quotes?symbols=AAPL,BHP.AX,CBA.AX
// Returns { [symbol]: { c, d, dp } }
import { type NextRequest } from 'next/server'
import { fetchCrumb } from '@/lib/providers/yahoo'
import { finnhub } from '@/lib/providers/finnhub'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

interface Quote { c: number; d: number; dp: number }

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? ''
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length) return Response.json({})

  // Yahoo handles: internationals (.AX, .L, etc.), futures (=F), FX (=X), indices (^)
  const intl  = symbols.filter(s => s.includes('.') || s.includes('=') || s.startsWith('^'))
  const local = symbols.filter(s => !s.includes('.') && !s.includes('=') && !s.startsWith('^'))
  const result: Record<string, Quote> = {}

  // ── International via Yahoo v7 batch ──────────────────────────
  if (intl.length) {
    try {
      const { crumb, cookie } = await fetchCrumb()
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${intl.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })
      if (res.ok) {
        const json = await res.json()
        for (const q of json?.quoteResponse?.result ?? []) {
          result[q.symbol] = {
            c:  q.regularMarketPrice        ?? 0,
            d:  q.regularMarketChange       ?? 0,
            dp: q.regularMarketChangePercent ?? 0,
          }
        }
      }
    } catch { /* leave nulls */ }
  }

  // ── US via Finnhub (individual, no batch in free tier) ────────
  await Promise.allSettled(local.map(async sym => {
    try {
      const q = await finnhub.quote(sym)
      if (q?.c) result[sym] = { c: q.c, d: q.d ?? 0, dp: q.dp ?? 0 }
    } catch { /* skip */ }
  }))

  return Response.json(result)
}
