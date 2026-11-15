import { TourOverlay } from '../../learning/tour/TourOverlay'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useSession, usePortfolio, useTrades, reconnectSession } from '../../api'
import { Button, Card } from '../ui'
import Header from './Header'
import SeasonControls from '../SeasonControls'
import Onboarding from '../Onboarding'
import PaymentNotice from '../PaymentNotice'
import SeasonResetNotice from '../notices/SeasonResetNotice'
import LeftNav from './LeftNav'
import styles from './AppShell.module.css'

/**
 * Jonathan's layout and opening flow (roster setup before the season), behind Person 4's
 * auth gate: no session means /login; a backend that is down keeps the login and retries.
 */
export default function AppShell() {
  const { loading, session, offline } = useSession()
  const { portfolio } = usePortfolio()
  const trades = useTrades()
  const location = useLocation()
  const [entered, setEntered] = useState<string | null>(null)

  if (loading) {
    return (
      <div className={styles.skeleton}>
        <div className={styles.skeletonInner}>
          <div className={styles.skeletonPulse} />
          <div className={styles.skeletonPulseShort} />
        </div>
      </div>
    )
  }

  if (!session && offline) {
    return (
      <div className={styles.skeleton}>
        <Card raised padding="lg" className={styles.offline}>
          <h1 className={styles.offlineTitle}>Connecting…</h1>
          <p className={styles.offlineText}>The game server isn't answering yet. You're still signed in; this retries by itself.</p>
          <Button variant="ghost" onClick={reconnectSession}>Try now</Button>
        </Card>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const setupKey = `starter-portfolio:${session.user_id}`
  let setup: string | null = null
  try {
    setup = localStorage.getItem(setupKey)
  } catch {
    /* Optional persistence. */
  }
  const needsSetup = setup === 'active' || (setup !== 'complete' && portfolio && !trades.length && !portfolio.positions.length)
  if (needsSetup && entered !== session.user_id) {
    return (
      <Onboarding
        storageKey={setupKey}
        done={() => {
          try {
            localStorage.setItem(setupKey, 'complete')
          } catch {
            /* Optional persistence. */
          }
          setEntered(session.user_id)
        }}
      />
    )
  }

  return (
    <div className={styles.shell}>
      <TourOverlay />
      <Header />
      <SeasonControls />
      <SeasonResetNotice />
      <PaymentNotice />
      <div className={styles.below}>
        <LeftNav />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
