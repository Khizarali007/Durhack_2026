import type { ReactNode } from 'react'
import { useSession } from '../api'

/**
 * Restores the stored session when the app starts. The session itself lives in
 * a store inside src/api, so any component can read it with `useSession()`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  useSession()
  return <>{children}</>
}
