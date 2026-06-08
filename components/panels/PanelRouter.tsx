'use client'
import { useTerminalStore } from '@/lib/store'
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

export function PanelRouter() {
  const { activeView } = useTerminalStore()

  switch (activeView) {
    case 'DES': return <DES />
    case 'GIP': return <GIP />
    case 'KS': return <KS />
    case 'CN': return <CN />
    case 'EE': return <EE />
    case 'EST': return <EST />
    case 'RV': return <RV />
    case 'FA': return <FA />
    case 'TOP': return <TOP />
    case 'WL': return <Watchlist />
    case 'TV': return <TV />
    case 'WB': return <WB />
    case 'GLCO': return <GLCO />
    case 'PORT': return <PORT />
    case 'HELP': return <HELP />
    default: return <GIP />
  }
}
