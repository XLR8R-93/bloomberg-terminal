import { type NextRequest } from 'next/server'
import { finnhub } from '@/lib/providers/finnhub'
import { quoteSummary } from '@/lib/providers/yahoo'
import { getCached, setCached, TTL } from '@/lib/cache'

// Top ASX companies by GICS sector (Yahoo Finance sector names)
const ASX_SECTOR_PEERS: Record<string, string[]> = {
  'Basic Materials':          ['BHP.AX', 'RIO.AX', 'FMG.AX', 'S32.AX', 'MIN.AX', 'NCM.AX', 'IGO.AX', 'LYC.AX', 'OZL.AX'],
  'Energy':                   ['WDS.AX', 'STO.AX', 'ORG.AX', 'WOR.AX', 'BPT.AX', 'KAR.AX'],
  'Financial Services':       ['CBA.AX', 'WBC.AX', 'ANZ.AX', 'NAB.AX', 'MQG.AX', 'SUN.AX', 'IAG.AX', 'AMP.AX'],
  'Healthcare':               ['CSL.AX', 'RMD.AX', 'COH.AX', 'SHL.AX', 'PME.AX', 'NHF.AX', 'RAP.AX'],
  'Consumer Cyclical':        ['WES.AX', 'HVN.AX', 'JBH.AX', 'SUL.AX', 'PMV.AX', 'CTD.AX', 'QAN.AX'],
  'Consumer Defensive':       ['WOW.AX', 'COL.AX', 'TWE.AX', 'A2M.AX', 'CCL.AX', 'GNC.AX'],
  'Technology':               ['XRO.AX', 'WTC.AX', 'TNE.AX', 'APX.AX', 'ALU.AX', 'MP1.AX', 'PRN.AX'],
  'Real Estate':              ['GMG.AX', 'SCG.AX', 'GPT.AX', 'VCX.AX', 'MGR.AX', 'CHC.AX', 'DXS.AX'],
  'Industrials':              ['TCL.AX', 'BXB.AX', 'QAN.AX', 'AZJ.AX', 'TOL.AX', 'SVW.AX', 'DOW.AX'],
  'Utilities':                ['APA.AX', 'AGL.AX', 'ORG.AX', 'SKI.AX', 'DUE.AX'],
  'Communication Services':   ['TLS.AX', 'TPG.AX', 'SPK.AX', 'CAR.AX', 'REA.AX', 'SEK.AX'],
}

async function asxPeers(symbol: string): Promise<string[]> {
  try {
    const data = await quoteSummary(symbol, 'assetProfile')
    const sector = (data.assetProfile as Record<string, string> | undefined)?.sector
    const sectorPeers = sector ? (ASX_SECTOR_PEERS[sector] ?? []) : []
    // Return sector peers excluding the current ticker, up to 9
    return sectorPeers.filter(s => s !== symbol).slice(0, 9)
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  const key = `peers:${symbol}`
  const cached = getCached(key)
  if (cached) return Response.json(cached)

  const isInternational = symbol.includes('.')
  const isAsx = symbol.endsWith('.AX')

  try {
    let data: string[]
    if (isAsx) {
      data = await asxPeers(symbol)
    } else if (isInternational) {
      data = []
    } else {
      try {
        data = await finnhub.peers(symbol)
        if (!Array.isArray(data)) data = []
      } catch {
        data = []
      }
    }
    setCached(key, data, TTL.PEERS)
    return Response.json(data)
  } catch {
    return Response.json([], { status: 200 })
  }
}
