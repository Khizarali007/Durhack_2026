import type { DirectorResult } from '../api/types'
import { mockMarket } from './mockMarket'
import { mockEvents } from './mockEvents'
import { mockSession } from './mockSession'
import { mockBus, mockControl } from './mockBus'

// Demo controls. Mock only: Person 1 has not exposed a director API yet.

function ok(detail: string): DirectorResult { return { ok: true, detail } }

export const mockDirector = {
  pause(): DirectorResult {
    mockControl.paused = true
    return ok('Market paused')
  },

  resume(): DirectorResult {
    mockControl.paused = false
    return ok('Market running')
  },

  /** Back to the season start. With `account`, the signed-in user also gets a fresh 100,000 HOOP. */
  reset(account: boolean): DirectorResult {
    mockMarket.reset()
    mockEvents.reset()
    mockSession.onMarketReset()
    if (account) mockSession.resetAccount()
    mockBus.emit({ type: 'market_reset', t: mockMarket.getMarketTime() })
    return ok(account ? 'Market and your account reset' : 'Market reset')
  },

  playScenario(name: string): DirectorResult {
    if (!mockEvents.playScenario(name)) return { ok: false, detail: `Unknown scenario '${name}'` }
    return ok(mockControl.paused
      ? 'Scenario queued: it starts when the market resumes'
      : 'Scenario started: early warning now, storm in six market minutes (30 seconds)')
  },

  dropConnection(): DirectorResult {
    mockControl.dropConnection()
    return ok('Connection dropped: it reconnects in a couple of seconds')
  },

  isPaused(): boolean { return mockControl.paused },
}
