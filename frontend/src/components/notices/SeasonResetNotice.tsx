import { acknowledgeSeasonReset, useSession } from '../../api'
import Notice from './Notice'

/** Shown once after the season restarted (backend restart or rewind): the login survived. */
export default function SeasonResetNotice() {
  const { me } = useSession()
  if (!me?.season_reset) return null
  return (
    <Notice tone="info" dismissLabel="Dismiss season reset notice" onDismiss={() => void acknowledgeSeasonReset()}>
      The season was reset. Your account is safe; your portfolio restarted with H$100.
    </Notice>
  )
}
