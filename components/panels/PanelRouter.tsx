'use client'
import { useContext } from 'react'
import { useTerminalStore } from '@/lib/store'
import { PaneContext } from '@/lib/pane-context'
import { DES } from './DES'
import { GIP } from './GIP'
import { KS } from './KS'
import { CN } from './CN'
import { EE } from './EE'
import { EST } from './EST'
import { RV } from './RV'
import { FA } from './FA'
import { TOP } from './TOP'
import { Watchlist } from './Watchlist'
import { HELP } from './HELP'
import { TV } from './TV'
import { WB } from './WB'
import { GLCO } from './GLCO'
import { PORT } from './PORT'
import { SCRN } from './SCRN'
import { OPT } from './OPT'
import { ECON } from './ECON'
import { MACRO } from './MACRO'
import { ECAL } from './ECAL'
import { INS } from './INS'
import { MMAP } from './MMAP'

export function PanelRouter() {
  // Prefer pane-local view; fall back to global activeView
  const ctx = useContext(PaneContext)
  const { activeView } = useTerminalStore()
  const view = ctx?.view ?? activeView

  switch (view) {
    case 'DES':  return <DES />
    case 'GIP':  return <GIP />
    case 'KS':   return <KS />
    case 'CN':   return <CN />
    case 'EE':   return <EE />
    case 'EST':  return <EST />
    case 'RV':   return <RV />
    case 'FA':   return <FA />
    case 'TOP':  return <TOP />
    case 'WL':   return <Watchlist />
    case 'TV':   return <TV />
    case 'WB':   return <WB />
    case 'GLCO': return <GLCO />
    case 'PORT': return <PORT />
    case 'SCRN': return <SCRN />
    case 'OPT':  return <OPT />
    case 'ECON': return <ECON />
    case 'MACRO': return <MACRO />
    case 'ECAL':  return <ECAL />
    case 'INS':   return <INS />
    case 'MMAP':  return <MMAP />
    case 'HELP': return <HELP />
    default:     return <GIP />
  }
}
