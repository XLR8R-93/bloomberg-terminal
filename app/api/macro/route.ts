// GET /api/macro
// US indicators: FRED API (needs FRED_API_KEY — free at fred.stlouisfed.org)
// AU indicators: FRED + ABS DataAPI (both free)
import { NextResponse } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface MacroSeries {
  id:             string
  label:          string
  category:       string
  countryCode:    'US' | 'AU'
  unit:           string
  description:    string
  higherIsBetter: boolean | null
  latest:         number | null
  previous:       number | null
  estimate:       number | null
  latestDate:     string
  series:         { date: string; value: number }[]
}

type Transform = 'level' | 'yoy' | 'mom' | 'qoq' | 'change'

// ── FRED config ───────────────────────────────────────────────────────────────
const FRED_SERIES: {
  id: string; label: string; category: string; unit: string
  description: string; higherIsBetter: boolean | null
  countryCode: 'US' | 'AU'
  fredId: string; transform: Transform; fetchLimit: number
}[] = [
  // US
  { countryCode: 'US', id: 'US_FED_RATE',      label: 'Fed Funds Rate',      category: 'MONETARY',   unit: '%',  higherIsBetter: null,  fredId: 'FEDFUNDS',          transform: 'level',  fetchLimit: 24, description: 'Federal Reserve target interest rate' },
  { countryCode: 'US', id: 'US_CPI_YOY',       label: 'CPI (YoY)',           category: 'INFLATION',  unit: '%',  higherIsBetter: false, fredId: 'CPIAUCSL',          transform: 'yoy',    fetchLimit: 36, description: 'US Consumer Price Index year-over-year' },
  { countryCode: 'US', id: 'US_CORE_CPI',      label: 'Core CPI (YoY)',      category: 'INFLATION',  unit: '%',  higherIsBetter: false, fredId: 'CPILFESL',          transform: 'yoy',    fetchLimit: 36, description: 'US CPI ex food & energy' },
  { countryCode: 'US', id: 'US_PPI_YOY',       label: 'PPI (YoY)',           category: 'INFLATION',  unit: '%',  higherIsBetter: false, fredId: 'PPIACO',            transform: 'yoy',    fetchLimit: 36, description: 'US Producer Price Index year-over-year' },
  { countryCode: 'US', id: 'US_NONFARM',       label: 'Nonfarm Payrolls',    category: 'EMPLOYMENT', unit: 'K',  higherIsBetter: true,  fredId: 'PAYEMS',            transform: 'change', fetchLimit: 24, description: 'Monthly US jobs added (thousands)' },
  { countryCode: 'US', id: 'US_UNEMPLOYMENT',  label: 'Unemployment Rate',   category: 'EMPLOYMENT', unit: '%',  higherIsBetter: false, fredId: 'UNRATE',            transform: 'level',  fetchLimit: 24, description: 'US unemployment rate' },
  { countryCode: 'US', id: 'US_GDP',           label: 'GDP (QoQ)',           category: 'GROWTH',     unit: '%',  higherIsBetter: true,  fredId: 'GDPC1',             transform: 'qoq',    fetchLimit: 20, description: 'US real GDP growth quarter-over-quarter' },
  { countryCode: 'US', id: 'US_RETAIL',        label: 'Retail Sales (MoM)',  category: 'CONSUMER',   unit: '%',  higherIsBetter: true,  fredId: 'RSAFS',             transform: 'mom',    fetchLimit: 24, description: 'US monthly change in retail sales' },
  { countryCode: 'US', id: 'US_CONSUMER_SENT', label: 'Consumer Sentiment',  category: 'CONSUMER',   unit: '',   higherIsBetter: true,  fredId: 'UMCSENT',           transform: 'level',  fetchLimit: 24, description: 'UMich Consumer Sentiment Index' },
  { countryCode: 'US', id: 'US_INDPRO',        label: 'Industrial Production', category: 'BUSINESS', unit: '%',  higherIsBetter: true,  fredId: 'INDPRO',            transform: 'yoy',    fetchLimit: 36, description: 'US Industrial Production Index year-over-year' },
  { countryCode: 'US', id: 'US_HOUSING',       label: 'Housing Starts',      category: 'HOUSING',    unit: 'K',  higherIsBetter: true,  fredId: 'HOUST',             transform: 'level',  fetchLimit: 24, description: 'US new residential construction (thousands)' },
  // AU — sourced from FRED international series
  { countryCode: 'AU', id: 'AU_RBA_RATE',      label: 'RBA Cash Rate',       category: 'MONETARY',   unit: '%',  higherIsBetter: null,  fredId: 'IRSTCI01AUM156N',   transform: 'level',  fetchLimit: 24, description: 'Reserve Bank of Australia cash rate' },
  { countryCode: 'AU', id: 'AU_CPI_YOY',       label: 'CPI (YoY)',           category: 'INFLATION',  unit: '%',  higherIsBetter: false, fredId: 'AUSCPIALLQINMEI',   transform: 'yoy',    fetchLimit: 24, description: 'Australia CPI year-over-year (quarterly)' },
  { countryCode: 'AU', id: 'AU_UNEMPLOYMENT',  label: 'Unemployment Rate',   category: 'EMPLOYMENT', unit: '%',  higherIsBetter: false, fredId: 'LRHUTTTTAUM156S',   transform: 'level',  fetchLimit: 24, description: 'Australia unemployment rate' },
  { countryCode: 'AU', id: 'AU_GDP',           label: 'GDP (QoQ)',           category: 'GROWTH',     unit: '%',  higherIsBetter: true,  fredId: 'NGDPRSAXDCAUQ',     transform: 'qoq',    fetchLimit: 20, description: 'Australia real GDP quarter-over-quarter' },
]

// ── FRED fetch ────────────────────────────────────────────────────────────────
async function fetchFRED(seriesId: string, limit: number): Promise<{ date: string; value: number }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) return []
  const start = new Date(Date.now() - 4 * 365 * 86_400_000).toISOString().slice(0, 10)
  const url   = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&limit=${limit}&sort_order=asc&observation_start=${start}`
  try {
    const res  = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    return (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.')
      .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }))
  } catch { return [] }
}

function applyTransform(raw: { date: string; value: number }[], transform: Transform): { date: string; value: number }[] {
  if (raw.length === 0) return []
  if (transform === 'level') return raw
  if (transform === 'yoy') {
    if (raw.length < 5) return []
    // Detect quarterly vs monthly by date gap between first two observations
    const isQuarterly = raw.length >= 2 &&
      (new Date(raw[1].date).getTime() - new Date(raw[0].date).getTime()) > 60 * 86_400_000
    const step = isQuarterly ? 4 : 12
    if (raw.length <= step) return []
    return raw.slice(step).map((curr, i) => ({
      date: curr.date,
      value: parseFloat(((curr.value / raw[i].value - 1) * 100).toFixed(2)),
    }))
  }
  if (transform === 'mom' || transform === 'qoq') {
    return raw.slice(1).map((curr, i) => ({
      date: curr.date,
      value: parseFloat(((curr.value / raw[i].value - 1) * 100).toFixed(2)),
    }))
  }
  if (transform === 'change') {
    return raw.slice(1).map((curr, i) => ({
      date: curr.date,
      value: parseFloat((curr.value - raw[i].value).toFixed(1)),
    }))
  }
  return raw
}

// ── ABS DataAPI helpers ───────────────────────────────────────────────────────
const ABS_BASE = 'https://api.data.abs.gov.au/data'

function parseABS(json: unknown): { date: string; value: number }[] {
  try {
    const data = json as {
      data: {
        dataSets: { series: Record<string, { observations: Record<string, [number]> }> }[]
        structures: { dimensions: { observation: { id: string; values: { id: string }[] }[] } }[]
      }
    }
    const ds  = data.data.dataSets[0].series
    const key = Object.keys(ds)[0]
    const obs = ds[key].observations
    const times: string[] = data.data.structures[0].dimensions.observation
      .find(d => d.id === 'TIME_PERIOD')?.values.map(v => v.id) ?? []
    return Object.entries(obs)
      .map(([idx, arr]) => ({ date: times[parseInt(idx)] ?? idx, value: arr[0] }))
      .filter(p => p.value != null && !isNaN(p.value))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

async function fetchABS(path: string): Promise<{ date: string; value: number }[]> {
  try {
    const res  = await fetch(`${ABS_BASE}/${path}`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    return parseABS(await res.json())
  } catch { return [] }
}

// Employment change (thousands, monthly) from ABS Labour Force
async function fetchAUEmploymentChange(): Promise<{ date: string; value: number }[]> {
  const raw = await fetchABS('LF/M1.3.1599.20.AUS.M?startPeriod=2022-01&format=jsondata')
  if (raw.length < 2) return []
  return raw.slice(1).map((curr, i) => ({
    date: curr.date,
    value: parseFloat((curr.value - raw[i].value).toFixed(1)),
  }))
}

// Retail sales MoM % from ABS (current prices, seasonally adjusted, total, Australia, monthly)
async function fetchAURetail(): Promise<{ date: string; value: number }[]> {
  const raw = await fetchABS('RT/M1.20.20.AUS.M?startPeriod=2022-01&format=jsondata')
  if (raw.length < 2) return []
  return raw.slice(1).map((curr, i) => ({
    date: curr.date,
    value: parseFloat(((curr.value / raw[i].value - 1) * 100).toFixed(2)),
  }))
}

// ── Handler ───────────────────────────────────────────────────────────────────
const CACHE_KEY = 'macro:fred2:v1'

export async function GET() {
  const hit = getCached(CACHE_KEY)
  if (hit) return NextResponse.json(hit)

  const [fredResults, auEmployment, auRetail] = await Promise.all([
    Promise.all(FRED_SERIES.map(s => fetchFRED(s.fredId, s.fetchLimit))),
    fetchAUEmploymentChange(),
    fetchAURetail(),
  ])

  const fredOutput: MacroSeries[] = FRED_SERIES.map((ind, i) => {
    const series   = applyTransform(fredResults[i], ind.transform).slice(-12)
    const latest   = series.length > 0 ? series[series.length - 1].value : null
    const previous = series.length > 1 ? series[series.length - 2].value : null
    return {
      id: ind.id, label: ind.label, category: ind.category,
      countryCode: ind.countryCode, unit: ind.unit, description: ind.description,
      higherIsBetter: ind.higherIsBetter, latest, previous, estimate: null,
      latestDate: series.length > 0 ? series[series.length - 1].date : '',
      series,
    }
  })

  const absOutput: MacroSeries[] = [
    {
      id: 'AU_EMPLOYMENT', label: 'Employment Change', category: 'EMPLOYMENT',
      countryCode: 'AU', unit: 'K', description: 'Australia monthly employment change (thousands)',
      higherIsBetter: true, estimate: null,
      latest:   auEmployment.length > 0 ? auEmployment[auEmployment.length - 1].value : null,
      previous: auEmployment.length > 1 ? auEmployment[auEmployment.length - 2].value : null,
      latestDate: auEmployment.length > 0 ? auEmployment[auEmployment.length - 1].date : '',
      series: auEmployment.slice(-12),
    },
    {
      id: 'AU_RETAIL', label: 'Retail Sales (MoM)', category: 'CONSUMER',
      countryCode: 'AU', unit: '%', description: 'Australia monthly change in retail sales',
      higherIsBetter: true, estimate: null,
      latest:   auRetail.length > 0 ? auRetail[auRetail.length - 1].value : null,
      previous: auRetail.length > 1 ? auRetail[auRetail.length - 2].value : null,
      latestDate: auRetail.length > 0 ? auRetail[auRetail.length - 1].date : '',
      series: auRetail.slice(-12),
    },
  ]

  const output = [...fredOutput, ...absOutput]
  setCached(CACHE_KEY, output, 60 * 60 * 1000)
  return NextResponse.json(output)
}
