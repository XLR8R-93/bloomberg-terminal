const BASE = 'https://finnhub.io/api/v1'

function key(): string {
  const k = process.env.FINNHUB_API_KEY
  if (!k) throw new Error('FINNHUB_API_KEY not set')
  return k
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path)
  url.searchParams.set('token', key())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Finnhub ${path} → ${res.status}`)
  return res.json()
}

export interface FinnhubQuote {
  c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number
}

export interface FinnhubProfile {
  name: string; ticker: string; exchange: string; finnhubIndustry: string
  ipo: string; marketCapitalization: number; shareOutstanding: number
  weburl: string; logo: string; country: string; currency: string
  description?: string; employeeTotal?: number | null
  city?: string; state?: string; address?: string; phone?: string
  ggroup?: string; gind?: string; gsector?: string; naicsNationalIndustry?: string
}

export const finnhub = {
  quote: (symbol: string) => get<FinnhubQuote>('/quote', { symbol }),
  profile: (symbol: string) => get<FinnhubProfile>('/stock/profile2', { symbol }),
  metrics: (symbol: string) => get<{ metric: Record<string, number | null> }>('/stock/metric', { symbol, metric: 'all' }),
  peers: (symbol: string) => get<string[]>('/stock/peers', { symbol }),
  companyNews: (symbol: string, from: string, to: string) =>
    get<NewsItem[]>('/company-news', { symbol, from, to }),
  marketNews: (category = 'general') => get<NewsItem[]>('/news', { category }),
  earnings: (symbol: string) => get<EarningsItem[]>('/stock/earnings', { symbol }),
  recommendations: (symbol: string) => get<RecommendationItem[]>('/stock/recommendation', { symbol }),
  insiderTransactions: (symbol: string) =>
    get<{ data: InsiderTransaction[] }>('/stock/insider-transactions', { symbol }),
  search: (q: string) => get<{ result: SearchResult[] }>('/search', { q }),
}

export interface NewsItem {
  id: number; headline: string; summary: string; source: string
  datetime: number; url: string; image?: string; sentiment?: string; category?: string
}

export interface EarningsItem {
  actual: number | null; estimate: number | null; period: string
  quarter: number; year: number; symbol: string; surprisePercent?: number | null
}

export interface RecommendationItem {
  buy: number; hold: number; period: string; sell: number
  strongBuy: number; strongSell: number; symbol: string
}

export interface InsiderTransaction {
  name: string; share: number; change: number; filingDate: string
  transactionDate: string; transactionCode: string; transactionPrice: number | null
}

export interface SearchResult {
  description: string; displaySymbol: string; symbol: string; type: string
}
