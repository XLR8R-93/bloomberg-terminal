import { type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'
import { quoteSummary as sharedQuoteSummary } from '@/lib/providers/yahoo'

async function fetchQuoteSummary(symbol: string, modules: string): Promise<Record<string, unknown>> {
  return sharedQuoteSummary(symbol, modules)
}

export interface EstimateRow {
  metric: string
  consensus: number | null
  low: number | null
  high: number | null
  count: number | null
  growth: number | null   // YoY %
}

export interface PriceTarget {
  mean: number | null
  low: number | null
  high: number | null
  median: number | null
  count: number | null
  recommendation: string | null
}

export interface EstimatesData {
  priceTarget: PriceTarget
  currentQuarter: EstimateRow[]
  nextQuarter: EstimateRow[]
  currentYear: EstimateRow[]
  nextYear: EstimateRow[]
}

function safeNum(v: unknown): number | null {
  if (v == null) return null
  const raw = typeof v === 'object' ? (v as Record<string, unknown>).raw : v
  const n = Number(raw)
  return isNaN(n) ? null : n
}

function safeStr(v: unknown): string | null {
  if (v == null) return null
  const raw = typeof v === 'object' ? (v as Record<string, unknown>).fmt ?? (v as Record<string, unknown>).raw : v
  return String(raw)
}

function parseTrend(trend: Record<string, unknown>): { eps: EstimateRow; revenue: EstimateRow } {
  const eps = trend.earningsEstimate as Record<string, unknown> || {}
  const rev = trend.revenueEstimate as Record<string, unknown> || {}
  const period = String(trend.period || '')

  return {
    eps: {
      metric: 'EPS',
      consensus: safeNum(eps.avg),
      low: safeNum(eps.low),
      high: safeNum(eps.high),
      count: safeNum(eps.numberOfAnalysts),
      growth: safeNum(eps.growth),
    },
    revenue: {
      metric: 'Revenue',
      consensus: safeNum(rev.avg),
      low: safeNum(rev.low),
      high: safeNum(rev.high),
      count: safeNum(rev.numberOfAnalysts),
      growth: safeNum(rev.growth),
    },
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `estimates:${symbol}`
  const cached = getCached<EstimatesData>(key)
  if (cached) return Response.json(cached)

  try {
    const result = await fetchQuoteSummary(symbol, 'earningsTrend,financialData')

    const trends = (result.earningsTrend as Record<string, unknown>)?.trend as Record<string, unknown>[] || []
    const fd = result.financialData as Record<string, unknown> || {}

    // trends[0]=current quarter, [1]=next quarter, [2]=current year, [3]=next year
    const parsed = trends.slice(0, 4).map(parseTrend)

    const data: EstimatesData = {
      priceTarget: {
        mean: safeNum(fd.targetMeanPrice),
        low: safeNum(fd.targetLowPrice),
        high: safeNum(fd.targetHighPrice),
        median: safeNum(fd.targetMedianPrice),
        count: safeNum(fd.numberOfAnalystOpinions),
        recommendation: safeStr(fd.recommendationKey),
      },
      currentQuarter: parsed[0] ? [parsed[0].eps, parsed[0].revenue] : [],
      nextQuarter:    parsed[1] ? [parsed[1].eps, parsed[1].revenue] : [],
      currentYear:    parsed[2] ? [parsed[2].eps, parsed[2].revenue] : [],
      nextYear:       parsed[3] ? [parsed[3].eps, parsed[3].revenue] : [],
    }

    setCached(key, data, 60 * 60_000) // 1-hour TTL
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
