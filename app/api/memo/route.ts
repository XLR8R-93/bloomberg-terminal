import { type NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { getCached, setCached } from '@/lib/cache'

function getGroq() { return new Groq({ apiKey: process.env.GROQ_API_KEY }) }
const UA = 'Mozilla/5.0 (compatible; OakwoodCapital/1.0)'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FinancialRow {
  year: number
  revenue: number | null
  ebit: number | null
  npat: number | null
}

export interface PriceVolumePoint {
  t: string
  c: number
  v: number
}

export interface ThesisRow {
  label: string
  oakwoodView: string
  valuationImplications: string
}

export interface RiskItem {
  title: string
  description: string
}

export interface ScoringCriterion {
  name: string
  description: string
  score: number
  maxScore: number
  note: string
}

export interface ScoreCard {
  totalScore: number
  maxScore: number
  criteria: ScoringCriterion[]
}

export interface DCFOutput {
  revenueGrowthRate: string
  npatMargin: string
  wacc: string
  terminalGrowthRate: string
  impliedValue: string
  updownside: string
  updownsidePct: number
  commentary: string
}

export interface PeerRow {
  ticker:    string
  name:      string
  marketCap: string | null
  pe:        number | null
  evEbitda:  number | null
  evRevenue: number | null
  pb:        number | null
  divYield:  number | null
}

export interface KeyMetrics {
  price:       number | null
  pe:          number | null
  evEbitda:    number | null
  evRevenue:   number | null
  pb:          number | null
  divYield:    number | null
  fcfYield:    number | null
  roe:         number | null
  week52High:  number | null
  week52Low:   number | null
  netDebt:     number | null
  debtEquity:  number | null
}

export interface CompanyStats {
  founded:          string | null
  industry:         string | null
  marketCap:        string | null
  employees:        string | null
  country:          string | null
  ltmRevenue:       string | null
  ltmNpat:          string | null
  netCashDebt:      string | null
  sectorsServiced:  string | null
  productCategories:string | null
}

export interface MemoData {
  ticker:           string
  companyName:      string
  sector:           string
  date:             string
  companyOverview:  string
  thesisRows:       ThesisRow[]
  keyRisks:         RiskItem[]
  dcf:              DCFOutput | null
  scoreCard:        ScoreCard | null
  recommendation:   'BUY' | 'HOLD' | 'SELL' | 'AVOID'
  conviction:       'HIGH' | 'MEDIUM' | 'LOW'
  targetPrice:      string
  analystNotes:     string
  sectorsServiced:  string | null
  productCategories:string | null
  financials:       FinancialRow[]
  priceVolume:      PriceVolumePoint[]
  companyStats:     CompanyStats
  keyMetrics:       KeyMetrics
  peers:            PeerRow[]
  _cached?:         boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtM(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  const m = n / 1_000_000
  const abs = Math.abs(m)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(2)}b` : `$${abs.toFixed(2)}m`
  return m < 0 ? `(${s})` : s
}

function fmtNetDebt(n: number | null | undefined): string | null {
  if (n == null) return null
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(2)}b` : `$${abs.toFixed(1)}m`
  if (n < 0)   return `Net Cash ${s}`
  if (n === 0) return 'Net Cash Neutral'
  return `Net Debt ${s}`
}

// Treat exact-zero EBIT as missing data when revenue is substantial —
// Yahoo Finance returns 0 instead of null for some international stocks (e.g. BHP.AX).
function cleanEbit(ebit: number | null, revenue: number | null): number | null {
  if (ebit === 0 && revenue != null && Math.abs(revenue) > 1_000_000) return null
  return ebit
}

// ── Server-side DCF ───────────────────────────────────────────────────────────
function calcDCF(
  annuals:    FinancialRow[],
  keyMetrics: KeyMetrics,
  marketCapM: number,
  price:      number,
  country:    string,
): DCFOutput | null {
  if (annuals.length < 2 || price <= 0 || marketCapM <= 0) return null

  const validRev  = annuals.filter(r => r.revenue != null && r.revenue > 0)
  // Only profitable years for margin — loss years suppress projected earnings unrealistically
  const profitYrs = annuals.filter(r => r.npat != null && r.npat > 0 && r.revenue != null && r.revenue > 0)
  if (validRev.length < 2) return null

  // Revenue CAGR across all available years (up to 5)
  const firstRev = validRev[0].revenue!
  const lastRev  = validRev[validRev.length - 1].revenue!
  const spanYrs  = validRev.length - 1
  const rawCAGR  = Math.pow(lastRev / firstRev, 1 / spanYrs) - 1
  const revCAGR  = Math.max(-0.15, Math.min(0.35, rawCAGR))

  // NPAT margin: weight LTM 60%, historical average 40%
  // Uses only profitable years so a single bad year doesn't collapse the projection
  const allMargins = profitYrs.map(r => r.npat! / r.revenue!)
  const avgMargin  = allMargins.length > 0
    ? allMargins.reduce((a, b) => a + b, 0) / allMargins.length
    : 0.08
  const ltmMargin  = profitYrs.length > 0
    ? profitYrs[profitYrs.length - 1].npat! / profitYrs[profitYrs.length - 1].revenue!
    : avgMargin
  // Blended: recent margin weighted 60% to reflect current business quality
  const rawMargin  = profitYrs.length > 1
    ? 0.6 * ltmMargin + 0.4 * avgMargin
    : avgMargin
  const projMargin = Math.max(0.01, Math.min(0.55, rawMargin))

  // Country-adjusted WACC (conservatively set but market-connected)
  const waccMap: Record<string, number> = { AU: 0.095, US: 0.085, GB: 0.09, CA: 0.09 }
  const wacc = waccMap[country] ?? 0.10

  // 5-year NPAT projection, discounted
  const baseRevM = lastRev / 1_000_000   // absolute dollars → millions
  let equityValueM = 0
  let projRevM = baseRevM
  for (let y = 1; y <= 5; y++) {
    projRevM *= (1 + revCAGR)
    const projNpat = projRevM * projMargin
    equityValueM += projNpat / Math.pow(1 + wacc, y)
  }

  // Terminal value — exit multiple method (market-connected)
  // Uses company's current P/E de-rated 20% for conservatism, capped 12–30x.
  // Falls back to Gordon Growth (g=2.5%) if P/E unavailable.
  // Exit multiple anchors to what the market actually pays, fixing the chronic
  // under-valuation from applying a perpetuity at a high discount rate to quality companies.
  const year5NpatM = baseRevM * Math.pow(1 + revCAGR, 5) * projMargin
  let exitMultiple: number
  if (keyMetrics.pe != null && keyMetrics.pe > 0) {
    exitMultiple = Math.min(Math.max(keyMetrics.pe * 0.80, 12), 30)
  } else {
    // Gordon Growth fallback: 1.025 / (wacc - 0.025)
    exitMultiple = 1.025 / (wacc - 0.025)
  }
  const terminalM = year5NpatM * exitMultiple
  equityValueM += terminalM / Math.pow(1 + wacc, 5)

  // Net debt adjustment (Finnhub netDebtAnnual: positive = debt, negative = cash)
  equityValueM -= (keyMetrics.netDebt ?? 0)

  if (equityValueM <= 0) {
    return {
      revenueGrowthRate:  `${(revCAGR * 100).toFixed(1)}%`,
      npatMargin:         `${(projMargin * 100).toFixed(1)}%`,
      wacc:               `${(wacc * 100).toFixed(1)}%`,
      terminalGrowthRate: `${exitMultiple.toFixed(1)}x exit`,
      impliedValue:       'N/A (negative equity)',
      updownside:         'N/A',
      updownsidePct:      -100,
      commentary:         '',
    }
  }

  // Implied share price: equityValueM and marketCapM both in millions
  const impliedPrice   = equityValueM * price / marketCapM
  const updownsidePct  = ((impliedPrice - price) / price) * 100

  return {
    revenueGrowthRate:  `${(revCAGR * 100).toFixed(1)}%`,
    npatMargin:         `${(projMargin * 100).toFixed(1)}%`,
    wacc:               `${(wacc * 100).toFixed(1)}%`,
    terminalGrowthRate: `${exitMultiple.toFixed(1)}x exit P/E`,
    impliedValue:       `$${impliedPrice.toFixed(2)} per share`,
    updownside:         updownsidePct >= 0
                          ? `+${updownsidePct.toFixed(1)}% upside`
                          : `${updownsidePct.toFixed(1)}% downside`,
    updownsidePct,
    commentary: '', // filled by AI
  }
}

// ── Server-side conviction scoring ────────────────────────────────────────────
function calcConviction(
  annuals:    FinancialRow[],
  keyMetrics: KeyMetrics,
  dcf:        DCFOutput | null,
  marketCapM: number,
): { conviction: 'HIGH' | 'MEDIUM' | 'LOW'; recommendation: 'BUY' | 'HOLD' | 'SELL' | 'AVOID'; scoreCard: ScoreCard; targetPrice: string } {

  const criteria: ScoringCriterion[] = []

  // ── 1. Revenue Growth (3yr CAGR) ─────────────────────────────────────────
  const validRev = annuals.filter(r => r.revenue != null && r.revenue > 0)
  let revCagr: number | null = null
  if (validRev.length >= 2) {
    const span = validRev.length - 1
    revCagr = Math.pow(validRev[validRev.length - 1].revenue! / validRev[0].revenue!, 1 / span) - 1
  }
  let revScore = 0, revNote = 'Insufficient data'
  if (revCagr != null) {
    if      (revCagr >= 0.15) { revScore = 2;   revNote = `${(revCagr*100).toFixed(1)}% CAGR — strong growth` }
    else if (revCagr >= 0.08) { revScore = 1.5; revNote = `${(revCagr*100).toFixed(1)}% CAGR — solid growth` }
    else if (revCagr >= 0.03) { revScore = 1;   revNote = `${(revCagr*100).toFixed(1)}% CAGR — modest growth` }
    else if (revCagr >= 0)    { revScore = 0.5; revNote = `${(revCagr*100).toFixed(1)}% CAGR — flat revenue` }
    else                      { revScore = 0;   revNote = `${(revCagr*100).toFixed(1)}% CAGR — declining revenue` }
  }
  criteria.push({ name: 'Revenue Growth', description: '3-year revenue CAGR', score: revScore, maxScore: 2, note: revNote })

  // ── 2. Earnings Quality (NPAT CAGR) ──────────────────────────────────────
  const validNpat = annuals.filter(r => r.npat != null)
  let npatCagr: number | null = null
  let isLossMaking = false
  if (validNpat.length >= 2) {
    const first = validNpat[0].npat!
    const last  = validNpat[validNpat.length - 1].npat!
    isLossMaking = last < 0
    if (first > 0 && last > 0) {
      npatCagr = Math.pow(last / first, 1 / (validNpat.length - 1)) - 1
    }
  }
  let npatScore = 0, npatNote = 'Insufficient data'
  if (isLossMaking) {
    npatScore = 0; npatNote = 'LTM NPAT negative — loss-making'
  } else if (npatCagr != null) {
    if      (npatCagr >= 0.15) { npatScore = 2;   npatNote = `${(npatCagr*100).toFixed(1)}% CAGR — strong earnings growth` }
    else if (npatCagr >= 0.08) { npatScore = 1.5; npatNote = `${(npatCagr*100).toFixed(1)}% CAGR — solid earnings growth` }
    else if (npatCagr >= 0.03) { npatScore = 1;   npatNote = `${(npatCagr*100).toFixed(1)}% CAGR — modest earnings growth` }
    else if (npatCagr >= 0)    { npatScore = 0.5; npatNote = `${(npatCagr*100).toFixed(1)}% CAGR — flat earnings` }
    else                       { npatScore = 0;   npatNote = `${(npatCagr*100).toFixed(1)}% CAGR — earnings declining` }
  }
  criteria.push({ name: 'Earnings Quality', description: '3-year NPAT CAGR', score: npatScore, maxScore: 2, note: npatNote })

  // ── 3. Profitability (avg NPAT margin) ───────────────────────────────────
  const npatMargins = annuals
    .filter(r => r.revenue != null && r.revenue > 0 && r.npat != null)
    .map(r => r.npat! / r.revenue!)
  const avgMargin = npatMargins.length > 0
    ? npatMargins.reduce((a, b) => a + b, 0) / npatMargins.length : null
  let marginScore = 0, marginNote = 'Insufficient data'
  if (avgMargin != null) {
    if      (avgMargin >= 0.20) { marginScore = 2;   marginNote = `${(avgMargin*100).toFixed(1)}% avg NPAT margin — excellent` }
    else if (avgMargin >= 0.12) { marginScore = 1.5; marginNote = `${(avgMargin*100).toFixed(1)}% avg NPAT margin — strong` }
    else if (avgMargin >= 0.06) { marginScore = 1;   marginNote = `${(avgMargin*100).toFixed(1)}% avg NPAT margin — adequate` }
    else if (avgMargin >= 0)    { marginScore = 0.5; marginNote = `${(avgMargin*100).toFixed(1)}% avg NPAT margin — thin` }
    else                        { marginScore = 0;   marginNote = `${(avgMargin*100).toFixed(1)}% avg NPAT margin — unprofitable` }
  }
  criteria.push({ name: 'Profitability', description: 'Average NPAT margin (3yr)', score: marginScore, maxScore: 2, note: marginNote })

  // ── 4. Return on Equity (ROE) ─────────────────────────────────────────────
  const roe = keyMetrics.roe
  let roeScore = 0, roeNote = 'ROE not available'
  if (roe != null) {
    if      (roe >= 20) { roeScore = 2;   roeNote = `${roe.toFixed(1)}% ROE — exceptional capital efficiency` }
    else if (roe >= 15) { roeScore = 1.5; roeNote = `${roe.toFixed(1)}% ROE — above-average returns` }
    else if (roe >= 10) { roeScore = 1;   roeNote = `${roe.toFixed(1)}% ROE — adequate returns` }
    else if (roe >= 5)  { roeScore = 0.5; roeNote = `${roe.toFixed(1)}% ROE — below-average returns` }
    else                { roeScore = 0;   roeNote = `${roe.toFixed(1)}% ROE — poor capital returns` }
  }
  criteria.push({ name: 'Return on Equity', description: 'LTM ROE (Finnhub TTM)', score: roeScore, maxScore: 2, note: roeNote })

  // ── 5. Balance Sheet Strength (net debt vs market cap) ───────────────────
  const netDebt = keyMetrics.netDebt   // millions; positive = debt, negative = cash
  let bsScore = 0, bsNote = 'Net debt data not available'
  if (netDebt != null && marketCapM > 0) {
    const ratio = netDebt / marketCapM
    if      (netDebt < 0)    { bsScore = 2;   bsNote = `Net cash — fortress balance sheet` }
    else if (ratio < 0.10)   { bsScore = 1.5; bsNote = `Net debt / mkt cap ${(ratio*100).toFixed(0)}% — conservative leverage` }
    else if (ratio < 0.30)   { bsScore = 1;   bsNote = `Net debt / mkt cap ${(ratio*100).toFixed(0)}% — moderate leverage` }
    else if (ratio < 0.50)   { bsScore = 0.5; bsNote = `Net debt / mkt cap ${(ratio*100).toFixed(0)}% — elevated leverage` }
    else                     { bsScore = 0;   bsNote = `Net debt / mkt cap ${(ratio*100).toFixed(0)}% — high leverage` }
  }
  criteria.push({ name: 'Balance Sheet', description: 'Net debt as % of market cap', score: bsScore, maxScore: 2, note: bsNote })

  // ── 6. DCF Valuation Upside ───────────────────────────────────────────────
  const updownside = dcf?.updownsidePct ?? null
  let valScore = 0, valNote = 'DCF not calculable'
  if (updownside != null && updownside > -100) {
    if      (updownside >= 40) { valScore = 2;   valNote = `+${updownside.toFixed(1)}% DCF upside — materially undervalued` }
    else if (updownside >= 20) { valScore = 1.5; valNote = `+${updownside.toFixed(1)}% DCF upside — undervalued` }
    else if (updownside >= 5)  { valScore = 1;   valNote = `+${updownside.toFixed(1)}% DCF upside — modest upside` }
    else if (updownside >= -5) { valScore = 0.5; valNote = `${updownside.toFixed(1)}% — fairly valued` }
    else                       { valScore = 0;   valNote = `${updownside.toFixed(1)}% DCF downside — overvalued` }
  }
  criteria.push({ name: 'DCF Valuation', description: 'DCF implied upside / downside vs current price', score: valScore, maxScore: 2, note: valNote })

  // ── Score → Conviction ────────────────────────────────────────────────────
  const totalScore = criteria.reduce((s, c) => s + c.score, 0)
  const maxScore   = 12

  let conviction: 'HIGH' | 'MEDIUM' | 'LOW'
  if      (totalScore >= 8)   conviction = 'HIGH'
  else if (totalScore >= 4.5) conviction = 'MEDIUM'
  else                        conviction = 'LOW'

  // ── Conviction + Upside → Recommendation ─────────────────────────────────
  let recommendation: 'BUY' | 'HOLD' | 'SELL' | 'AVOID'
  const up = updownside ?? 0
  if (conviction === 'HIGH' && up >= 10)         recommendation = 'BUY'
  else if (conviction === 'HIGH')                recommendation = 'HOLD'
  else if (conviction === 'MEDIUM' && up >= 20)  recommendation = 'BUY'
  else if (conviction === 'MEDIUM')              recommendation = 'HOLD'
  else if (conviction === 'LOW'  && up <= -15)   recommendation = 'AVOID'
  else if (isLossMaking && up <= -5)             recommendation = 'AVOID'
  else                                           recommendation = 'HOLD'

  const targetPrice = dcf && dcf.impliedValue !== 'N/A (negative equity)'
    ? dcf.impliedValue.replace(' per share', '')
    : 'N/A'

  return {
    conviction,
    recommendation,
    targetPrice,
    scoreCard: { totalScore, maxScore, criteria },
  }
}

async function fetchPeers(symbol: string, base: string): Promise<PeerRow[]> {
  try {
    const peersUrl = `https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`
    const peersRes = await fetch(peersUrl)
    const allPeers: string[] = await peersRes.json()
    // Exclude the subject company itself, take up to 4
    const peerSymbols = (Array.isArray(allPeers) ? allPeers : [])
      .filter(p => p !== symbol)
      .slice(0, 4)
    if (peerSymbols.length === 0) return []

    const results = await Promise.allSettled(
      peerSymbols.map(async (ps): Promise<PeerRow> => {
        const [profRes, metRes] = await Promise.allSettled([
          fetch(`${base}/api/finnhub/profile?symbol=${ps}`).then(r => r.json()),
          fetch(`${base}/api/finnhub/metrics?symbol=${ps}`).then(r => r.json()),
        ])
        const prof = profRes.status === 'fulfilled' ? profRes.value : {}
        const met  = metRes.status  === 'fulfilled' ? metRes.value  : {}
        const mm   = met?.metric ?? {}
        const mcM  = Number(prof.marketCapitalization) || 0
        return {
          ticker:    ps,
          name:      prof.name ?? ps,
          marketCap: mcM > 0 ? `$${(mcM / 1000).toFixed(1)}b` : null,
          pe:        mm.peTTM                                         ?? null,
          evEbitda:  mm['currentEv/ebitdaTTM'] ?? mm.evEbitdaTTM     ?? null,
          evRevenue: mm['currentEv/revenuesTTM'] ?? mm.evRevenuesTTM ?? null,
          pb:        mm.pbAnnual                                      ?? null,
          divYield:  mm.dividendYieldIndicatedAnnual                  ?? null,
        }
      })
    )
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<PeerRow>).value)
  } catch { return [] }
}

async function fetchPriceVolume(symbol: string): Promise<PriceVolumePoint[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return []
    const timestamps: number[] = result.timestamp ?? []
    const closes:  (number | null)[] = result.indicators?.quote?.[0]?.close  ?? []
    const volumes: (number | null)[] = result.indicators?.quote?.[0]?.volume ?? []
    const points: PriceVolumePoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i]
      if (c == null || isNaN(c)) continue
      const d = new Date(timestamps[i] * 1000)
      const t = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
      points.push({ t, c, v: volumes[i] ?? 0 })
    }
    return points
  } catch { return [] }
}

const OAKWOOD_SYSTEM = `You are a senior investment analyst at Oakwood Capital, a Sydney-based family office and hedge fund. Write concise, institutional-quality investment memoranda.

Philosophy: Quality Management, Quality Franchise, Quality Financials.
Constraints: no margin, no crypto, no derivatives. ASX and global equities via CommSec. Australian English.
Return ONLY valid JSON — no markdown, no preamble.`

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { symbol } = body
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `memo7:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json({ ...cached as object, _cached: true })

  const base = request.nextUrl.origin

  const [profileRes, quoteRes, metricsRes, financialsRes] = await Promise.allSettled([
    fetch(`${base}/api/finnhub/profile?symbol=${symbol}`).then(r => r.json()),
    fetch(`${base}/api/finnhub/quote?symbol=${symbol}`).then(r => r.json()),
    fetch(`${base}/api/finnhub/metrics?symbol=${symbol}`).then(r => r.json()),
    fetch(`${base}/api/financials/history?symbol=${symbol}`).then(r => r.json()),
  ])
  const pvPromise   = fetchPriceVolume(symbol)

  const profile = profileRes.status    === 'fulfilled' ? profileRes.value    : {}
  const quote   = quoteRes.status      === 'fulfilled' ? quoteRes.value      : {}
  const metrics = metricsRes.status    === 'fulfilled' ? metricsRes.value    : {}
  const rawFin  = financialsRes.status === 'fulfilled' ? financialsRes.value : []

  // Fetch peers in parallel with price/volume
  const [priceVolume, peers] = await Promise.all([
    pvPromise,
    fetchPeers(symbol, base),
  ])

  const m = metrics?.metric ?? {}

  const keyMetrics: KeyMetrics = {
    price:      quote.c                                           ?? null,
    pe:         m.peTTM                                           ?? null,
    evEbitda:   m['currentEv/ebitdaTTM'] ?? m.evEbitdaTTM        ?? null,
    evRevenue:  m['currentEv/revenuesTTM'] ?? m.evRevenuesTTM    ?? null,
    pb:         m.pbAnnual                                        ?? null,
    divYield:   m.dividendYieldIndicatedAnnual                    ?? null,
    fcfYield:   m.fcfYieldTTM                                     ?? null,
    roe:        m.roeTTM                                          ?? null,
    week52High: m['52WeekHigh']                                   ?? null,
    week52Low:  m['52WeekLow']                                    ?? null,
    netDebt:    m.netDebtAnnual                                   ?? null,
    debtEquity: m.totalDebt_totalEquityAnnual                     ?? null,
  }

  const annuals: FinancialRow[] = Array.isArray(rawFin)
    ? rawFin.slice(-5).map((r: { year: number; revenue: number | null; operatingIncome: number | null; netIncome: number | null }) => ({
        year:    r.year,
        revenue: r.revenue,
        ebit:    cleanEbit(r.operatingIncome, r.revenue),
        npat:    r.netIncome,
      }))
    : []

  const ltm = annuals.length > 0 ? annuals[annuals.length - 1] : null
  const marketCapM = Number(profile.marketCapitalization) || 0
  const price      = Number(quote.c) || 0
  const country    = (profile.country ?? '').toUpperCase().slice(0, 2)

  const companyStats: CompanyStats = {
    founded:           profile.ipo ? String(new Date(profile.ipo).getFullYear()) : null,
    industry:          profile.finnhubIndustry ?? profile.gsector ?? null,
    marketCap:         marketCapM ? `$${(marketCapM / 1000).toFixed(2)}b` : null,
    employees:         profile.employeeTotal ? Number(profile.employeeTotal).toLocaleString() : null,
    country:           profile.country ?? null,
    ltmRevenue:        ltm ? fmtM(ltm.revenue) : null,
    ltmNpat:           ltm ? fmtM(ltm.npat) : null,
    netCashDebt:       fmtNetDebt(m.netDebtAnnual),
    sectorsServiced:   null,
    productCategories: null,
  }

  // ── Quantitative calculations (server-side, formula-driven) ───────────────
  const dcfRaw  = calcDCF(annuals, keyMetrics, marketCapM, price, country)
  const quant   = calcConviction(annuals, keyMetrics, dcfRaw, marketCapM)

  // ── AI prompt ─────────────────────────────────────────────────────────────
  const finContext = annuals.map(r =>
    `${r.year}: Revenue=${fmtM(r.revenue)}, EBIT=${fmtM(r.ebit)}, NPAT=${fmtM(r.npat)}`
  ).join('\n')

  const contextBlock = `
TICKER: ${symbol}
COMPANY: ${profile.name ?? 'Unknown'}
SECTOR: ${profile.finnhubIndustry ?? 'Unknown'}
COUNTRY: ${profile.country ?? 'Unknown'}
MARKET CAP: ${marketCapM ? `$${(marketCapM/1000).toFixed(2)}b` : 'N/A'}
PRICE: ${price || 'N/A'}
52W HIGH/LOW: ${m['52WeekHigh'] ?? 'N/A'} / ${m['52WeekLow'] ?? 'N/A'}
P/E TTM: ${m.peTTM ?? 'N/A'}
EV/EBITDA: ${m['currentEv/ebitdaTTM'] ?? 'N/A'}
ROE: ${m.roeTTM ?? 'N/A'}%
NET DEBT: ${m.netDebtAnnual != null ? `$${m.netDebtAnnual}m` : 'N/A'}
ANNUAL FINANCIALS:\n${finContext || 'Not available'}
DESCRIPTION: ${profile.description ?? 'Not available'}

QUANTITATIVE ANALYSIS (already calculated — do not recalculate):
RECOMMENDATION: ${quant.recommendation}
CONVICTION: ${quant.conviction}  (score ${quant.scoreCard.totalScore.toFixed(1)}/12)
TARGET PRICE: ${quant.targetPrice}
DCF UPSIDE/DOWNSIDE: ${dcfRaw?.updownside ?? 'N/A'}
DCF WACC: ${dcfRaw?.wacc ?? 'N/A'}, REVENUE GROWTH: ${dcfRaw?.revenueGrowthRate ?? 'N/A'}, NPAT MARGIN: ${dcfRaw?.npatMargin ?? 'N/A'}`.trim()

  const prompt = `${OAKWOOD_SYSTEM}

${contextBlock}

Return ONLY valid JSON (do NOT change recommendation/conviction/targetPrice — those are fixed):
{
  "companyOverview": string (2-3 sentences, factual),
  "sectorsServiced": string (comma-separated end markets, e.g. "Mining, Infrastructure, Agriculture"),
  "productCategories": string (comma-separated product/service types),
  "thesisRows": [
    { "label": string (2-4 words), "oakwoodView": string (2 sentences), "valuationImplications": string (2 sentences) }
  ],
  "keyRisks": [
    { "title": string (3-6 words), "description": string (2 sentences) }
  ],
  "dcfCommentary": string (1 sentence: are the DCF assumptions conservative or aggressive given the company profile?),
  "analystNotes": string (2-3 sentences, qualitative commentary)
}
Rules: thesisRows exactly 3, keyRisks exactly 4. Australian English.`

  try {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'JSON-only responder. No prose, no markdown.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const ai = JSON.parse(completion.choices[0]?.message?.content ?? '{}')

    const dcf: DCFOutput | null = dcfRaw
      ? { ...dcfRaw, commentary: ai.dcfCommentary ?? '' }
      : null

    const memo: MemoData = {
      ticker:            symbol,
      companyName:       profile.name            ?? symbol,
      sector:            profile.finnhubIndustry ?? 'Unknown',
      date:              new Date().toISOString().slice(0, 10),
      companyOverview:   ai.companyOverview       ?? '',
      thesisRows:        Array.isArray(ai.thesisRows) ? ai.thesisRows.slice(0, 3) : [],
      keyRisks:          Array.isArray(ai.keyRisks)   ? ai.keyRisks.slice(0, 4)   : [],
      dcf,
      scoreCard:         quant.scoreCard,
      recommendation:    quant.recommendation,
      conviction:        quant.conviction,
      targetPrice:       quant.targetPrice,
      analystNotes:      ai.analystNotes          ?? '',
      sectorsServiced:   ai.sectorsServiced        ?? null,
      productCategories: ai.productCategories      ?? null,
      financials:        annuals,
      priceVolume,
      keyMetrics,
      peers,
      companyStats: {
        ...companyStats,
        sectorsServiced:   ai.sectorsServiced   ?? null,
        productCategories: ai.productCategories ?? null,
      },
    }

    setCached(key, memo, 60 * 60 * 1000 * 6)
    return Response.json(memo)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
