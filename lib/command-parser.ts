import type { PanelView } from './store'

const FUNCTION_CODES: Record<string, PanelView> = {
  DES: 'DES',
  GIP: 'GIP',
  FA: 'FA',
  KS: 'KS',
  CN: 'CN',
  EE: 'EE',
  EST: 'EST',
  RV: 'RV',
  WL: 'WL',
  TOP: 'TOP',
  TV: 'TV',
  WB: 'WB',
  GLCO: 'GLCO',
  PORT: 'PORT',
  HELP: 'HELP',
  // aliases
  CHART: 'GIP',
  NEWS: 'CN',
  EARNINGS: 'EE',
  PEERS: 'RV',
  WATCHLIST: 'WL',
  MARKET: 'TOP',
  STATS: 'KS',
  FINANCIALS: 'FA',
  PROFILE: 'DES',
  BONDS: 'WB',
  COMMODITIES: 'GLCO',
  CMDTY: 'GLCO',
  PORTFOLIO: 'PORT',
  HOLDINGS: 'PORT',
}

export interface ParsedCommand {
  ticker?: string
  view?: PanelView
  menu?: boolean
  error?: string
}

export function parseCommand(input: string): ParsedCommand {
  const parts = input.trim().toUpperCase().split(/\s+/)

  if (parts.length === 0 || parts[0] === '') {
    return { menu: true }
  }

  if (parts[0] === 'MENU') {
    return { menu: true }
  }

  if (parts.length === 1) {
    const single = parts[0]
    if (FUNCTION_CODES[single]) {
      return { view: FUNCTION_CODES[single] }
    }
    // bare ticker
    if (/^[A-Z0-9][A-Z0-9.]{0,9}$/.test(single)) {
      return { ticker: single }
    }
    return { error: `Unknown command: ${single}` }
  }

  if (parts.length === 2) {
    const [a, b] = parts
    const aIsView = !!FUNCTION_CODES[a]
    const bIsView = !!FUNCTION_CODES[b]

    if (aIsView && !bIsView) {
      return { view: FUNCTION_CODES[a], ticker: b }
    }
    if (!aIsView && bIsView) {
      return { view: FUNCTION_CODES[b], ticker: a }
    }
    if (aIsView && bIsView) {
      return { view: FUNCTION_CODES[b] }
    }
    return { error: `Unknown command: ${input}` }
  }

  return { error: `Too many arguments: ${input}` }
}

export const FUNCTION_HELP: { code: string; desc: string }[] = [
  { code: 'DES', desc: 'Security Description / company profile' },
  { code: 'GIP', desc: 'Price chart — intraday & historical' },
  { code: 'FA', desc: 'Financial Analysis — income, balance, cash flow' },
  { code: 'KS', desc: 'Key Statistics — valuation & quality metrics' },
  { code: 'CN', desc: 'Company News & market headlines' },
  { code: 'EE', desc: 'Earnings & Estimates — history, surprises, targets' },
  { code: 'RV', desc: 'Relative Value — peer comparison table' },
  { code: 'WL', desc: 'Watchlist — your saved tickers' },
  { code: 'TOP', desc: 'Market Overview — indices & movers' },
  { code: 'HELP', desc: 'This help screen' },
]
