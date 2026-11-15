import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { reconnectSession, useSession } from '../../api'
import { TourOverlay } from '../../learning/tour/TourOverlay'
import { Button, Card } from '../ui'
import PaymentNotice from '../PaymentNotice'
import SeasonControls from '../SeasonControls'
import SeasonResetNotice from '../notices/SeasonResetNotice'
import Header from './Header'
import LeftNav from './LeftNav'
import styles from './AppShell.module.css'

/** Header, season bar, nav and the page. Without a session it sends you to /login. */
export default function AppShell() {
  const { loading, session, offline } = useSession()
  const location = useLocation()

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
          <h1 className={styles.offlineTitle}>Connecting to the market…</h1>
          <p className={styles.offlineText}>
            The server isn't answering yet. Your login is kept and this retries by itself every couple of seconds.
          </p>
          <Button variant="ghost" onClick={reconnectSession}>Try now</Button>
        </Card>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

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
