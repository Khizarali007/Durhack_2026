import { useState, useEffect } from 'react'
import type { SessionOut } from './types'
import { getStoredToken, setStoredToken, setStoredUserId } from './config'
import { createSession, getMe } from './rest'

export function useSession(): { session: SessionOut | null; loading: boolean } {
  const [session, setSession] = useState<SessionOut | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      getMe()
        .then(me => { setSession({ token, user_id: me.user_id, cash: me.cash }); setLoading(false) })
        .catch(() => bootstrap())
    } else {
      bootstrap()
    }

    function bootstrap(): void {
      createSession()
        .then(s => {
          setStoredToken(s.token)
          setStoredUserId(s.user_id)
          setSession(s)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [])

  return { session, loading }
}
