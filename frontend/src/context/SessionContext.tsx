import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useSession } from '../api'
import type { SessionOut } from '../api'

interface SessionContextValue {
  session: SessionOut | null
  loading: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSession()
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSessionContext used outside SessionProvider')
  return ctx
}
