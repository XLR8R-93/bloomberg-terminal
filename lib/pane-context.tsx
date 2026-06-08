import { createContext, useContext } from 'react'
import type { PanelView } from '@/lib/store'

export interface PaneState {
  ticker: string
  view:   PanelView
}

export const PaneContext = createContext<PaneState | null>(null)

/**
 * Returns the ticker for the current pane.
 * Inside a multi-pane layout this comes from PaneContext.
 * Falls back to the global activeTicker if used outside a pane (e.g. QuoteHeader).
 */
export function usePaneTicker(globalTicker: string): string {
  const ctx = useContext(PaneContext)
  return ctx?.ticker ?? globalTicker
}

export function usePaneView(globalView: PanelView): PanelView {
  const ctx = useContext(PaneContext)
  return ctx?.view ?? globalView
}
