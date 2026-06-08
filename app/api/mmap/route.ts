export const maxDuration = 30  // Vercel: allow up to 30s for batch quote fetch
import { getCached, setCached } from '@/lib/cache'
import { fetchCrumb } from '@/lib/providers/yahoo'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface MmapStock {
  symbol:    string
  name:      string
  sector:    string
  mktCapB:   number   // approx market cap in $B — used for tile sizing
  price:     number | null
  change:    number | null
  changePct: number | null
}

// ── Constituent definitions ────────────────────────────────────────────────
// mktCapB is approximate (used only for relative tile sizing, not displayed).
// Updated periodically — exact values don't matter, order-of-magnitude does.

interface Def { symbol: string; name: string; sector: string; mktCapB: number }

const SP500: Def[] = [
  // Technology
  { symbol:'AAPL',  name:'Apple',              sector:'Technology',             mktCapB:3100 },
  { symbol:'MSFT',  name:'Microsoft',           sector:'Technology',             mktCapB:3000 },
  { symbol:'NVDA',  name:'NVIDIA',              sector:'Technology',             mktCapB:2900 },
  { symbol:'AVGO',  name:'Broadcom',            sector:'Technology',             mktCapB:780  },
  { symbol:'ORCL',  name:'Oracle',              sector:'Technology',             mktCapB:470  },
  { symbol:'CRM',   name:'Salesforce',          sector:'Technology',             mktCapB:290  },
  { symbol:'AMD',   name:'AMD',                 sector:'Technology',             mktCapB:270  },
  { symbol:'QCOM',  name:'Qualcomm',            sector:'Technology',             mktCapB:210  },
  { symbol:'TXN',   name:'Texas Instruments',   sector:'Technology',             mktCapB:175  },
  { symbol:'AMAT',  name:'Applied Materials',   sector:'Technology',             mktCapB:160  },
  { symbol:'PANW',  name:'Palo Alto Networks',  sector:'Technology',             mktCapB:120  },
  { symbol:'LRCX',  name:'Lam Research',        sector:'Technology',             mktCapB:115  },
  { symbol:'KLAC',  name:'KLA Corp',            sector:'Technology',             mktCapB:100  },
  { symbol:'ADI',   name:'Analog Devices',      sector:'Technology',             mktCapB:95   },
  { symbol:'SNPS',  name:'Synopsys',            sector:'Technology',             mktCapB:90   },
  { symbol:'CDNS',  name:'Cadence Design',      sector:'Technology',             mktCapB:85   },
  { symbol:'INTC',  name:'Intel',               sector:'Technology',             mktCapB:95   },
  { symbol:'CSCO',  name:'Cisco',               sector:'Technology',             mktCapB:200  },
  { symbol:'IBM',   name:'IBM',                 sector:'Technology',             mktCapB:185  },
  { symbol:'NOW',   name:'ServiceNow',          sector:'Technology',             mktCapB:220  },
  { symbol:'INTU',  name:'Intuit',              sector:'Technology',             mktCapB:185  },
  { symbol:'FTNT',  name:'Fortinet',            sector:'Technology',             mktCapB:65   },
  { symbol:'MCHP',  name:'Microchip Tech',      sector:'Technology',             mktCapB:44   },
  { symbol:'APH',   name:'Amphenol',            sector:'Technology',             mktCapB:82   },
  { symbol:'TEL',   name:'TE Connectivity',     sector:'Technology',             mktCapB:44   },
  // Communication Services
  { symbol:'GOOGL', name:'Alphabet A',          sector:'Communication Services', mktCapB:2100 },
  { symbol:'META',  name:'Meta',                sector:'Communication Services', mktCapB:1600 },
  { symbol:'NFLX',  name:'Netflix',             sector:'Communication Services', mktCapB:380  },
  { symbol:'DIS',   name:'Disney',              sector:'Communication Services', mktCapB:170  },
  { symbol:'CMCSA', name:'Comcast',             sector:'Communication Services', mktCapB:155  },
  { symbol:'T',     name:'AT&T',                sector:'Communication Services', mktCapB:140  },
  { symbol:'VZ',    name:'Verizon',             sector:'Communication Services', mktCapB:165  },
  { symbol:'TMUS',  name:'T-Mobile',            sector:'Communication Services', mktCapB:265  },
  { symbol:'EA',    name:'Electronic Arts',     sector:'Communication Services', mktCapB:35   },
  { symbol:'TTWO',  name:'Take-Two',            sector:'Communication Services', mktCapB:25   },
  { symbol:'OMC',   name:'Omnicom',             sector:'Communication Services', mktCapB:18   },
  // Consumer Discretionary
  { symbol:'AMZN',  name:'Amazon',              sector:'Consumer Discretionary', mktCapB:2200 },
  { symbol:'TSLA',  name:'Tesla',               sector:'Consumer Discretionary', mktCapB:700  },
  { symbol:'HD',    name:'Home Depot',          sector:'Consumer Discretionary', mktCapB:380  },
  { symbol:'MCD',   name:"McDonald's",          sector:'Consumer Discretionary', mktCapB:215  },
  { symbol:'NKE',   name:'Nike',                sector:'Consumer Discretionary', mktCapB:105  },
  { symbol:'LOW',   name:"Lowe's",              sector:'Consumer Discretionary', mktCapB:145  },
  { symbol:'SBUX',  name:'Starbucks',           sector:'Consumer Discretionary', mktCapB:85   },
  { symbol:'TJX',   name:'TJX Companies',       sector:'Consumer Discretionary', mktCapB:145  },
  { symbol:'BKNG',  name:'Booking Holdings',    sector:'Consumer Discretionary', mktCapB:165  },
  { symbol:'CMG',   name:'Chipotle',            sector:'Consumer Discretionary', mktCapB:75   },
  { symbol:'ABNB',  name:'Airbnb',              sector:'Consumer Discretionary', mktCapB:85   },
  { symbol:'GM',    name:'General Motors',      sector:'Consumer Discretionary', mktCapB:48   },
  { symbol:'F',     name:'Ford',                sector:'Consumer Discretionary', mktCapB:42   },
  { symbol:'DHI',   name:'D.R. Horton',         sector:'Consumer Discretionary', mktCapB:45   },
  { symbol:'LEN',   name:'Lennar',              sector:'Consumer Discretionary', mktCapB:35   },
  // Consumer Staples
  { symbol:'WMT',   name:'Walmart',             sector:'Consumer Staples',       mktCapB:780  },
  { symbol:'PG',    name:'Procter & Gamble',    sector:'Consumer Staples',       mktCapB:370  },
  { symbol:'KO',    name:'Coca-Cola',           sector:'Consumer Staples',       mktCapB:285  },
  { symbol:'PEP',   name:'PepsiCo',             sector:'Consumer Staples',       mktCapB:215  },
  { symbol:'COST',  name:'Costco',              sector:'Consumer Staples',       mktCapB:400  },
  { symbol:'PM',    name:'Philip Morris',       sector:'Consumer Staples',       mktCapB:205  },
  { symbol:'MO',    name:'Altria',              sector:'Consumer Staples',       mktCapB:90   },
  { symbol:'MDLZ',  name:'Mondelez',            sector:'Consumer Staples',       mktCapB:85   },
  { symbol:'CL',    name:'Colgate-Palmolive',   sector:'Consumer Staples',       mktCapB:72   },
  { symbol:'KHC',   name:'Kraft Heinz',         sector:'Consumer Staples',       mktCapB:35   },
  { symbol:'GIS',   name:'General Mills',       sector:'Consumer Staples',       mktCapB:30   },
  // Healthcare
  { symbol:'LLY',   name:'Eli Lilly',           sector:'Healthcare',             mktCapB:850  },
  { symbol:'UNH',   name:'UnitedHealth',        sector:'Healthcare',             mktCapB:480  },
  { symbol:'JNJ',   name:'Johnson & Johnson',   sector:'Healthcare',             mktCapB:380  },
  { symbol:'ABBV',  name:'AbbVie',              sector:'Healthcare',             mktCapB:340  },
  { symbol:'MRK',   name:'Merck',               sector:'Healthcare',             mktCapB:280  },
  { symbol:'TMO',   name:'Thermo Fisher',       sector:'Healthcare',             mktCapB:210  },
  { symbol:'ABT',   name:'Abbott Labs',         sector:'Healthcare',             mktCapB:200  },
  { symbol:'DHR',   name:'Danaher',             sector:'Healthcare',             mktCapB:155  },
  { symbol:'BMY',   name:'Bristol-Myers',       sector:'Healthcare',             mktCapB:125  },
  { symbol:'AMGN',  name:'Amgen',               sector:'Healthcare',             mktCapB:165  },
  { symbol:'GILD',  name:'Gilead Sciences',     sector:'Healthcare',             mktCapB:105  },
  { symbol:'ISRG',  name:'Intuitive Surgical',  sector:'Healthcare',             mktCapB:185  },
  { symbol:'SYK',   name:'Stryker',             sector:'Healthcare',             mktCapB:145  },
  { symbol:'VRTX',  name:'Vertex Pharma',       sector:'Healthcare',             mktCapB:130  },
  { symbol:'REGN',  name:'Regeneron',           sector:'Healthcare',             mktCapB:75   },
  { symbol:'CI',    name:'Cigna',               sector:'Healthcare',             mktCapB:85   },
  { symbol:'CVS',   name:'CVS Health',          sector:'Healthcare',             mktCapB:65   },
  { symbol:'HCA',   name:'HCA Healthcare',      sector:'Healthcare',             mktCapB:85   },
  { symbol:'ZTS',   name:'Zoetis',              sector:'Healthcare',             mktCapB:75   },
  { symbol:'MDT',   name:'Medtronic',           sector:'Healthcare',             mktCapB:100  },
  // Financials
  { symbol:'BRK-B', name:'Berkshire Hathaway',  sector:'Financials',             mktCapB:1050 },
  { symbol:'JPM',   name:'JPMorgan Chase',      sector:'Financials',             mktCapB:710  },
  { symbol:'V',     name:'Visa',                sector:'Financials',             mktCapB:620  },
  { symbol:'MA',    name:'Mastercard',          sector:'Financials',             mktCapB:490  },
  { symbol:'BAC',   name:'Bank of America',     sector:'Financials',             mktCapB:320  },
  { symbol:'WFC',   name:'Wells Fargo',         sector:'Financials',             mktCapB:220  },
  { symbol:'GS',    name:'Goldman Sachs',       sector:'Financials',             mktCapB:185  },
  { symbol:'MS',    name:'Morgan Stanley',      sector:'Financials',             mktCapB:180  },
  { symbol:'BLK',   name:'BlackRock',           sector:'Financials',             mktCapB:160  },
  { symbol:'SPGI',  name:'S&P Global',          sector:'Financials',             mktCapB:155  },
  { symbol:'AXP',   name:'American Express',    sector:'Financials',             mktCapB:185  },
  { symbol:'CB',    name:'Chubb',               sector:'Financials',             mktCapB:115  },
  { symbol:'MMC',   name:'Marsh McLennan',      sector:'Financials',             mktCapB:100  },
  { symbol:'ICE',   name:'Intercont. Exchange', sector:'Financials',             mktCapB:85   },
  { symbol:'CME',   name:'CME Group',           sector:'Financials',             mktCapB:80   },
  { symbol:'MCO',   name:"Moody's",             sector:'Financials',             mktCapB:78   },
  { symbol:'PGR',   name:'Progressive',         sector:'Financials',             mktCapB:145  },
  { symbol:'USB',   name:'U.S. Bancorp',        sector:'Financials',             mktCapB:65   },
  { symbol:'PNC',   name:'PNC Financial',       sector:'Financials',             mktCapB:68   },
  { symbol:'TFC',   name:'Truist Financial',    sector:'Financials',             mktCapB:52   },
  // Industrials
  { symbol:'GE',    name:'GE Aerospace',        sector:'Industrials',            mktCapB:220  },
  { symbol:'CAT',   name:'Caterpillar',         sector:'Industrials',            mktCapB:190  },
  { symbol:'DE',    name:'Deere & Co',          sector:'Industrials',            mktCapB:115  },
  { symbol:'RTX',   name:'RTX Corp',            sector:'Industrials',            mktCapB:165  },
  { symbol:'HON',   name:'Honeywell',           sector:'Industrials',            mktCapB:140  },
  { symbol:'UPS',   name:'UPS',                 sector:'Industrials',            mktCapB:100  },
  { symbol:'LMT',   name:'Lockheed Martin',     sector:'Industrials',            mktCapB:115  },
  { symbol:'BA',    name:'Boeing',              sector:'Industrials',            mktCapB:125  },
  { symbol:'NOC',   name:'Northrop Grumman',    sector:'Industrials',            mktCapB:72   },
  { symbol:'GD',    name:'General Dynamics',    sector:'Industrials',            mktCapB:75   },
  { symbol:'ETN',   name:'Eaton',               sector:'Industrials',            mktCapB:125  },
  { symbol:'EMR',   name:'Emerson Electric',    sector:'Industrials',            mktCapB:65   },
  { symbol:'ITW',   name:'Illinois Tool Works', sector:'Industrials',            mktCapB:75   },
  { symbol:'UNP',   name:'Union Pacific',       sector:'Industrials',            mktCapB:145  },
  { symbol:'CSX',   name:'CSX Corp',            sector:'Industrials',            mktCapB:55   },
  { symbol:'NSC',   name:'Norfolk Southern',    sector:'Industrials',            mktCapB:52   },
  { symbol:'FDX',   name:'FedEx',               sector:'Industrials',            mktCapB:62   },
  { symbol:'WM',    name:'Waste Management',    sector:'Industrials',            mktCapB:82   },
  // Energy
  { symbol:'XOM',   name:'ExxonMobil',          sector:'Energy',                 mktCapB:510  },
  { symbol:'CVX',   name:'Chevron',             sector:'Energy',                 mktCapB:275  },
  { symbol:'COP',   name:'ConocoPhillips',      sector:'Energy',                 mktCapB:130  },
  { symbol:'EOG',   name:'EOG Resources',       sector:'Energy',                 mktCapB:70   },
  { symbol:'SLB',   name:'SLB',                 sector:'Energy',                 mktCapB:58   },
  { symbol:'MPC',   name:'Marathon Petroleum',  sector:'Energy',                 mktCapB:58   },
  { symbol:'PSX',   name:'Phillips 66',         sector:'Energy',                 mktCapB:52   },
  { symbol:'VLO',   name:'Valero Energy',       sector:'Energy',                 mktCapB:44   },
  { symbol:'OXY',   name:'Occidental',          sector:'Energy',                 mktCapB:48   },
  { symbol:'KMI',   name:'Kinder Morgan',       sector:'Energy',                 mktCapB:24   },
  { symbol:'WMB',   name:'Williams Cos',        sector:'Energy',                 mktCapB:58   },
  { symbol:'DVN',   name:'Devon Energy',        sector:'Energy',                 mktCapB:18   },
  // Materials
  { symbol:'LIN',   name:'Linde',               sector:'Materials',              mktCapB:220  },
  { symbol:'APD',   name:'Air Products',        sector:'Materials',              mktCapB:65   },
  { symbol:'ECL',   name:'Ecolab',              sector:'Materials',              mktCapB:65   },
  { symbol:'SHW',   name:'Sherwin-Williams',    sector:'Materials',              mktCapB:90   },
  { symbol:'FCX',   name:'Freeport-McMoRan',    sector:'Materials',              mktCapB:60   },
  { symbol:'NEM',   name:'Newmont',             sector:'Materials',              mktCapB:55   },
  { symbol:'NUE',   name:'Nucor',               sector:'Materials',              mktCapB:30   },
  { symbol:'VMC',   name:'Vulcan Materials',    sector:'Materials',              mktCapB:30   },
  { symbol:'MLM',   name:'Martin Marietta',     sector:'Materials',              mktCapB:32   },
  // Real Estate
  { symbol:'AMT',   name:'American Tower',      sector:'Real Estate',            mktCapB:90   },
  { symbol:'PLD',   name:'Prologis',            sector:'Real Estate',            mktCapB:105  },
  { symbol:'EQIX',  name:'Equinix',             sector:'Real Estate',            mktCapB:85   },
  { symbol:'CCI',   name:'Crown Castle',        sector:'Real Estate',            mktCapB:45   },
  { symbol:'PSA',   name:'Public Storage',      sector:'Real Estate',            mktCapB:55   },
  { symbol:'DLR',   name:'Digital Realty',      sector:'Real Estate',            mktCapB:48   },
  { symbol:'O',     name:'Realty Income',       sector:'Real Estate',            mktCapB:50   },
  { symbol:'SPG',   name:'Simon Property',      sector:'Real Estate',            mktCapB:55   },
  { symbol:'WELL',  name:'Welltower',           sector:'Real Estate',            mktCapB:72   },
  // Utilities
  { symbol:'NEE',   name:'NextEra Energy',      sector:'Utilities',              mktCapB:140  },
  { symbol:'DUK',   name:'Duke Energy',         sector:'Utilities',              mktCapB:85   },
  { symbol:'SO',    name:'Southern Co',         sector:'Utilities',              mktCapB:80   },
  { symbol:'D',     name:'Dominion Energy',     sector:'Utilities',              mktCapB:42   },
  { symbol:'AEP',   name:'American Elec Power', sector:'Utilities',              mktCapB:50   },
  { symbol:'EXC',   name:'Exelon',              sector:'Utilities',              mktCapB:38   },
  { symbol:'SRE',   name:'Sempra',              sector:'Utilities',              mktCapB:48   },
  { symbol:'XEL',   name:'Xcel Energy',         sector:'Utilities',              mktCapB:32   },
  { symbol:'ED',    name:'Con Edison',          sector:'Utilities',              mktCapB:30   },
  { symbol:'WEC',   name:'WEC Energy',          sector:'Utilities',              mktCapB:28   },
]

const ASX200: Def[] = [
  // Financials
  { symbol:'CBA.AX',  name:'Commonwealth Bank',  sector:'Financials',   mktCapB:160 },
  { symbol:'NAB.AX',  name:'NAB',                sector:'Financials',   mktCapB:90  },
  { symbol:'WBC.AX',  name:'Westpac',            sector:'Financials',   mktCapB:80  },
  { symbol:'ANZ.AX',  name:'ANZ Bank',           sector:'Financials',   mktCapB:75  },
  { symbol:'MQG.AX',  name:'Macquarie Group',    sector:'Financials',   mktCapB:65  },
  { symbol:'QBE.AX',  name:'QBE Insurance',      sector:'Financials',   mktCapB:18  },
  { symbol:'SUN.AX',  name:'Suncorp',            sector:'Financials',   mktCapB:16  },
  { symbol:'IAG.AX',  name:'Insurance Australia',sector:'Financials',   mktCapB:14  },
  { symbol:'CPU.AX',  name:'Computershare',      sector:'Financials',   mktCapB:10  },
  { symbol:'ASX.AX',  name:'ASX Ltd',            sector:'Financials',   mktCapB:10  },
  // Materials
  { symbol:'BHP.AX',  name:'BHP Group',          sector:'Materials',    mktCapB:185 },
  { symbol:'RIO.AX',  name:'Rio Tinto',          sector:'Materials',    mktCapB:115 },
  { symbol:'FMG.AX',  name:'Fortescue',          sector:'Materials',    mktCapB:45  },
  { symbol:'NCM.AX',  name:'Newcrest Mining',    sector:'Materials',    mktCapB:18  },
  { symbol:'OZL.AX',  name:'OZ Minerals',        sector:'Materials',    mktCapB:9   },
  { symbol:'ILU.AX',  name:'Iluka Resources',    sector:'Materials',    mktCapB:4   },
  { symbol:'NHC.AX',  name:'New Hope Coal',      sector:'Materials',    mktCapB:3   },
  { symbol:'S32.AX',  name:'South32',            sector:'Materials',    mktCapB:14  },
  { symbol:'MIN.AX',  name:'Mineral Resources',  sector:'Materials',    mktCapB:12  },
  { symbol:'LYC.AX',  name:'Lynas Rare Earths',  sector:'Materials',    mktCapB:6   },
  // Healthcare
  { symbol:'CSL.AX',  name:'CSL',                sector:'Healthcare',   mktCapB:115 },
  { symbol:'COH.AX',  name:'Cochlear',           sector:'Healthcare',   mktCapB:15  },
  { symbol:'RMD.AX',  name:'ResMed',             sector:'Healthcare',   mktCapB:35  },
  { symbol:'SHL.AX',  name:'Sonic Healthcare',   sector:'Healthcare',   mktCapB:10  },
  { symbol:'RHC.AX',  name:'Ramsay Health Care', sector:'Healthcare',   mktCapB:8   },
  { symbol:'NHF.AX',  name:'nib Holdings',       sector:'Healthcare',   mktCapB:4   },
  { symbol:'MPL.AX',  name:'Medibank',           sector:'Healthcare',   mktCapB:8   },
  // Consumer Staples
  { symbol:'WOW.AX',  name:'Woolworths',         sector:'Consumer Staples', mktCapB:38 },
  { symbol:'COL.AX',  name:'Coles Group',        sector:'Consumer Staples', mktCapB:22 },
  { symbol:'TWE.AX',  name:'Treasury Wine',      sector:'Consumer Staples', mktCapB:6  },
  { symbol:'GNC.AX',  name:'GrainCorp',          sector:'Consumer Staples', mktCapB:2  },
  // Consumer Discretionary
  { symbol:'WES.AX',  name:'Wesfarmers',         sector:'Consumer Discretionary', mktCapB:62 },
  { symbol:'ALL.AX',  name:'Aristocrat Leisure', sector:'Consumer Discretionary', mktCapB:22 },
  { symbol:'TAH.AX',  name:'Tabcorp',            sector:'Consumer Discretionary', mktCapB:3  },
  { symbol:'SUL.AX',  name:'Super Retail Group', sector:'Consumer Discretionary', mktCapB:3  },
  { symbol:'HVN.AX',  name:'Harvey Norman',      sector:'Consumer Discretionary', mktCapB:4  },
  // Communication Services
  { symbol:'TLS.AX',  name:'Telstra',            sector:'Communication Services', mktCapB:30 },
  { symbol:'REA.AX',  name:'REA Group',          sector:'Communication Services', mktCapB:22 },
  { symbol:'SEK.AX',  name:'SEEK',               sector:'Communication Services', mktCapB:8  },
  { symbol:'CAR.AX',  name:'CAR Group',          sector:'Communication Services', mktCapB:8  },
  { symbol:'XRO.AX',  name:'Xero',               sector:'Technology',   mktCapB:18 },
  // Industrials
  { symbol:'TCL.AX',  name:'Transurban',         sector:'Industrials',  mktCapB:38 },
  { symbol:'AZJ.AX',  name:'Aurizon',            sector:'Industrials',  mktCapB:7  },
  { symbol:'BXB.AX',  name:'Brambles',           sector:'Industrials',  mktCapB:18 },
  { symbol:'ORI.AX',  name:'Orica',              sector:'Industrials',  mktCapB:6  },
  { symbol:'AMC.AX',  name:'Amcor',              sector:'Materials',    mktCapB:14 },
  // Energy
  { symbol:'STO.AX',  name:'Santos',             sector:'Energy',       mktCapB:20 },
  { symbol:'WDS.AX',  name:'Woodside Energy',    sector:'Energy',       mktCapB:38 },
  { symbol:'APA.AX',  name:'APA Group',          sector:'Utilities',    mktCapB:10 },
  { symbol:'ALD.AX',  name:'Ampol',              sector:'Energy',       mktCapB:5  },
  // Real Estate
  { symbol:'GMG.AX',  name:'Goodman Group',      sector:'Real Estate',  mktCapB:55 },
  { symbol:'SCG.AX',  name:'Scentre Group',      sector:'Real Estate',  mktCapB:12 },
  { symbol:'GPT.AX',  name:'GPT Group',          sector:'Real Estate',  mktCapB:8  },
  { symbol:'MGR.AX',  name:'Mirvac',             sector:'Real Estate',  mktCapB:7  },
  { symbol:'DXS.AX',  name:'Dexus',              sector:'Real Estate',  mktCapB:6  },
]

const NDX100: Def[] = [
  // Already in SP500 — include the pure Nasdaq names not in S&P list
  { symbol:'AAPL',  name:'Apple',              sector:'Technology',             mktCapB:3100 },
  { symbol:'MSFT',  name:'Microsoft',           sector:'Technology',             mktCapB:3000 },
  { symbol:'NVDA',  name:'NVIDIA',              sector:'Technology',             mktCapB:2900 },
  { symbol:'GOOGL', name:'Alphabet A',          sector:'Communication Services', mktCapB:2100 },
  { symbol:'AMZN',  name:'Amazon',              sector:'Consumer Discretionary', mktCapB:2200 },
  { symbol:'META',  name:'Meta',                sector:'Communication Services', mktCapB:1600 },
  { symbol:'TSLA',  name:'Tesla',               sector:'Consumer Discretionary', mktCapB:700  },
  { symbol:'AVGO',  name:'Broadcom',            sector:'Technology',             mktCapB:780  },
  { symbol:'COST',  name:'Costco',              sector:'Consumer Staples',       mktCapB:400  },
  { symbol:'NFLX',  name:'Netflix',             sector:'Communication Services', mktCapB:380  },
  { symbol:'ASML',  name:'ASML Holding',        sector:'Technology',             mktCapB:295  },
  { symbol:'AMD',   name:'AMD',                 sector:'Technology',             mktCapB:270  },
  { symbol:'TMUS',  name:'T-Mobile',            sector:'Communication Services', mktCapB:265  },
  { symbol:'AZN',   name:'AstraZeneca',         sector:'Healthcare',             mktCapB:255  },
  { symbol:'INTU',  name:'Intuit',              sector:'Technology',             mktCapB:185  },
  { symbol:'CSCO',  name:'Cisco',               sector:'Technology',             mktCapB:200  },
  { symbol:'NOW',   name:'ServiceNow',          sector:'Technology',             mktCapB:220  },
  { symbol:'QCOM',  name:'Qualcomm',            sector:'Technology',             mktCapB:210  },
  { symbol:'TXN',   name:'Texas Instruments',   sector:'Technology',             mktCapB:175  },
  { symbol:'AMAT',  name:'Applied Materials',   sector:'Technology',             mktCapB:160  },
  { symbol:'ISRG',  name:'Intuitive Surgical',  sector:'Healthcare',             mktCapB:185  },
  { symbol:'BKNG',  name:'Booking Holdings',    sector:'Consumer Discretionary', mktCapB:165  },
  { symbol:'PANW',  name:'Palo Alto Networks',  sector:'Technology',             mktCapB:120  },
  { symbol:'VRTX',  name:'Vertex Pharma',       sector:'Healthcare',             mktCapB:130  },
  { symbol:'GILD',  name:'Gilead Sciences',     sector:'Healthcare',             mktCapB:105  },
  { symbol:'LRCX',  name:'Lam Research',        sector:'Technology',             mktCapB:115  },
  { symbol:'MU',    name:'Micron Technology',   sector:'Technology',             mktCapB:115  },
  { symbol:'ADI',   name:'Analog Devices',      sector:'Technology',             mktCapB:95   },
  { symbol:'SNPS',  name:'Synopsys',            sector:'Technology',             mktCapB:90   },
  { symbol:'REGN',  name:'Regeneron',           sector:'Healthcare',             mktCapB:75   },
  { symbol:'CDNS',  name:'Cadence Design',      sector:'Technology',             mktCapB:85   },
  { symbol:'KLAC',  name:'KLA Corp',            sector:'Technology',             mktCapB:100  },
  { symbol:'MELI',  name:'MercadoLibre',        sector:'Consumer Discretionary', mktCapB:105  },
  { symbol:'CRWD',  name:'CrowdStrike',         sector:'Technology',             mktCapB:95   },
  { symbol:'WDAY',  name:'Workday',             sector:'Technology',             mktCapB:65   },
  { symbol:'ABNB',  name:'Airbnb',              sector:'Consumer Discretionary', mktCapB:85   },
  { symbol:'TEAM',  name:'Atlassian',           sector:'Technology',             mktCapB:50   },
  { symbol:'DASH',  name:'DoorDash',            sector:'Consumer Discretionary', mktCapB:55   },
  { symbol:'DXCM',  name:'Dexcom',              sector:'Healthcare',             mktCapB:35   },
  { symbol:'IDXX',  name:'IDEXX Labs',          sector:'Healthcare',             mktCapB:38   },
  { symbol:'ILMN',  name:'Illumina',            sector:'Healthcare',             mktCapB:20   },
  { symbol:'BIIB',  name:'Biogen',              sector:'Healthcare',             mktCapB:25   },
  { symbol:'MRNA',  name:'Moderna',             sector:'Healthcare',             mktCapB:18   },
  { symbol:'ZS',    name:'Zscaler',             sector:'Technology',             mktCapB:28   },
  { symbol:'OKTA',  name:'Okta',                sector:'Technology',             mktCapB:18   },
  { symbol:'TTWO',  name:'Take-Two',            sector:'Communication Services', mktCapB:25   },
  { symbol:'EA',    name:'Electronic Arts',     sector:'Communication Services', mktCapB:35   },
  { symbol:'WBA',   name:'Walgreens',           sector:'Consumer Staples',       mktCapB:8    },
  { symbol:'HON',   name:'Honeywell',           sector:'Industrials',            mktCapB:140  },
  { symbol:'PEP',   name:'PepsiCo',             sector:'Consumer Staples',       mktCapB:215  },
]

const INDEX_MAP: Record<string, Def[]> = {
  'S&P 500': SP500,
  'ASX 200': ASX200,
  'NDX 100': NDX100,
}

// ── Batch Yahoo Finance quotes ─────────────────────────────────────────────
const BATCH = 80   // Yahoo handles up to ~100 at once
const YAHOO_FIELDS = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent'

async function fetchQuotes(symbols: string[]): Promise<Map<string, { price: number; change: number; changePct: number }>> {
  const map = new Map<string, { price: number; change: number; changePct: number }>()
  const { crumb, cookie } = await fetchCrumb()

  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH)
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=${YAHOO_FIELDS}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })
      if (!res.ok) continue
      const json = await res.json()
      for (const q of json?.quoteResponse?.result ?? []) {
        if (q.regularMarketPrice != null) {
          map.set(q.symbol, {
            price:     q.regularMarketPrice,
            change:    q.regularMarketChange     ?? 0,
            changePct: q.regularMarketChangePercent ?? 0,
          })
        }
      }
    } catch { /* skip chunk on error */ }
  }
  return map
}

// ── Route handlers ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const index = new URL(req.url).searchParams.get('index') ?? 'S&P 500'
  const defs  = INDEX_MAP[index] ?? SP500
  const key   = `mmap:${index}`

  const cached = getCached<MmapStock[]>(key)
  if (cached) return Response.json({ stocks: cached, _cached: true })

  try {
    const symbols  = defs.map(d => d.symbol)
    const quoteMap = await fetchQuotes(symbols)

    const stocks: MmapStock[] = defs.map(d => {
      const q = quoteMap.get(d.symbol)
      return {
        symbol:    d.symbol,
        name:      d.name,
        sector:    d.sector,
        mktCapB:   d.mktCapB,
        price:     q?.price     ?? null,
        change:    q?.change    ?? null,
        changePct: q?.changePct ?? null,
      }
    })

    setCached(key, stocks, 5 * 60_000)
    return Response.json({ stocks })
  } catch (e) {
    const c = getCached<MmapStock[]>(key)
    if (c) return Response.json({ stocks: c, _cached: true })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
