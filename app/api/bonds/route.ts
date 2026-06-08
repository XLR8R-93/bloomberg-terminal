import { type NextRequest } from 'next/server'
import { getCached, setCached } from '@/lib/cache'
import { fetchCrumb } from '@/lib/providers/yahoo'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface CurvePoint { label: string; maturityYears: number; yield: number | null }
export interface SovereignRow {
  country: string; flag: string; code: string
  y2: number | null; y5: number | null; y10: number | null; y30: number | null
  chg10: number | null
}
export interface BondsData {
  curve: CurvePoint[]
  sovereigns: SovereignRow[]
  curveDate: string
}

// ── US Treasury XML yield curve ────────────────────────────────────
async function fetchTreasuryCurve(): Promise<{ points: CurvePoint[]; date: string }> {
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yyyymm}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Treasury XML ${res.status}`)
  const text = await res.text()
  const blocks = text.split('<m:properties>')
  const last = blocks[blocks.length - 1]
  const extract = (key: string): number | null => {
    const m = last.match(new RegExp(`<d:${key}[^>]*>([\\d.]+)<`))
    return m ? parseFloat(m[1]) : null
  }
  const dateMatch = last.match(/<d:NEW_DATE[^>]*>([\d-]+)/)
  const date = dateMatch ? dateMatch[1].slice(0, 10) : ''
  const points: CurvePoint[] = [
    { label: '1M',  maturityYears: 1/12,  yield: extract('BC_1MONTH') },
    { label: '2M',  maturityYears: 2/12,  yield: extract('BC_2MONTH') },
    { label: '3M',  maturityYears: 3/12,  yield: extract('BC_3MONTH') },
    { label: '4M',  maturityYears: 4/12,  yield: extract('BC_4MONTH') },
    { label: '6M',  maturityYears: 6/12,  yield: extract('BC_6MONTH') },
    { label: '1Y',  maturityYears: 1,     yield: extract('BC_1YEAR') },
    { label: '2Y',  maturityYears: 2,     yield: extract('BC_2YEAR') },
    { label: '3Y',  maturityYears: 3,     yield: extract('BC_3YEAR') },
    { label: '5Y',  maturityYears: 5,     yield: extract('BC_5YEAR') },
    { label: '7Y',  maturityYears: 7,     yield: extract('BC_7YEAR') },
    { label: '10Y', maturityYears: 10,    yield: extract('BC_10YEAR') },
    { label: '20Y', maturityYears: 20,    yield: extract('BC_20YEAR') },
    { label: '30Y', maturityYears: 30,    yield: extract('BC_30YEAR') },
  ].filter((p) => p.yield != null)
  return { points, date }
}

// ── US Yahoo Finance (for 10Y change data) ─────────────────────────
async function fetchUSChange(): Promise<number | null> {
  try {
    const { crumb, cookie } = await fetchCrumb()
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5ETNX&crumb=${encodeURIComponent(crumb)}&fields=regularMarketChange`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })
    const json = await res.json()
    return json?.quoteResponse?.result?.[0]?.regularMarketChange ?? null
  } catch { return null }
}

// ── ECB (Germany) — multiple maturities ───────────────────────────
// Uses the AAA euro area par yield curve
async function fetchECBYield(maturity: string): Promise<number | null> {
  const url = `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${maturity}?format=jsondata&lastNObservations=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return null
  const json = await res.json()
  try {
    const series = json.dataSets?.[0]?.series
    const key = Object.keys(series)[0]
    const obs = series[key].observations
    const lastKey = Object.keys(obs).sort((a, b) => Number(a) - Number(b)).pop()
    return lastKey != null ? obs[lastKey][0] : null
  } catch { return null }
}

// ── Bank of England — 5Y, 10Y nominal par yields ──────────────────
// BoE IADB only publishes 5Y (IUDSNPY), 10Y (IUDMNPY), 20Y (IUDLNPY)
// 2Y and 30Y are not available; we use 5Y and 10Y
async function fetchBoEYields(): Promise<{ y2: number | null; y5: number | null; y10: number | null; y30: number | null; chg10: number | null }> {
  const seriesCodes = 'IUDSNPY,IUDMNPY'
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-FromShowColumns.asp?csv.x=yes&Datefrom=01/Jan/2026&Dateto=now&SeriesCodes=${seriesCodes}&CSVF=TT&UsingCodes=Y`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { y2: null, y5: null, y10: null, y30: null, chg10: null }
  const text = await res.text()

  // Multi-series CSV: metadata block, then DATE,IUDSNPY,IUDMNPY header, then data rows
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => l.trim().startsWith('DATE,'))
  const colMap: Record<string, number> = {}
  if (headerIdx >= 0) {
    lines[headerIdx].split(',').forEach((h, i) => { colMap[h.trim()] = i })
  } else {
    colMap['IUDSNPY'] = 1; colMap['IUDMNPY'] = 2
  }

  const dataLines = lines
    .filter(l => /^\d{2}/.test(l.trim()) && l.includes(','))
    .filter(l => !isNaN(parseFloat(l.split(',')[1])))

  if (!dataLines.length) return { y2: null, y5: null, y10: null, y30: null, chg10: null }

  const parseCol = (line: string, col: number): number | null => {
    const v = parseFloat(line.split(',')[col])
    return isNaN(v) ? null : v
  }

  const lastLine = dataLines[dataLines.length - 1]
  const prevLine = dataLines.length > 1 ? dataLines[dataLines.length - 2] : null

  const y10 = parseCol(lastLine, colMap['IUDMNPY'] ?? 2)
  const y10prev = prevLine ? parseCol(prevLine, colMap['IUDMNPY'] ?? 2) : null

  return {
    y2:    null,
    y5:    parseCol(lastLine, colMap['IUDSNPY'] ?? 1),
    y10,
    y30:   null,
    chg10: y10 != null && y10prev != null ? y10 - y10prev : null,
  }
}

// ── Japan MOF — all maturities from one CSV ────────────────────────
// Header: Date,1Y,2Y,3Y,4Y,5Y,6Y,7Y,8Y,9Y,10Y,15Y,20Y,25Y,30Y,40Y
// Indices:  0   1  2  3  4  5  6  7  8  9  10  11  12  13  14  15
async function fetchJapanYields(): Promise<{ y2: number | null; y5: number | null; y10: number | null; y30: number | null; chg10: number | null }> {
  const url = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { y2: null, y5: null, y10: null, y30: null, chg10: null }
  const text = await res.text()
  const rows = text.trim().split('\n').filter(l => /^\d{4}\/\d/.test(l.trim()))
  if (!rows.length) return { y2: null, y5: null, y10: null, y30: null, chg10: null }

  const parseIdx = (cols: string[], idx: number): number | null => {
    const v = parseFloat(cols[idx])
    return isNaN(v) || v === 0 ? null : v
  }

  const last = rows[rows.length - 1].split(',')
  const prev = rows.length > 1 ? rows[rows.length - 2].split(',') : null
  const y10 = parseIdx(last, 10)
  const y10prev = prev ? parseIdx(prev, 10) : null

  return {
    y2:    parseIdx(last, 2),
    y5:    parseIdx(last, 5),
    y10,
    y30:   parseIdx(last, 14),
    chg10: y10 != null && y10prev != null ? y10 - y10prev : null,
  }
}

// ── Bank of Canada — multiple maturities via Valet API ────────────
async function fetchCanadaYields(): Promise<{ y2: number | null; y5: number | null; y10: number | null; y30: number | null; chg10: number | null }> {
  const series = 'BD.CDN.2YR.DQ.YLD,BD.CDN.5YR.DQ.YLD,BD.CDN.10YR.DQ.YLD,BD.CDN.LONG.DQ.YLD'
  const url = `https://www.bankofcanada.ca/valet/observations/${series}/json?recent=2`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return { y2: null, y5: null, y10: null, y30: null, chg10: null }
  const json = await res.json()
  const obs: Record<string, { v: string }>[] = json?.observations || []
  if (!obs.length) return { y2: null, y5: null, y10: null, y30: null, chg10: null }

  const getVal = (row: Record<string, { v: string }>, key: string): number | null => {
    const v = parseFloat(row[key]?.v)
    return isNaN(v) ? null : v
  }

  const last = obs[obs.length - 1]
  const prev = obs.length > 1 ? obs[obs.length - 2] : null
  const y10 = getVal(last, 'BD.CDN.10YR.DQ.YLD')
  const y10prev = prev ? getVal(prev, 'BD.CDN.10YR.DQ.YLD') : null

  return {
    y2:    getVal(last, 'BD.CDN.2YR.DQ.YLD'),
    y5:    getVal(last, 'BD.CDN.5YR.DQ.YLD'),
    y10,
    y30:   getVal(last, 'BD.CDN.LONG.DQ.YLD'),
    chg10: y10 != null && y10prev != null ? y10 - y10prev : null,
  }
}

// ── RBA Australia — 2Y, 5Y, 10Y from F2 CSV ───────────────────────
// F2 columns: Date, 2Y, 3Y, 5Y, 10Y, IndexedBond (10Y)
async function fetchAustraliaYields(): Promise<{ y2: number | null; y5: number | null; y10: number | null; y30: number | null; chg10: number | null }> {
  const url = 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { y2: null, y5: null, y10: null, y30: null, chg10: null }
  const text = await res.text()
  const lines = text.split('\n')
  // RBA date format: "03-Jun-2026,..."
  const dataLines = lines.filter(l => /^\d{2}-[A-Z][a-z]{2}-\d{4}/.test(l.trim()))
  if (!dataLines.length) return { y2: null, y5: null, y10: null, y30: null, chg10: null }

  const parseCol = (line: string, col: number): number | null => {
    const v = parseFloat(line.split(',')[col])
    return isNaN(v) || v === 0 ? null : v
  }

  const last = dataLines[dataLines.length - 1]
  const prev = dataLines.length > 1 ? dataLines[dataLines.length - 2] : null
  const y10 = parseCol(last, 4)
  const y10prev = prev ? parseCol(prev, 4) : null

  return {
    y2:    parseCol(last, 1),   // 2Y
    y5:    parseCol(last, 3),   // 5Y
    y10,                         // 10Y
    y30:   null,                 // RBA F2 doesn't publish 30Y
    chg10: y10 != null && y10prev != null ? y10 - y10prev : null,
  }
}

export async function GET(_req: NextRequest) {
  const key = 'bonds:data'
  const cached = getCached<BondsData>(key)
  if (cached) return Response.json({ ...cached, _cached: true })

  try {
    const [
      { points, date },
      usChg,
      de2y, de5y, de10y, de30y,
      uk, jp, ca, au,
    ] = await Promise.all([
      fetchTreasuryCurve(),
      fetchUSChange().catch(() => null),
      fetchECBYield('SR_2Y').catch(() => null),
      fetchECBYield('SR_5Y').catch(() => null),
      fetchECBYield('SR_10Y').catch(() => null),
      fetchECBYield('SR_30Y').catch(() => null),
      fetchBoEYields().catch(() => ({ y2: null, y5: null, y10: null, y30: null, chg10: null })),
      fetchJapanYields().catch(() => ({ y2: null, y5: null, y10: null, y30: null, chg10: null })),
      fetchCanadaYields().catch(() => ({ y2: null, y5: null, y10: null, y30: null, chg10: null })),
      fetchAustraliaYields().catch(() => ({ y2: null, y5: null, y10: null, y30: null, chg10: null })),
    ])

    const usYields = Object.fromEntries(points.map((p) => [p.label, p.yield]))

    const sovereigns: SovereignRow[] = [
      {
        country: 'United States', flag: '🇺🇸', code: 'US',
        y2:    usYields['2Y']  ?? null,
        y5:    usYields['5Y']  ?? null,
        y10:   usYields['10Y'] ?? null,
        y30:   usYields['30Y'] ?? null,
        chg10: usChg,
      },
      {
        country: 'United Kingdom', flag: '🇬🇧', code: 'UK',
        y2: uk.y2, y5: uk.y5, y10: uk.y10, y30: uk.y30, chg10: uk.chg10,
      },
      {
        country: 'Germany', flag: '🇩🇪', code: 'DE',
        y2: de2y, y5: de5y, y10: de10y, y30: de30y, chg10: null,
      },
      {
        country: 'Japan', flag: '🇯🇵', code: 'JP',
        y2: jp.y2, y5: jp.y5, y10: jp.y10, y30: jp.y30, chg10: jp.chg10,
      },
      {
        country: 'Australia', flag: '🇦🇺', code: 'AU',
        y2: au.y2, y5: au.y5, y10: au.y10, y30: au.y30, chg10: au.chg10,
      },
      {
        country: 'Canada', flag: '🇨🇦', code: 'CA',
        y2: ca.y2, y5: ca.y5, y10: ca.y10, y30: ca.y30, chg10: ca.chg10,
      },
    ]

    const data: BondsData = { curve: points, sovereigns, curveDate: date }
    setCached(key, data, 15 * 60_000)
    return Response.json(data)
  } catch (e) {
    const c = getCached<BondsData>(key)
    if (c) return Response.json({ ...c, _cached: true })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
