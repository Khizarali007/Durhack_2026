// Learning layer components (Person 4). Network code lives in
// src/api/learning.ts and src/hooks/useMission.ts / useLearningSocket.ts.

export { MissionPanel } from './MissionPanel'
export type { MissionPanelProps } from './MissionPanel'

export { MissionDebrief } from './MissionDebrief'
export type { MissionDebriefProps } from './MissionDebrief'

export { MissionDebriefView } from './MissionDebriefView'
export type { MissionDebriefViewProps } from './MissionDebriefView'

export { MissionList } from './MissionList'
export type { MissionListProps } from './MissionList'

export { FeedItem } from './FeedItem'
export type { FeedItemProps } from './FeedItem'

export { ScoreRing } from './ScoreRing'
export type { ScoreRingProps } from './ScoreRing'

export { HelpTip } from './HelpTip'
export type { HelpTipProps } from './HelpTip'

export { ALERTS, HEADLINES, STATE_LABEL, tradeSummary } from './missionCopy'
export type { AlertStyle, AlertTone } from './missionCopy'
export { formatCountdown, formatHoop, formatPct, formatPrice } from './format'

// Re-exported for convenience so a page can import everything from one place.
export { useMission, useSecondsLeft } from './hooks/useMission'
export type { MissionHandle, UseMissionOptions } from './hooks/useMission'
export { useLearningSocket } from './hooks/useLearningSocket'
export type { SocketStatus } from './hooks/useLearningSocket'

