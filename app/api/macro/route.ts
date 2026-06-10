// GET /api/macro
// US macro indicators from FRED (St. Louis Fed — free API, needs FRED_API_KEY)
// AU macro indicators from OECD SDMX-JSON (free, no key required)
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

// ── FRED series config ────────────────────────────────────────────────────────
type Transform = 'level' | 'yoy' | 'mom' | 'qoq' | 'change'

const US_FRED: {
  id: string; label: string; category: string; unit: string
  description: string; higherIsBetter: boolean | null
  fredId: string; transform: Transform; fetchLimit: number
}[] = [
  {
    id: 'US_FED_RATE', label: 'Fed Funds Rate', category: 'MONETARY', unit: '%',
    description: 'Federal Reserve target interest rate', higherIsBetter: null,
    fredId: 'FEDFUNDS', transform: 'level', fetchLimit: 24,
  },
  {
    id: 'US_CPI_YOY', label: 'CPI (YoY)', category: 'INFLATION', unit: '%',
    description: 'US Consumer Price Index year-over-year', higherIsBetter: false,
    fredId: 'CPIAUCSL', transform: 'yoy', fetchLimit: 36,
  },
  {
    id: 'US_CORE_CPI', label: 'Core CPI (YoY)', category: 'INFLATION', unit: '%',
    description: 'US CPI ex food & energy', higherIsBetter: false,
    fredId: 'CPILFESL', transform: 'yoy', fetchLimit: 36,
  },
  {
    id: 'US_PPI_YOY', label: 'PPI (YoY)', category: 'INFLATION', unit: '%',
    description: 'US Producer Price Index year-over-year', higherIsBetter: false,
    fredId: 'PPIACO', transform: 'yoy', fetchLimit: 36,
  },
  {
    id: 'US_NONFARM', label: 'Nonfarm Payrolls', category: 'EMPLOYMENT', unit: 'K',
    description: 'Monthly US jobs added (thousands)', higherIsBetter: true,
    fredId: 'PAYEMS', transform: 'change', fetchLimit: 24,
  },
  {
    id: 'US_UNEMPLOYMENT', label: 'Unemployment Rate', category: 'EMPLOYMENT', unit: '%',
    description: 'US unemployment rate', higherIsBetter: false,
    fredId: 'UNRATE', transform: 'level', fetchLimit: 24,
  },
  {
    id: 'US_GDP', label: 'GDP (QoQ)', category: 'GROWTH', unit: '%',
    description: 'US real GDP growth quarter-over-quarter', higherIsBetter: true,
    fredId: 'GDPC1', transform: 'qoq', fetchLimit: 20,
  },
  {
    id: 'US_RETAIL', label: 'Retail Sales (MoM)', category: 'CONSUMER', unit: '%',
    description: 'US monthly change in retail sales', higherIsBetter: true,
    fredId: 'RSAFS', transform: 'mom', fetchLimit: 24,
  },
  {
    id: 'US_CONSUMER_SENT', label: 'Consumer Sentiment', category: 'CONSUMER', unit: '',
    description: 'UMich Consumer Sentiment Index', higherIsBetter: true,
    fredId: 'UMCSENT', transform: 'level', fetchLimit: 24,
  },
  {
    id: 'US_ISM_MFG', label: 'ISM Manufacturing', category: 'BUSINESS', unit: '',
    description: 'ISM Manufacturing PMI (>50 = expansion)', higherIsBetter: true,
    fredId: 'NAPMPI', transform: 'level', fetchLimit: 24,
  },
  {
    id: 'US_HOUSING', label: 'Housing Starts', category: 'HOUSING', unit: 'K',
    description: 'US new residential construction (thousands)', higherIsBetter: true,
    fredId: 'HOUST', transform: 'level', fetchLimit: 24,
  },
]

// ── FRED fetch & transform ────────────────────────────────────────────────────
async function fetchFRED(seriesId: string, limit: number): Promise<{ date: string; value: number }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) return []
  const start = new Date(Date.now() - 4 * 365 * 86_400_000).toISOString().slice(0, 10)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&limit=${limit}&sort_order=asc&observation_start=${start}`
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
  if (transform === 'level')  return raw
  if (transform === 'yoy') {
    if (raw.length < 13) return []
    return raw.slice(12).map((curr, i) => ({
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

// ── OECD helpers (free, no key) ───────────────────────────────────────────────
async function fetchOECDUrl(url: string): Promise<{ date: string; value: number }[]> {
  try {
    const res  = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json() as {
      data?: {
        dataSets?: { series?: Record<string, { observations?: Record<string, [number]> }> }[]
        structure?: { dimensions?: { observation?: { id: string; values?: { id: string }[] }[] } }
      }
    }
    const ds = json.data?.dataSets?.[0]?.series
    if (!ds) return []
    const firstKey = Object.keys(ds)[0]
    const obs = ds[firstKey]?.observations
    if (!obs) return []
    const times: string[] = json.data?.structure?.dimensions?.observation
      ?.find(d => d.id === 'TIME_PERIOD')?.values?.map(v => v.id) ?? []
    return Object.entries(obs)
      .map(([idx, arr]) => ({ date: times[parseInt(idx)] ?? idx, value: arr[0] }))
      .filter(p => p.value != null && !isNaN(p.value))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

const OECD_BASE = 'https://sdmx.oecd.org/public/rest/data'

async function fetchAURBARate() {
  return fetchOECDUrl(`${OECD_BASE}/OECD.SDD.STES,DSD_STES@DF_FINMARK/AUS.IR3TIB01.ST.M?startPeriod=2020-01&format=jsondata&dimensionAtObservation=TIME_PERIOD`)
}
async function fetchAUCPI() {
  return fetchOECDUrl(`${OECD_BASE}/OECD.SDD.NAD,DSD_PRICES@DF_PRICES_ALL/AUS.CPI.PA.Q?startPeriod=2020-Q1&format=jsondata&dimensionAtObservation=TIME_PERIOD`)
}
async function fetchAUUnemployment() {
  return fetchOECDUrl(`${OECD_BASE}/OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M/AUS.UNE_LF_M.._T.Y15T74.STSA.M?startPeriod=2020-01&format=jsondata&dimensionAtObservation=TIME_PERIOD`)
}
async function fetchAUGDP() {
  return fetchOECDUrl(`${OECD_BASE}/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH/AUS.B1GQ.G.Q?startPeriod=2020-Q1&format=jsondata&dimensionAtObservation=TIME_PERIOD`)
}

// ── Handler ───────────────────────────────────────────────────────────────────
const CACHE_KEY = 'macro:fred:v1'

export async function GET() {
  const hit = getCached(CACHE_KEY)
  if (hit) return NextResponse.json(hit)

  const [usRaw, auRBA, auCPI, auUne, auGDP] = await Promise.all([
    Promise.all(US_FRED.map(ind => fetchFRED(ind.fredId, ind.fetchLimit))),
    fetchAURBARate(),
    fetchAUCPI(),
    fetchAUUnemployment(),
    fetchAUGDP(),
  ])

  const usOutput: MacroSeries[] = US_FRED.map((ind, i) => {
    const series   = applyTransform(usRaw[i], ind.transform).slice(-12)
    const latest   = series.length > 0 ? series[series.length - 1].value : null
    const previous = series.length > 1 ? series[series.length - 2].value : null
    return {
      id: ind.id, label: ind.label, category: ind.category,
      countryCode: 'US' as const, unit: ind.unit, description: ind.description,
      higherIsBetter: ind.higherIsBetter, latest, previous, estimate: null,
      latestDate: series.length > 0 ? series[series.length - 1].date : '',
      series,
    }
  })

  const AU_META = [
    { id: 'AU_RBA_RATE',     label: 'RBA Cash Rate',     category: 'MONETARY',   unit: '%', description: 'RBA official cash rate',             higherIsBetter: null  as null,  data: auRBA },
    { id: 'AU_CPI_YOY',      label: 'CPI (YoY)',         category: 'INFLATION',  unit: '%', description: 'Australia CPI year-over-year',       higherIsBetter: false as false, data: auCPI },
    { id: 'AU_UNEMPLOYMENT',  label: 'Unemployment Rate', category: 'EMPLOYMENT', unit: '%', description: 'Australia unemployment rate',        higherIsBetter: false as false, data: auUne },
    { id: 'AU_GDP',           label: 'GDP (QoQ)',         category: 'GROWTH',     unit: '%', description: 'Australia GDP quarter-over-quarter', higherIsBetter: true  as true,  data: auGDP },
  ]

  const auOutput: MacroSeries[] = AU_META.map(meta => {
    const series   = meta.data.slice(-12)
    const latest   = series.length > 0 ? series[series.length - 1].value : null
    const previous = series.length > 1 ? series[series.length - 2].value : null
    return {
      id: meta.id, label: meta.label, category: meta.category,
      countryCode: 'AU' as const, unit: meta.unit, description: meta.description,
      higherIsBetter: meta.higherIsBetter, latest, previous, estimate: null,
      latestDate: series.length > 0 ? series[series.length - 1].date : '',
      series,
    }
  })

  const output = [...usOutput, ...auOutput]
  setCached(CACHE_KEY, output, 60 * 60 * 1000)
  return NextResponse.json(output)
}
