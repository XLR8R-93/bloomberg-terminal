'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'

// ── Universe ─────────────────────────────────────────────────────────────────
interface UniverseEntry {
  symbol:  string
  name:    string
  sector:  string
  type:    'Large Cap' | 'Mid Cap' | 'Small Cap'
  exchange: 'US' | 'ASX'
  assetClass?: 'Equity' | 'ETF'
}

const UNIVERSE: UniverseEntry[] = [
  // ── US Equities — Technology ───────────────────────────────────────────────
  { symbol: 'AAPL',  name: 'Apple',              sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MSFT',  name: 'Microsoft',           sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'NVDA',  name: 'Nvidia',              sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'AVGO',  name: 'Broadcom',            sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'META',  name: 'Meta Platforms',      sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet',            sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'AMD',   name: 'AMD',                 sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'INTC',  name: 'Intel',               sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'CRM',   name: 'Salesforce',          sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'ORCL',  name: 'Oracle',              sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'ADBE',  name: 'Adobe',               sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'NOW',   name: 'ServiceNow',          sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'INTU',  name: 'Intuit',              sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'AMAT',  name: 'Applied Materials',   sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MU',    name: 'Micron Technology',   sector: 'Technology',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'PLTR',  name: 'Palantir',            sector: 'Technology',       type: 'Mid Cap',   exchange: 'US' },
  { symbol: 'SNOW',  name: 'Snowflake',           sector: 'Technology',       type: 'Mid Cap',   exchange: 'US' },
  { symbol: 'NET',   name: 'Cloudflare',          sector: 'Technology',       type: 'Mid Cap',   exchange: 'US' },
  { symbol: 'DDOG',  name: 'Datadog',             sector: 'Technology',       type: 'Mid Cap',   exchange: 'US' },
  { symbol: 'CRWD',  name: 'CrowdStrike',         sector: 'Technology',       type: 'Mid Cap',   exchange: 'US' },
  // ── US Equities — Consumer Discretionary ──────────────────────────────────
  { symbol: 'AMZN',  name: 'Amazon',              sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'TSLA',  name: 'Tesla',               sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'HD',    name: 'Home Depot',          sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'MCD',   name: "McDonald's",          sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'NKE',   name: 'Nike',                sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'SBUX',  name: 'Starbucks',           sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'ABNB',  name: 'Airbnb',              sector: 'Consumer Disc.',   type: 'Mid Cap',   exchange: 'US' },
  { symbol: 'BKNG',  name: 'Booking Holdings',    sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Financials ───────────────────────────────────────────────
  { symbol: 'BRK.B', name: 'Berkshire Hathaway',  sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'JPM',   name: 'JPMorgan Chase',      sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'GS',    name: 'Goldman Sachs',       sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MS',    name: 'Morgan Stanley',      sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'BAC',   name: 'Bank of America',     sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'WFC',   name: 'Wells Fargo',         sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'C',     name: 'Citigroup',           sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'V',     name: 'Visa',                sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MA',    name: 'Mastercard',          sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'PYPL',  name: 'PayPal',              sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'BX',    name: 'Blackstone',          sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'KKR',   name: 'KKR & Co.',           sector: 'Financials',       type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Healthcare ───────────────────────────────────────────────
  { symbol: 'LLY',   name: 'Eli Lilly',           sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson',   sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'UNH',   name: 'UnitedHealth',        sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'ABBV',  name: 'AbbVie',              sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MRK',   name: 'Merck',               sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'PFE',   name: 'Pfizer',              sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'AMGN',  name: 'Amgen',               sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'GILD',  name: 'Gilead Sciences',     sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'ISRG',  name: 'Intuitive Surgical',  sector: 'Healthcare',       type: 'Large Cap', exchange: 'US' },
  { symbol: 'MRNA',  name: 'Moderna',             sector: 'Healthcare',       type: 'Mid Cap',   exchange: 'US' },
  // ── US Equities — Energy ───────────────────────────────────────────────────
  { symbol: 'XOM',   name: 'ExxonMobil',          sector: 'Energy',           type: 'Large Cap', exchange: 'US' },
  { symbol: 'CVX',   name: 'Chevron',             sector: 'Energy',           type: 'Large Cap', exchange: 'US' },
  { symbol: 'COP',   name: 'ConocoPhillips',      sector: 'Energy',           type: 'Large Cap', exchange: 'US' },
  { symbol: 'SLB',   name: 'SLB',                 sector: 'Energy',           type: 'Large Cap', exchange: 'US' },
  { symbol: 'OXY',   name: 'Occidental Petroleum',sector: 'Energy',           type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Industrials ──────────────────────────────────────────────
  { symbol: 'CAT',   name: 'Caterpillar',         sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'DE',    name: 'John Deere',          sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'BA',    name: 'Boeing',              sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'RTX',   name: 'RTX',                 sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'LMT',   name: 'Lockheed Martin',     sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'HON',   name: 'Honeywell',           sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'GE',    name: 'GE Aerospace',        sector: 'Industrials',      type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Communication Services ──────────────────────────────────
  { symbol: 'NFLX',  name: 'Netflix',             sector: 'Comm. Services',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'DIS',   name: 'Disney',              sector: 'Comm. Services',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'T',     name: 'AT&T',                sector: 'Comm. Services',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'VZ',    name: 'Verizon',             sector: 'Comm. Services',   type: 'Large Cap', exchange: 'US' },
  { symbol: 'SPOT',  name: 'Spotify',             sector: 'Comm. Services',   type: 'Mid Cap',   exchange: 'US' },
  // ── US Equities — Consumer Staples ────────────────────────────────────────
  { symbol: 'WMT',   name: 'Walmart',             sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  { symbol: 'COST',  name: 'Costco',              sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  { symbol: 'PG',    name: 'Procter & Gamble',    sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  { symbol: 'KO',    name: 'Coca-Cola',           sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  { symbol: 'PEP',   name: 'PepsiCo',             sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  { symbol: 'PM',    name: 'Philip Morris',        sector: 'Consumer Staples', type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Real Estate ──────────────────────────────────────────────
  { symbol: 'PLD',   name: 'Prologis',            sector: 'Real Estate',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'AMT',   name: 'American Tower',      sector: 'Real Estate',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'EQIX',  name: 'Equinix',             sector: 'Real Estate',      type: 'Large Cap', exchange: 'US' },
  { symbol: 'SPG',   name: 'Simon Property Group',sector: 'Real Estate',      type: 'Large Cap', exchange: 'US' },
  // ── US Equities — Utilities ────────────────────────────────────────────────
  { symbol: 'NEE',   name: 'NextEra Energy',      sector: 'Utilities',        type: 'Large Cap', exchange: 'US' },
  { symbol: 'DUK',   name: 'Duke Energy',         sector: 'Utilities',        type: 'Large Cap', exchange: 'US' },

  // ── ASX Equities — Financials ──────────────────────────────────────────────
  { symbol: 'CBA.AX',  name: 'Commonwealth Bank',  sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'NAB.AX',  name: 'NAB',                sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'ANZ.AX',  name: 'ANZ Banking',        sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'WBC.AX',  name: 'Westpac',            sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'MQG.AX',  name: 'Macquarie Group',    sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SUN.AX',  name: 'Suncorp Group',      sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'IAG.AX',  name: 'Insurance Aust.',    sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'QBE.AX',  name: 'QBE Insurance',      sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'AMP.AX',  name: 'AMP Limited',        sector: 'Financials',       type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'HUB.AX',  name: 'Hub24',              sector: 'Financials',       type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'PPT.AX',  name: 'Perpetual',          sector: 'Financials',       type: 'Mid Cap',   exchange: 'ASX' },
  // ── ASX Equities — Materials & Mining ─────────────────────────────────────
  { symbol: 'BHP.AX',  name: 'BHP Group',          sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'RIO.AX',  name: 'Rio Tinto',          sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'FMG.AX',  name: 'Fortescue',          sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'S32.AX',  name: 'South32',            sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'MIN.AX',  name: 'Mineral Resources',  sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'NST.AX',  name: 'Northern Star',      sector: 'Materials',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'EVN.AX',  name: 'Evolution Mining',   sector: 'Materials',        type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'LYC.AX',  name: 'Lynas Rare Earths',  sector: 'Materials',        type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'IGO.AX',  name: 'IGO Limited',        sector: 'Materials',        type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'PLS.AX',  name: 'Pilbara Minerals',   sector: 'Materials',        type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'AWC.AX',  name: 'Alumina Limited',    sector: 'Materials',        type: 'Mid Cap',   exchange: 'ASX' },
  // ── ASX Equities — Healthcare ──────────────────────────────────────────────
  { symbol: 'CSL.AX',  name: 'CSL Limited',        sector: 'Healthcare',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'RMD.AX',  name: 'ResMed',             sector: 'Healthcare',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'COH.AX',  name: 'Cochlear',           sector: 'Healthcare',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SHL.AX',  name: 'Sonic Healthcare',   sector: 'Healthcare',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'RHC.AX',  name: 'Ramsay Health Care', sector: 'Healthcare',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'PME.AX',  name: 'Pro Medicus',        sector: 'Healthcare',       type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'IDX.AX',  name: 'Integral Diagnostics',sector: 'Healthcare',      type: 'Small Cap', exchange: 'ASX' },
  // ── ASX Equities — Consumer ────────────────────────────────────────────────
  { symbol: 'WES.AX',  name: 'Wesfarmers',         sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'WOW.AX',  name: 'Woolworths',         sector: 'Consumer Staples', type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'COL.AX',  name: 'Coles Group',        sector: 'Consumer Staples', type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'ALL.AX',  name: 'Aristocrat Leisure', sector: 'Consumer Disc.',   type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'JBH.AX',  name: 'JB Hi-Fi',          sector: 'Consumer Disc.',   type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'HVN.AX',  name: 'Harvey Norman',      sector: 'Consumer Disc.',   type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'MTS.AX',  name: 'Metcash',            sector: 'Consumer Staples', type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'SUL.AX',  name: 'Super Retail Group', sector: 'Consumer Disc.',   type: 'Mid Cap',   exchange: 'ASX' },
  // ── ASX Equities — Technology ──────────────────────────────────────────────
  { symbol: 'REA.AX',  name: 'REA Group',          sector: 'Technology',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'XRO.AX',  name: 'Xero',              sector: 'Technology',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'CAR.AX',  name: 'CAR Group',          sector: 'Technology',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SEK.AX',  name: 'SEEK Limited',       sector: 'Technology',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'WTC.AX',  name: 'WiseTech Global',    sector: 'Technology',       type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'TNE.AX',  name: 'TechnologyOne',      sector: 'Technology',       type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'APX.AX',  name: 'Appen',              sector: 'Technology',       type: 'Small Cap', exchange: 'ASX' },
  // ── ASX Equities — Energy & Infrastructure ─────────────────────────────────
  { symbol: 'WDS.AX',  name: 'Woodside Energy',    sector: 'Energy',           type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'STO.AX',  name: 'Santos',             sector: 'Energy',           type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'BPT.AX',  name: 'Beach Energy',       sector: 'Energy',           type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'AGL.AX',  name: 'AGL Energy',         sector: 'Utilities',        type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'ORG.AX',  name: 'Origin Energy',      sector: 'Utilities',        type: 'Large Cap', exchange: 'ASX' },
  // ── ASX Equities — Industrials & Other ────────────────────────────────────
  { symbol: 'TLS.AX',  name: 'Telstra',            sector: 'Comm. Services',   type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'TCL.AX',  name: 'Transurban',         sector: 'Industrials',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SYD.AX',  name: 'Sydney Airport',     sector: 'Industrials',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'QAN.AX',  name: 'Qantas Airways',     sector: 'Industrials',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'ALX.AX',  name: 'Atlas Arteria',      sector: 'Industrials',      type: 'Mid Cap',   exchange: 'ASX' },
  { symbol: 'ASX.AX',  name: 'ASX Limited',        sector: 'Financials',       type: 'Large Cap', exchange: 'ASX' },
  // ── ASX Equities — Real Estate ─────────────────────────────────────────────
  { symbol: 'GMG.AX',  name: 'Goodman Group',      sector: 'Real Estate',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SCG.AX',  name: 'Scentre Group',      sector: 'Real Estate',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'DXS.AX',  name: 'Dexus',              sector: 'Real Estate',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'MGR.AX',  name: 'Mirvac Group',       sector: 'Real Estate',      type: 'Large Cap', exchange: 'ASX' },
  { symbol: 'SGP.AX',  name: 'Stockland',          sector: 'Real Estate',      type: 'Large Cap', exchange: 'ASX' },

  // ── US ETFs — Broad Market ─────────────────────────────────────────────────
  { symbol: 'SPY',   name: 'SPDR S&P 500 ETF',       sector: 'Broad Market',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'QQQ',   name: 'Invesco Nasdaq-100 ETF',  sector: 'Broad Market',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'IWM',   name: 'iShares Russell 2000 ETF',sector: 'Broad Market',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'VTI',   name: 'Vanguard Total Mkt ETF',  sector: 'Broad Market',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'VOO',   name: 'Vanguard S&P 500 ETF',    sector: 'Broad Market',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'VEA',   name: 'Vanguard Dev. Markets',   sector: 'International', type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'VWO',   name: 'Vanguard Emrg. Markets',  sector: 'International', type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'EFA',   name: 'iShares MSCI EAFE ETF',   sector: 'International', type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  // ── US ETFs — Sector ──────────────────────────────────────────────────────
  { symbol: 'XLK',   name: 'Tech Select Sector SPDR', sector: 'Technology',    type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLF',   name: 'Financials Select SPDR',  sector: 'Financials',    type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLV',   name: 'Health Care Select SPDR', sector: 'Healthcare',    type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLE',   name: 'Energy Select SPDR',      sector: 'Energy',        type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLI',   name: 'Industrials Select SPDR', sector: 'Industrials',   type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLY',   name: 'Cons. Disc. Select SPDR', sector: 'Consumer Disc.',type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'XLP',   name: 'Cons. Staples Select SPDR',sector:'Consumer Staples',type:'Large Cap',exchange: 'US', assetClass: 'ETF' },
  { symbol: 'ARKK',  name: 'ARK Innovation ETF',      sector: 'Technology',    type: 'Mid Cap',   exchange: 'US', assetClass: 'ETF' },
  // ── US ETFs — Fixed Income ────────────────────────────────────────────────
  { symbol: 'AGG',   name: 'iShares Core US Agg Bond',sector: 'Fixed Income',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'BND',   name: 'Vanguard Total Bond Mkt', sector: 'Fixed Income',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'TLT',   name: 'iShares 20+ Yr Tsy Bond', sector: 'Fixed Income',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'HYG',   name: 'iShares High Yield Corp', sector: 'Fixed Income',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'LQD',   name: 'iShares Inv. Grade Corp', sector: 'Fixed Income',  type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  // ── US ETFs — Commodities ─────────────────────────────────────────────────
  { symbol: 'GLD',   name: 'SPDR Gold Shares ETF',    sector: 'Commodities',   type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'SLV',   name: 'iShares Silver Trust',    sector: 'Commodities',   type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'USO',   name: 'United States Oil Fund',  sector: 'Commodities',   type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'PDBC',  name: 'Invesco Optimum Yld Div', sector: 'Commodities',   type: 'Mid Cap',   exchange: 'US', assetClass: 'ETF' },
  // ── US ETFs — Thematic ────────────────────────────────────────────────────
  { symbol: 'SOXX',  name: 'iShares Semis ETF',       sector: 'Technology',    type: 'Large Cap', exchange: 'US', assetClass: 'ETF' },
  { symbol: 'ICLN',  name: 'iShares Global Clean Nrg',sector: 'Utilities',     type: 'Mid Cap',   exchange: 'US', assetClass: 'ETF' },
  { symbol: 'BOTZ',  name: 'Global X Robotics & AI',  sector: 'Technology',    type: 'Mid Cap',   exchange: 'US', assetClass: 'ETF' },
  { symbol: 'CIBR',  name: 'First Trust Cybersec ETF',sector: 'Technology',    type: 'Mid Cap',   exchange: 'US', assetClass: 'ETF' },
  // ── ASX ETFs ──────────────────────────────────────────────────────────────
  { symbol: 'VAS.AX',  name: 'Vanguard Aust. Shares', sector: 'Broad Market',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'VGS.AX',  name: 'Vanguard Intl Shares',  sector: 'International', type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'NDQ.AX',  name: 'BetaShares Nasdaq 100', sector: 'Broad Market',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'A200.AX', name: 'BetaShares ASX 200',    sector: 'Broad Market',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'IOZ.AX',  name: 'iShares Core ASX 200',  sector: 'Broad Market',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'IVV.AX',  name: 'iShares S&P 500 (ASX)', sector: 'Broad Market',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'QUAL.AX', name: 'VanEck Quality ETF',    sector: 'International', type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'HACK.AX', name: 'BetaShares Cybersec',   sector: 'Technology',    type: 'Mid Cap',   exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'ETHI.AX', name: 'BetaShares Global Sus.',sector: 'International', type: 'Mid Cap',   exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'GOLD.AX', name: 'BetaShares Gold Bullion',sector:'Commodities',   type: 'Mid Cap',   exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'QRE.AX',  name: 'BetaShares Resources',  sector: 'Materials',     type: 'Mid Cap',   exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'VBND.AX', name: 'Vanguard Global Bond',  sector: 'Fixed Income',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
  { symbol: 'IAF.AX',  name: 'iShares Core Corp Bond',sector: 'Fixed Income',  type: 'Large Cap', exchange: 'ASX', assetClass: 'ETF' },
]

const ALL_SECTORS     = ['All', ...Array.from(new Set(UNIVERSE.map(u => u.sector))).sort()]
const ALL_TYPES       = ['All', 'Large Cap', 'Mid Cap', 'Small Cap']
const ALL_EXCH        = ['All', 'US', 'ASX']
const ALL_ASSET_CLASS = ['All', 'Equity', 'ETF']

type SortField = 'symbol' | 'name' | 'price' | 'dp' | 'd' | 'volume'
type SortDir   = 'asc' | 'desc'

function fmt(n: number, dec = 2) { return n.toFixed(dec) }
function fmtVol(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(v)
}

// ── Main component ────────────────────────────────────────────────────────────
export function SCRN() {
  const { openTab } = useTerminalStore()

  // Filters
  const [sector,     setSector]     = useState('All')
  const [cap,        setCap]        = useState('All')
  const [exch,       setExch]       = useState('All')
  const [assetClass, setAssetClass] = useState('All')
  const [minDp,      setMinDp]      = useState('')
  const [maxDp,      setMaxDp]      = useState('')
  const [search,     setSearch]     = useState('')
  const [sortField,  setSortField]  = useState<SortField>('dp')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')

  // Fetch all quotes in one call
  const allSymbols = UNIVERSE.map(u => u.symbol).join(',')
  const { data: quotes = {}, isFetching } = useQuery<Record<string, { c: number; d: number; dp: number; v?: number }>>({
    queryKey: ['scrn-quotes'],
    queryFn:  () => fetch(`/api/quotes?symbols=${encodeURIComponent(allSymbols)}`).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

  // Build rows
  const rows = useMemo(() => {
    let list = UNIVERSE.map(u => ({
      ...u,
      price:  quotes[u.symbol]?.c,
      d:      quotes[u.symbol]?.d,
      dp:     quotes[u.symbol]?.dp,
      volume: quotes[u.symbol]?.v,
    }))

    // Filters
    if (sector     !== 'All') list = list.filter(r => r.sector === sector)
    if (cap        !== 'All') list = list.filter(r => r.type   === cap)
    if (exch       !== 'All') list = list.filter(r => r.exchange === exch)
    if (assetClass !== 'All') list = list.filter(r => (r.assetClass ?? 'Equity') === assetClass)
    if (search) {
      const q = search.toUpperCase()
      list = list.filter(r => r.symbol.includes(q) || r.name.toUpperCase().includes(q))
    }
    if (minDp !== '') list = list.filter(r => r.dp != null && r.dp >= parseFloat(minDp))
    if (maxDp !== '') list = list.filter(r => r.dp != null && r.dp <= parseFloat(maxDp))

    // Sort
    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0
      if (sortField === 'symbol') { va = a.symbol; vb = b.symbol }
      else if (sortField === 'name')   { va = a.name;   vb = b.name }
      else if (sortField === 'price')  { va = a.price  ?? -Infinity; vb = b.price  ?? -Infinity }
      else if (sortField === 'dp')     { va = a.dp     ?? -Infinity; vb = b.dp     ?? -Infinity }
      else if (sortField === 'd')      { va = a.d      ?? -Infinity; vb = b.d      ?? -Infinity }
      else if (sortField === 'volume') { va = a.volume ?? -Infinity; vb = b.volume ?? -Infinity }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })

    return list
  }, [quotes, sector, cap, exch, search, minDp, maxDp, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const Th = ({ field, label, right }: { field: SortField; label: string; right?: boolean }) => (
    <th onClick={() => toggleSort(field)} style={{
      cursor: 'pointer', userSelect: 'none',
      textAlign: right ? 'right' : 'left',
      color: sortField === field ? '#ffa028' : '#666',
      padding: '3px 8px', whiteSpace: 'nowrap',
      borderBottom: '1px solid #1f1f1f',
      fontSize: 10,
    }}>
      {label}{sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const filterInput = (value: string, onChange: (v: string) => void, placeholder: string, w = 100) => (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: '#050505', border: '1px solid #222', color: '#e8e8e8',
        fontFamily: 'inherit', fontSize: 10, padding: '2px 6px',
        outline: 'none', width: w,
      }}
    />
  )

  const filterSelect = (value: string, onChange: (v: string) => void, options: string[]) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: '#050505', border: '1px solid #222', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: 10, padding: '2px 6px', outline: 'none', cursor: 'pointer',
    }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  // Counts for status line
  const posCount = rows.filter(r => (r.dp ?? 0) > 0).length
  const negCount = rows.filter(r => (r.dp ?? 0) < 0).length

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="panel-mnemonic">SCRN</span>
          <span style={{ color: '#444', fontSize: 10 }}>STOCK SCREENER</span>
        </div>
        <span style={{ color: '#444', fontSize: 10 }}>
          {isFetching ? 'REFRESHING...' : `${rows.length} stocks · ${posCount} up · ${negCount} down`}
        </span>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '5px 8px', borderBottom: '1px solid #111',
        background: '#020202', flexShrink: 0,
      }}>
        <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.08em' }}>FILTER:</span>
        {filterInput(search, setSearch, 'Search symbol/name…', 130)}
        {filterSelect(exch,       setExch,       ALL_EXCH)}
        {filterSelect(assetClass, setAssetClass, ALL_ASSET_CLASS)}
        {filterSelect(sector,     setSector,     ALL_SECTORS)}
        {filterSelect(cap,        setCap,        ALL_TYPES)}
        <span style={{ color: '#333', fontSize: 9 }}>DAY CHG%:</span>
        {filterInput(minDp, setMinDp, 'Min', 50)}
        <span style={{ color: '#333', fontSize: 9 }}>to</span>
        {filterInput(maxDp, setMaxDp, 'Max', 50)}
        <button onClick={() => { setSector('All'); setCap('All'); setExch('All'); setAssetClass('All'); setMinDp(''); setMaxDp(''); setSearch('') }}
          style={{ background: 'none', border: '1px solid #222', color: '#555', fontFamily: 'inherit', fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}>
          CLEAR
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#020202', zIndex: 1 }}>
            <tr>
              <Th field="symbol" label="SYMBOL" />
              <Th field="name"   label="NAME" />
              <th style={{ color: '#666', fontSize: 10, padding: '3px 8px', borderBottom: '1px solid #1f1f1f', textAlign: 'left' }}>SECTOR</th>
              <th style={{ color: '#666', fontSize: 10, padding: '3px 8px', borderBottom: '1px solid #1f1f1f', textAlign: 'left' }}>EXCH</th>
              <Th field="price"  label="PRICE"   right />
              <Th field="d"      label="CHG"      right />
              <Th field="dp"     label="CHG %"    right />
              <Th field="volume" label="VOLUME"   right />
              <th style={{ color: '#666', fontSize: 10, padding: '3px 8px', borderBottom: '1px solid #1f1f1f' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const up  = (r.dp ?? 0) >= 0
              const clr = r.dp == null ? '#555' : up ? '#33ff66' : '#ff3b3b'
              return (
                <tr key={r.symbol} style={{ cursor: 'pointer' }} onClick={() => openTab(r.symbol, 'GIP')}>
                  <td style={{ color: '#4d9fff', fontSize: 11, fontWeight: 'bold', padding: '2px 8px' }}>
                    {r.symbol.replace('.AX', '')}
                  </td>
                  <td style={{ color: '#e8e8e8', fontSize: 10, padding: '2px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                    {r.assetClass === 'ETF' && (
                      <span style={{ marginLeft: 5, fontSize: 8, color: '#ffa028', border: '1px solid #ffa02866', padding: '0 3px', verticalAlign: 'middle', letterSpacing: '0.05em' }}>ETF</span>
                    )}
                  </td>
                  <td style={{ color: '#777', fontSize: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{r.sector}</td>
                  <td style={{ padding: '2px 8px' }}>
                    <span style={{ color: r.exchange === 'ASX' ? '#ffa028' : '#4d9fff', fontSize: 8, border: `1px solid ${r.exchange === 'ASX' ? '#ffa028' : '#4d9fff'}`, padding: '0 3px', opacity: 0.7 }}>
                      {r.exchange}
                    </span>
                  </td>
                  <td style={{ color: '#e8e8e8', fontSize: 11, padding: '2px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.price != null ? (r.price < 10 ? r.price.toFixed(3) : r.price.toFixed(2)) : '—'}
                  </td>
                  <td style={{ color: clr, fontSize: 11, padding: '2px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.d != null ? (r.d >= 0 ? '+' : '') + fmt(r.d) : '—'}
                  </td>
                  <td style={{ padding: '2px 8px', textAlign: 'right' }}>
                    <span style={{ color: clr, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                      {r.dp != null ? (r.dp >= 0 ? '▲ ' : '▼ ') + Math.abs(r.dp).toFixed(2) + '%' : '—'}
                    </span>
                  </td>
                  <td style={{ color: '#777', fontSize: 10, padding: '2px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.volume != null ? fmtVol(r.volume) : '—'}
                  </td>
                  <td style={{ padding: '2px 8px', textAlign: 'right' }}>
                    <button onClick={e => { e.stopPropagation(); openTab(r.symbol, 'DES') }}
                      style={{ background: 'none', border: 'none', color: '#333', fontFamily: 'inherit', fontSize: 9, cursor: 'pointer', padding: 0 }}>
                      DES →
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ color: '#333', fontSize: 11, padding: '20px 8px', textAlign: 'center' }}>No stocks match current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
