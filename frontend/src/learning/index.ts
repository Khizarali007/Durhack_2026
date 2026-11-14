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

// Learn mode (guided tutorials over Person 3's screens)
export { LearnMode } from './learn/LearnMode'
export { TourPromptCard } from './learn/TourPromptCard'
export { TourOverlay, tour, useTourState, TUTORIALS } from './tour'
export type { Tutorial, TourStepDef, StepCompletion } from './tour'
export { GlossaryTerm } from './glossary/GlossaryTerm'
export type { GlossaryTermProps } from './glossary/GlossaryTerm'
export { GLOSSARY, findTerm, termKey, missionLesson } from './content'
