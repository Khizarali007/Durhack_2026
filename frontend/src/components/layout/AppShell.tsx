import { Outlet } from 'react-router-dom'
import { useSession } from '../../api'
import Header from './Header'
import LeftNav from './LeftNav'
import styles from './AppShell.module.css'

export default function AppShell() {
  const { loading } = useSession()

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

  return (
    <div className={styles.shell}>
      <Header />
      <div className={styles.below}>
        <LeftNav />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
