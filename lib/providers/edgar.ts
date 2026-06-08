// SEC EDGAR XBRL company-facts fallback for financial statements.
// No API key needed — just a descriptive User-Agent per SEC guidelines.

const HEADERS = { 'User-Agent': 'bloomberg-terminal mark.salescom@gmail.com' }

// Step 1: resolve ticker → CIK using the SEC company tickers JSON
let tickerMapCache: Record<string, string> | null = null

async function getCIK(ticker: string): Promise<string> {
  if (!tickerMapCache) {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS })
    if (!res.ok) throw new Error(`EDGAR tickers.json → ${res.status}`)
    const json: Record<string, { cik_str: number; ticker: string; title: string }> = await res.json()
    tickerMapCache = {}
    for (const v of Object.values(json)) {
      tickerMapCache[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, '0')
    }
  }
  const cik = tickerMapCache[ticker.toUpperCase()]
  if (!cik) throw new Error(`EDGAR: no CIK for ${ticker}`)
  return cik
}

// Step 2: fetch all XBRL company facts
type FactUnit = { end: string; val: number; form: string; accn: string; filed: string; frame?: string }
type CompanyFacts = {
  facts: {
    'us-gaap'?: Record<string, { label: string; description: string; units: { USD?: FactUnit[]; shares?: FactUnit[]; 'USD/shares'?: FactUnit[] } }>
    dei?: Record<string, { units: { shares?: FactUnit[] } }>
  }
}

async function fetchFacts(cik: string): Promise<CompanyFacts> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`EDGAR facts → ${res.status}`)
  return res.json()
}

// Pick the N most recent annual (10-K) or quarterly (10-Q) values for a concept
function pickPeriods(
  units: FactUnit[] | undefined,
  form: '10-K' | '10-Q',
  n: number
): { date: string; val: number }[] {
  if (!units) return []
  const filtered = units
    .filter((u) => u.form === form && u.end && u.val != null)
    .sort((a, b) => b.end.localeCompare(a.end))

  // De-duplicate by end date (keep latest filing for each period)
  const seen = new Set<string>()
  const deduped: FactUnit[] = []
  for (const u of filtered) {
    if (!seen.has(u.end)) { seen.add(u.end); deduped.push(u) }
  }
  return deduped.slice(0, n).map((u) => ({ date: u.end, val: u.val }))
}

function conceptVal(gaap: CompanyFacts['facts']['us-gaap'], names: string[], form: '10-K' | '10-Q', periods: string[]): (number | null)[] {
  // Try all names, pick the one that covers the most of our target periods
  let best: (number | null)[] = periods.map(() => null)
  let bestCount = 0
  for (const name of names) {
    const units = gaap?.[name]?.units?.USD
    if (!units) continue
    const map: Record<string, number> = {}
    for (const u of units) {
      if (u.form === form && u.end) map[u.end] = u.val
    }
    const result = periods.map((p) => map[p] ?? null)
    const count = result.filter((v) => v !== null).length
    if (count > bestCount) { bestCount = count; best = result }
  }
  return best
}

function epsVal(gaap: CompanyFacts['facts']['us-gaap'], names: string[], form: '10-K' | '10-Q', periods: string[]): (number | null)[] {
  for (const name of names) {
    const concept = gaap?.[name]
    if (!concept) continue
    const units = concept.units?.['USD/shares']
    if (!units) continue
    const map: Record<string, number> = {}
    for (const u of units) {
      if (u.form === form && u.end) map[u.end] = u.val
    }
    return periods.map((p) => map[p] ?? null)
  }
  return periods.map(() => null)
}

export interface FAStatement {
  date: string
  [key: string]: number | null | string
}

export interface FAData {
  income: FAStatement[]
  balance: FAStatement[]
  cash: FAStatement[]
}

export async function fetchEdgarFA(ticker: string, period: 'annual' | 'quarterly'): Promise<FAData> {
  const cik = await getCIK(ticker)
  const facts = await fetchFacts(cik)
  const gaap = facts.facts['us-gaap']
  if (!gaap) throw new Error('EDGAR: no us-gaap facts')

  const form = period === 'annual' ? '10-K' : '10-Q'
  const n = 5

  // Determine periods from revenue — pick the concept with the most recent end date
  const revConcepts = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet']
  let periods: string[] = []
  let bestDate = ''
  for (const name of revConcepts) {
    const p = pickPeriods(gaap[name]?.units?.USD, form, n)
    if (p.length && p[0].date > bestDate) {
      bestDate = p[0].date
      periods = p.map((x) => x.date)
    }
  }
  if (!periods.length) throw new Error('EDGAR: could not determine reporting periods')

  const income: FAStatement[] = periods.map((date, i) => ({
    date,
    revenue:            conceptVal(gaap, revConcepts, form, periods)[i],
    costOfRevenue:      conceptVal(gaap, ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], form, periods)[i],
    grossProfit:        conceptVal(gaap, ['GrossProfit'], form, periods)[i],
    operatingExpenses:  conceptVal(gaap, ['OperatingExpenses'], form, periods)[i],
    operatingIncome:    conceptVal(gaap, ['OperatingIncomeLoss'], form, periods)[i],
    netIncome:          conceptVal(gaap, ['NetIncomeLoss', 'ProfitLoss'], form, periods)[i],
    eps:                epsVal(gaap, ['EarningsPerShareBasic'], form, periods)[i],
    epsdiluted:         epsVal(gaap, ['EarningsPerShareDiluted'], form, periods)[i],
  }))

  // Balance sheet periods from Assets
  const bsPeriods = pickPeriods(gaap['Assets']?.units?.USD, form, n).map((x) => x.date)
  const balance: FAStatement[] = bsPeriods.map((date, i) => ({
    date,
    cashAndCashEquivalents:   conceptVal(gaap, ['CashAndCashEquivalentsAtCarryingValue', 'Cash'], form, bsPeriods)[i],
    totalCurrentAssets:       conceptVal(gaap, ['AssetsCurrent'], form, bsPeriods)[i],
    totalAssets:              conceptVal(gaap, ['Assets'], form, bsPeriods)[i],
    totalCurrentLiabilities:  conceptVal(gaap, ['LiabilitiesCurrent'], form, bsPeriods)[i],
    totalDebt:                conceptVal(gaap, ['LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'], form, bsPeriods)[i],
    totalLiabilities:         conceptVal(gaap, ['Liabilities'], form, bsPeriods)[i],
    totalStockholdersEquity:  conceptVal(gaap, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], form, bsPeriods)[i],
  }))

  // Cash flow periods from operating CF
  const cfConcepts = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']
  const cfPeriods = pickPeriods(gaap[cfConcepts[0]]?.units?.USD ?? gaap[cfConcepts[1]]?.units?.USD, form, n).map((x) => x.date)
  const cash: FAStatement[] = cfPeriods.map((date, i) => ({
    date,
    operatingCashFlow:  conceptVal(gaap, cfConcepts, form, cfPeriods)[i],
    capitalExpenditure: conceptVal(gaap, ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpendituresIncurredButNotYetPaid'], form, cfPeriods)[i],
    freeCashFlow:       null, // computed below
    dividendsPaid:      conceptVal(gaap, ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], form, cfPeriods)[i],
    netCashProvidedByFinancingActivities: conceptVal(gaap, ['NetCashProvidedByUsedInFinancingActivities'], form, cfPeriods)[i],
  }))

  // Derive free cash flow = operating CF - capex
  for (const row of cash) {
    const ocf = row.operatingCashFlow as number | null
    const capex = row.capitalExpenditure as number | null
    if (ocf != null && capex != null) row.freeCashFlow = ocf - Math.abs(capex)
  }

  return { income, balance, cash }
}
