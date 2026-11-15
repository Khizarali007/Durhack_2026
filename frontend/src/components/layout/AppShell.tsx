import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useSession, usePortfolio, useTrades } from '../../api'
import Header from './Header'
import SeasonControls from '../SeasonControls'
import Onboarding from '../Onboarding'
import PaymentNotice from '../PaymentNotice'
import LeftNav from './LeftNav'
import styles from './AppShell.module.css'

export default function AppShell() {
  const { loading, session } = useSession()
  const {portfolio}=usePortfolio()
  const trades=useTrades()
  const [entered,setEntered]=useState<string|null>(null)

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

  if (!session) return <div className={styles.shell}><p>Connecting to a fresh account… Reload if the backend has restarted.</p><button onClick={()=>window.location.reload()}>Reconnect</button></div>
  if(portfolio && !trades.length && !portfolio.positions.length && entered!==session.user_id) return <Onboarding done={()=>setEntered(session.user_id)}/>

  return (
    <div className={styles.shell}>
      <Header />
      <SeasonControls />
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
