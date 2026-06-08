// GET /api/scout
// Returns scored stock universe for PORT SCOUT view
// Cached 6h — fetches Yahoo quoteSummary for ~48 quality stocks
import { NextResponse } from 'next/server'
import { quoteSummary } from '@/lib/providers/yahoo'
import { getCached, setCached } from '@/lib/cache'

// ── Universe ──────────────────────────────────────────────────────────────────
const UNIVERSE = [
  // US Mega/Large Cap
  'MSFT','AAPL','GOOGL','NVDA','META','AMZN','V','MA','JPM','JNJ',
  'UNH','COST','ABBV','LLY','PG','KO','MCD','NFLX','ADBE','AMD',
  'AVGO','TXN','NOW','INTU','WMT','HD','XOM','CVX','WM','NEE',
  // ASX
  'BHP.AX','CBA.AX','CSL.AX','WES.AX','MQG.AX','ANZ.AX','NAB.AX',
  'RIO.AX','GMG.AX','REA.AX','XRO.AX','ALL.AX','COH.AX','WDS.AX',
  'WBC.AX','SHL.AX','RMD.AX','WOW.AX',
]

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ScoutStock {
  symbol:          string
  name:            string
  sector:          string
  price:           number
  marketCap:       number | null
  // Raw metrics (null = unavailable)
  revenueGrowth:   number | null   // e.g. 0.23 = 23%
  earningsGrowth:  number | null
  dividendYield:   number | null   // e.g. 2.5 = 2.5%
  payoutRatio:     number | null   // 0–1
  trailingPE:      number | null
  priceToBook:     number | null
  priceToSales:    number | null
  week52High:      number | null
  week52Low:       number | null
  beta:            number | null
  grossMargins:    number | null   // 0–1
  returnOnEquity:  number | null   // 0–1 (can exceed 1)
  operatingMargins:number | null   // 0–1
  // Computed scores 0–100
  growthScore:    number
  incomeScore:    number
  valueScore:     number
  defensiveScore: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function raw(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null
  const v = (obj as Record<string, unknown>)[key]
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object') {
    const r = (v as Record<string, unknown>).raw
    return typeof r === 'number' ? r : null
  }
  return null
}

function str(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object') return ''
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

// Percentile rank within array (0 = lowest, 1 = highest)
function rankNorm(values: (number | null)[], target: number | null): number {
  if (target == null) return 0
  const valid = values.filter((v): v is number => v != null)
  if (valid.length < 2) return 0.5
  const below = valid.filter(v => v < target).length
  return below / (valid.length - 1)
}

// ── Fetch one symbol ──────────────────────────────────────────────────────────
async function fetchOne(symbol: string): Promise<Omit<ScoutStock, 'growthScore' | 'incomeScore' | 'valueScore' | 'defensiveScore'> | null> {
  const cacheKey = `scout:${symbol}`
  const hit = getCached(cacheKey)
  if (hit) return hit as ReturnType<typeof fetchOne> extends Promise<infer T> ? Exclude<T, null> : never

  try {
    const data = await quoteSummary(
      symbol,
      'financialData,defaultKeyStatistics,summaryDetail,assetProfile,price'
    )
    const fd = data.financialData        as Record<string, unknown> ?? {}
    const ks = data.defaultKeyStatistics as Record<string, unknown> ?? {}
    const sd = data.summaryDetail        as Record<string, unknown> ?? {}
    const ap = data.assetProfile         as Record<string, unknown> ?? {}
    const pr = data.price                as Record<string, unknown> ?? {}

    const price       = raw(fd, 'currentPrice') ?? raw(pr, 'regularMarketPrice') ?? 0
    const w52Hi       = raw(sd, 'fiftyTwoWeekHigh')  ?? raw(pr, 'fiftyTwoWeekHigh')  ?? null
    const w52Lo       = raw(sd, 'fiftyTwoWeekLow')   ?? raw(pr, 'fiftyTwoWeekLow')   ?? null
    const divY        = raw(sd, 'dividendYield')      // 0–1 raw from Yahoo
    const payoutRaw   = raw(sd, 'payoutRatio')

    const result = {
      symbol,
      name:             str(pr, 'shortName') || str(pr, 'longName') || symbol,
      sector:           str(ap, 'sector') || 'Other',
      price,
      marketCap:        raw(pr, 'marketCap') ?? raw(sd, 'marketCap') ?? null,
      revenueGrowth:    raw(fd, 'revenueGrowth'),
      earningsGrowth:   raw(fd, 'earningsGrowth') ?? raw(ks, 'earningsQuarterlyGrowth'),
      dividendYield:    divY != null ? divY * 100 : null,          // convert to %
      payoutRatio:      payoutRaw,
      trailingPE:       raw(sd, 'trailingPE'),
      priceToBook:      raw(ks, 'priceToBook'),
      priceToSales:     raw(sd, 'priceToSalesTrailingTwelveMonths'),
      week52High:       w52Hi,
      week52Low:        w52Lo,
      beta:             raw(sd, 'beta') ?? raw(ks, 'beta'),
      grossMargins:     raw(fd, 'grossMargins'),
      returnOnEquity:   raw(fd, 'returnOnEquity'),
      operatingMargins: raw(fd, 'operatingMargins'),
    }

    setCached(cacheKey, result, 6 * 60 * 60 * 1000) // 6h
    return result
  } catch {
    return null
  }
}

// ── Score computation ─────────────────────────────────────────────────────────
function computeScores(stocks: Omit<ScoutStock, 'growthScore' | 'incomeScore' | 'valueScore' | 'defensiveScore'>[]): ScoutStock[] {
  // Pre-extract arrays for percentile normalisation
  const revGrowths    = stocks.map(s => s.revenueGrowth)
  const earnGrowths   = stocks.map(s => s.earningsGrowth)
  const divYields     = stocks.map(s => s.dividendYield)
  const earnYields    = stocks.map(s => s.trailingPE != null && s.trailingPE > 0 && s.trailingPE < 200 ? 1 / s.trailingPE : null)
  const invPBs        = stocks.map(s => s.priceToBook != null && s.priceToBook > 0 ? 1 / s.priceToBook : null)
  const invPSs        = stocks.map(s => s.priceToSales != null && s.priceToSales > 0 ? 1 / s.priceToSales : null)
  const discounts     = stocks.map(s => s.week52High != null && s.price > 0 ? Math.max(0, (s.week52High - s.price) / s.week52High) : null)
  const invBetas      = stocks.map(s => s.beta != null ? Math.max(0, 2 - s.beta) / 2 : null)
  const roes          = stocks.map(s => s.returnOnEquity != null ? Math.max(-1, Math.min(1, s.returnOnEquity)) : null)
  const grossMs       = stocks.map(s => s.grossMargins)
  const opMs          = stocks.map(s => s.operatingMargins)
  const sustainability = stocks.map(s =>
    s.payoutRatio != null && s.dividendYield != null && s.dividendYield > 0
      ? Math.max(0, 1 - s.payoutRatio)
      : null
  )

  return stocks.map((s, i) => {
    // ── Axis factors (used as cross-penalties to create trade-offs) ─────────
    // growthFactor: how much of a "growth stock" this is, 0–1
    const gRevR  = rankNorm(revGrowths,  revGrowths[i])
    const gEarnR = rankNorm(earnGrowths, earnGrowths[i])
    const growthFactor = gRevR * 0.55 + gEarnR * 0.45

    // incomeFactor: how much of an "income stock" this is, 0–1
    const iYieldR = rankNorm(divYields, divYields[i])
    const incomeFactor = iYieldR  // dividend yield is the dominant signal

    // ── GROWTH ──────────────────────────────────────────────────────────────
    // Momentum: near 52w high = price confirming growth thesis
    const gMomt  = discounts[i] != null ? 1 - discounts[i]! : 0.5
    // Penalty: mature high-yield dividend payers are not hypergrowth
    const gIncomeAdj = 1 - incomeFactor   // high yielder → lower growth score
    // Weights sum to 1.0
    const growthScore = Math.round(
      (gRevR * 0.35 + gEarnR * 0.30 + gMomt * 0.20 + gIncomeAdj * 0.15) * 100
    )

    // ── INCOME ──────────────────────────────────────────────────────────────
    const iSust = sustainability[i] != null
      ? rankNorm(sustainability, sustainability[i])
      : (s.dividendYield == null || s.dividendYield === 0 ? 0 : 0.5)
    // Penalty: high-growth companies reinvest rather than distribute
    const iGrowthAdj = 1 - growthFactor
    const incomeScore = Math.round(
      (iYieldR * 0.55 + iSust * 0.25 + iGrowthAdj * 0.20) * 100
    )

    // ── VALUE ───────────────────────────────────────────────────────────────
    // No cross-penalty here — P/E, P/B, P/S already naturally penalise
    // growth stocks (they trade at premium multiples), so it self-corrects.
    const vEY   = rankNorm(earnYields, earnYields[i])
    const vPB   = rankNorm(invPBs,     invPBs[i])
    const vPS   = rankNorm(invPSs,     invPSs[i])
    const vDisc = rankNorm(discounts,  discounts[i])
    const valueScore = Math.round(
      (vEY * 0.35 + vPB * 0.25 + vPS * 0.20 + vDisc * 0.20) * 100
    )

    // ── DEFENSIVE ───────────────────────────────────────────────────────────
    const dBeta = rankNorm(invBetas, invBetas[i])
    const dROE  = rankNorm(roes,     roes[i])
    const dGM   = rankNorm(grossMs,  grossMs[i])
    const dOM   = rankNorm(opMs,     opMs[i])
    // Key penalty: high-growth companies carry elevated execution/valuation risk
    // A stock with top-decile growth should not also top the defensive list.
    const dGrowthAdj = 1 - growthFactor
    const defensiveScore = Math.round(
      (dBeta * 0.25 + dROE * 0.20 + dGM * 0.20 + dOM * 0.15 + dGrowthAdj * 0.20) * 100
    )

    return { ...s, growthScore, incomeScore, valueScore, defensiveScore }
  })
}

// ── GET handler ───────────────────────────────────────────────────────────────
const FULL_CACHE_KEY = 'scout:full'

export async function GET() {
  const cached = getCached(FULL_CACHE_KEY)
  if (cached) return NextResponse.json(cached)

  // Fetch in batches of 8 concurrently to avoid Yahoo rate limits
  const BATCH = 8
  const raw_results: (Omit<ScoutStock, 'growthScore' | 'incomeScore' | 'valueScore' | 'defensiveScore'> | null)[] = []

  for (let i = 0; i < UNIVERSE.length; i += BATCH) {
    const batch = UNIVERSE.slice(i, i + BATCH)
    const res = await Promise.allSettled(batch.map(fetchOne))
    for (const r of res) {
      raw_results.push(r.status === 'fulfilled' ? r.value : null)
    }
  }

  const valid = raw_results.filter((s): s is NonNullable<typeof s> => s != null)
  const scored = computeScores(valid)

  setCached(FULL_CACHE_KEY, scored, 6 * 60 * 60 * 1000) // 6h full-result cache
  return NextResponse.json(scored)
}
