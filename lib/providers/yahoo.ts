const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Module-level crumb cache
let _crumb = ''
let _cookie = ''
let _crumbExpiry = 0

export async function fetchCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (_crumb && Date.now() < _crumbExpiry) return { crumb: _crumb, cookie: _cookie }

  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  const setCookie = cookieRes.headers.get('set-cookie') || ''
  const cookieStr = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ')

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookieStr },
  })
  const crumbVal = await crumbRes.text()
  if (!crumbVal || crumbVal.includes('{')) throw new Error('Failed to get Yahoo crumb')

  _crumb = crumbVal.trim()
  _cookie = cookieStr
  _crumbExpiry = Date.now() + 55 * 60 * 1000
  return { crumb: _crumb, cookie: _cookie }
}

export async function quoteSummary(symbol: string, modules: string): Promise<Record<string, unknown>> {
  const { crumb, cookie } = await fetchCrumb()
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Yahoo quoteSummary ${res.status}`)
  const json = await res.json()
  const result = json?.quoteSummary?.result?.[0]
  if (!result) throw new Error('No result from Yahoo quoteSummary')
  return result
}

// Lightweight quote via v8 chart (no crumb needed)
export async function yahooQuote(symbol: string): Promise<{
  c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`)
  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta) throw new Error('No meta from Yahoo chart')
  const c = meta.regularMarketPrice ?? 0
  const pc = meta.chartPreviousClose ?? meta.previousClose ?? c
  return {
    c, pc,
    d: c - pc,
    dp: pc ? ((c - pc) / pc) * 100 : 0,
    h: meta.regularMarketDayHigh ?? c,
    l: meta.regularMarketDayLow ?? c,
    o: meta.regularMarketOpen ?? c,
    t: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
  }
}

// Key stats mapped to Finnhub metric field names (used by KS and RV panels)
export async function yahooMetrics(symbol: string): Promise<{ metric: Record<string, number | null> }> {
  const data = await quoteSummary(symbol, 'defaultKeyStatistics,financialData,summaryDetail')
  const ks = data.defaultKeyStatistics as Record<string, { raw?: number } | number | null> | undefined
  const fd = data.financialData as Record<string, { raw?: number } | number | null> | undefined
  const sd = data.summaryDetail as Record<string, { raw?: number } | number | null> | undefined

  function raw(obj: typeof ks, key: string): number | null {
    if (!obj) return null
    const v = obj[key]
    if (v == null) return null
    if (typeof v === 'number') return v
    return (v as { raw?: number }).raw ?? null
  }

  // Core values
  const trailingPE    = raw(sd, 'trailingPE')
  const ps            = raw(sd, 'priceToSalesTrailing12Months')
  const evEbitda      = raw(ks, 'enterpriseToEbitda')
  const grossMargin   = raw(fd, 'grossMargins') != null ? (raw(fd, 'grossMargins')! * 100) : null
  // 52WeekChange from Yahoo: expressed as decimal e.g. 0.23 = +23%
  const w52change     = raw(ks, '52WeekChange') != null ? (raw(ks, '52WeekChange')! * 100) : null
  const evRevenue     = raw(ks, 'enterpriseToRevenue')

  return {
    metric: {
      // ── Primary names used by KS panel ─────────────────────────
      peNormalizedAnnual:           trailingPE,
      forwardPE:                    raw(ks, 'forwardPE'),
      pbAnnual:                     raw(ks, 'priceToBook'),
      psAnnual:                     ps,
      evEbitdaTTM:                  evEbitda,
      pegTTM:                       raw(ks, 'pegRatio'),
      dividendYieldIndicatedAnnual: raw(sd, 'dividendYield') != null ? (raw(sd, 'dividendYield')! * 100) : null,
      dividendPerShareAnnual:       raw(sd, 'dividendRate'),
      netProfitMarginTTM:           raw(fd, 'profitMargins') != null ? (raw(fd, 'profitMargins')! * 100) : null,
      operatingMarginTTM:           raw(fd, 'operatingMargins') != null ? (raw(fd, 'operatingMargins')! * 100) : null,
      grossMarginTTM:               grossMargin,
      returnOnEquityAnnual:         raw(fd, 'returnOnEquity') != null ? (raw(fd, 'returnOnEquity')! * 100) : null,
      returnOnAssetsTTM:            raw(fd, 'returnOnAssets') != null ? (raw(fd, 'returnOnAssets')! * 100) : null,
      currentRatioAnnual:           raw(fd, 'currentRatio'),
      'totalDebt/totalEquityAnnual': raw(fd, 'debtToEquity'),
      'longTermDebt/equityAnnual':  raw(ks, 'debtToEquity'),
      beta:                         raw(sd, 'beta'),
      '52WeekHigh':                 raw(sd, 'fiftyTwoWeekHigh'),
      '52WeekLow':                  raw(sd, 'fiftyTwoWeekLow'),
      revenueGrowthTTMYoy:          raw(fd, 'revenueGrowth') != null ? (raw(fd, 'revenueGrowth')! * 100) : null,
      epsGrowthTTMYoy:              raw(ks, 'earningsQuarterlyGrowth') != null ? (raw(ks, 'earningsQuarterlyGrowth')! * 100) : null,
      revenuePerShareTTM:           raw(fd, 'revenuePerShare'),
      bookValuePerShareAnnual:      raw(ks, 'bookValue'),
      cashPerSharePerShareAnnual:   raw(ks, 'totalCashPerShare'),
      marketCapitalization:         raw(sd, 'marketCap') != null ? (raw(sd, 'marketCap')! / 1e6) : null,
      // ── Aliases used by RV panel (Finnhub field names) ──────────
      peBasicExclExtraTTM:          trailingPE,
      psTTM:                        ps,
      evToEbitda:                   evEbitda,
      evToRevenue:                  evRevenue,
      '52WeekPriceReturnDaily':     w52change,
    },
  }
}

type NewsItem = {
  id: number; headline: string; summary: string; source: string
  datetime: number; url: string; image?: string
}

// Yahoo Finance RSS feed — works well for international/ASX tickers
async function yahooRssNews(symbol: string): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=AU&lang=en-AU`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return []
  const xml = await res.text()
  const items: NewsItem[] = []
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  itemBlocks.forEach((block, i) => {
    const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))?.[1] ??
      block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.replace(/<[^>]+>/g, '') ?? ''
    const pubDate = get('pubDate')
    const dt = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000)
    const headline = get('title').trim()
    if (!headline) return
    items.push({
      id: i,
      headline,
      summary: get('description').trim(),
      source: get('source') || 'Yahoo Finance',
      datetime: dt,
      url: get('link').trim(),
      image: undefined,
    })
  })
  return items
}

// ASX company announcements (official exchange filings) — no auth required
async function asxAnnouncements(asxCode: string): Promise<NewsItem[]> {
  const url = `https://asx.api.markitdigital.com/asx-research/1.0/companies/${asxCode}/announcements?count=20`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://www.asx.com.au', Referer: 'https://www.asx.com.au/' },
  })
  if (!res.ok) return []
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = json?.data?.items || []
  return items.map((item, i) => ({
    id: 1000 + i,
    headline: `[ASX] ${item.headline || item.announcementType || 'Announcement'}`,
    summary: `${item.announcementType}${item.isPriceSensitive ? ' · Price Sensitive' : ''} · ${item.fileSize || ''}`.trim(),
    source: 'ASX Announcements',
    datetime: item.date ? Math.floor(new Date(item.date).getTime() / 1000) : Math.floor(Date.now() / 1000),
    url: item.documentKey
      ? `https://www.asx.com.au/asx/statistics/displayAnnouncement.do?display=pdf&idsId=${item.documentKey}`
      : `https://www.asx.com.au/asx/statistics/announcements.do?by=asxCode&asxCode=${asxCode}`,
    image: undefined,
  }))
}

// News from Yahoo Finance (no crumb needed)
export async function yahooNews(symbol: string): Promise<NewsItem[]> {
  const { cookie } = await fetchCrumb()
  const newsUrl = `https://query2.finance.yahoo.com/v2/finance/news?symbols=${encodeURIComponent(symbol)}&count=30`
  const res = await fetch(newsUrl, {
    headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' },
  })

  let v2Items: NewsItem[] = []
  if (res.ok) {
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = json?.items?.result || []
    v2Items = items.map((item, i) => ({
      id: i,
      headline: item.title || '',
      summary: item.summary || item.description || '',
      source: item.publisher || '',
      datetime: item.published_at ? Math.floor(new Date(item.published_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
      url: item.link || item.url || '',
      image: item.main_image?.original_url || item.thumbnail?.resolutions?.[0]?.url,
    })).filter(n => n.headline)
  }

  // For ASX tickers, supplement with RSS + official announcements
  const isAsx = symbol.endsWith('.AX')
  if (isAsx) {
    const asxCode = symbol.replace('.AX', '')
    const [rss, announcements] = await Promise.all([
      yahooRssNews(symbol).catch(() => [] as NewsItem[]),
      asxAnnouncements(asxCode).catch(() => [] as NewsItem[]),
    ])
    // Merge: deduplicate by headline, sort newest first
    const all = [...announcements, ...rss, ...v2Items]
    const seen = new Set<string>()
    return all
      .filter(n => { const key = n.headline.slice(0, 60); if (seen.has(key)) return false; seen.add(key); return true })
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 40)
  }

  // For other international tickers, try RSS if v2 returned nothing
  if (!v2Items.length) {
    return yahooRssNews(symbol).catch(() => [])
  }

  return v2Items
}

// Financial statements mapped to the field names FA panel expects (same as FMP format)
type YahooStatement = Record<string, unknown>

function rawVal(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null
  const v = obj[key]
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null && 'raw' in v) return (v as { raw: number }).raw
  return null
}

function mapIncomeStatement(item: Record<string, unknown>): YahooStatement {
  const endDate = (item.endDate as { fmt?: string })?.fmt || ''
  const revenue = rawVal(item, 'totalRevenue')
  const cogs = rawVal(item, 'costOfRevenue')
  const grossProfit = rawVal(item, 'grossProfit') ?? (revenue != null && cogs != null ? revenue - cogs : null)
  const opex = rawVal(item, 'totalOperatingExpenses')
  const opIncome = rawVal(item, 'operatingIncome') ?? rawVal(item, 'ebit')
  const netIncome = rawVal(item, 'netIncome')
  const eps = rawVal(item, 'basicEps')
  const epsDiluted = rawVal(item, 'dilutedEps')
  return {
    date: endDate,
    revenue,
    costOfRevenue: cogs,
    grossProfit,
    operatingExpenses: opex != null && revenue != null ? opex - (cogs ?? 0) : null,
    operatingIncome: opIncome,
    netIncome,
    eps,
    epsdiluted: epsDiluted,
  }
}

function mapBalanceSheet(item: Record<string, unknown>): YahooStatement {
  const endDate = (item.endDate as { fmt?: string })?.fmt || ''
  return {
    date: endDate,
    cashAndCashEquivalents: rawVal(item, 'cash'),
    totalCurrentAssets: rawVal(item, 'totalCurrentAssets'),
    totalAssets: rawVal(item, 'totalAssets'),
    totalCurrentLiabilities: rawVal(item, 'totalCurrentLiabilities'),
    totalDebt: rawVal(item, 'longTermDebt'),
    totalLiabilities: rawVal(item, 'totalLiab'),
    totalStockholdersEquity: rawVal(item, 'totalStockholderEquity'),
  }
}

function mapCashFlow(item: Record<string, unknown>): YahooStatement {
  const endDate = (item.endDate as { fmt?: string })?.fmt || ''
  const opCF = rawVal(item, 'totalCashFromOperatingActivities')
  const capex = rawVal(item, 'capitalExpenditures')
  const fcf = opCF != null && capex != null ? opCF + capex : null // capex is usually negative
  return {
    date: endDate,
    operatingCashFlow: opCF,
    capitalExpenditure: capex,
    freeCashFlow: fcf,
    dividendsPaid: rawVal(item, 'dividendsPaid'),
    netCashProvidedByFinancingActivities: rawVal(item, 'totalCashFromFinancingActivities'),
  }
}

export async function yahooFinancials(symbol: string, period: 'annual' | 'quarterly'): Promise<{
  income: YahooStatement[]
  balance: YahooStatement[]
  cash: YahooStatement[]
  _source: string
}> {
  const annualModules = 'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory'
  const quarterlyModules = 'incomeStatementHistoryQuarterly,balanceSheetHistoryQuarterly,cashflowStatementHistoryQuarterly'
  const modules = period === 'quarterly' ? quarterlyModules : annualModules

  const data = await quoteSummary(symbol, modules)

  const incKey = period === 'quarterly' ? 'incomeStatementHistoryQuarterly' : 'incomeStatementHistory'
  const balKey = period === 'quarterly' ? 'balanceSheetHistoryQuarterly' : 'balanceSheetHistory'
  const cfKey  = period === 'quarterly' ? 'cashflowStatementHistoryQuarterly' : 'cashflowStatementHistory'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incItems: any[] = (data[incKey] as any)?.incomeStatementHistory || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balItems: any[] = (data[balKey] as any)?.balanceSheetStatements || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfItems:  any[] = (data[cfKey]  as any)?.cashflowStatements    || []

  return {
    income:  incItems.map(mapIncomeStatement),
    balance: balItems.map(mapBalanceSheet),
    cash:    cfItems.map(mapCashFlow),
    _source: 'yahoo',
  }
}

// Profile from Yahoo quoteSummary (assetProfile + price modules)
export async function yahooProfile(symbol: string): Promise<{
  name: string; ticker: string; exchange: string; finnhubIndustry: string
  marketCapitalization: number; currency: string; country: string
  weburl: string; logo: string; description: string; employeeTotal: number | null
}> {
  const data = await quoteSummary(symbol, 'assetProfile,summaryDetail,price,quoteType')
  const p = data.price as Record<string, unknown> | undefined
  const a = data.assetProfile as Record<string, unknown> | undefined
  const q = data.quoteType as Record<string, unknown> | undefined

  const name = (p?.longName as string) || (p?.shortName as string) || (q?.longName as string) || symbol
  const currency = (p?.currency as string) || 'USD'
  const exchange = (p?.exchangeName as string) || (q?.exchange as string) || ''
  const sector = (a?.sector as string) || ''
  const industry = (a?.industry as string) || ''
  const mc = (p?.marketCap as { raw?: number })?.raw ?? 0

  return {
    name,
    ticker: symbol,
    exchange,
    finnhubIndustry: industry || sector,
    marketCapitalization: mc / 1e6, // Finnhub returns in millions
    currency,
    country: (a?.country as string) || '',
    weburl: (a?.website as string) || '',
    logo: `https://logo.clearbit.com/${((a?.website as string) || '').replace(/https?:\/\//, '').split('/')[0]}`,
    description: (a?.longBusinessSummary as string) || '',
    employeeTotal: (a?.fullTimeEmployees as number) ?? null,
  }
}
