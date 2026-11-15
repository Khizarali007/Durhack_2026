// The only door between the UI and the backend. Components import from here,
// never from src/mocks.

// --- Built endpoints ---
export { createSession, getMe, placeOrder, getPortfolio, getPlayers, getCandles, errorDetail } from './rest'

// --- PLANNED endpoints (shapes guessed: see docs/api-assumptions.md) ---
export {
  getOrderQuote, placeOpenOrder, getOpenOrders, cancelOrder, getTrades,
  signup, login, guestSession, logout, getLeaderboard, placeMarginOrder, getEquityHistory,
} from './rest'

// --- Market stream ---
export {
  useMarketStream, subscribeSymbol, subscribeEvents, subscribeWhistle, subscribeTime,
  subscribeOrderUpdates, subscribeReceipts, subscribeMarginCalls, subscribeMarketReset,
  getCachedQuote, getInitPrice, getLatestT,
} from './useMarketStream'
export type { ConnectionStatus } from './useMarketStream'
export { useQuote } from './useQuote'
export { useMarketTime } from './useMarketTime'
export { useRadar, useRadarSummary, getRadarState } from './useRadar'
export type { RadarState, RadarSummary } from './useRadar'
export { useSparkline } from './useSparkline'
export { useEventLog, useSymbolEvents, useLatestWhistle, useWhistleLine } from './eventLog'
export type { WhistleEntry } from './eventLog'
export { useMoveReason } from './useMoveReason'
export type { MoveReason } from './useMoveReason'
export { usePlayers } from './usePlayers'
export { useOrderQuote } from './useOrderQuote'
export type { OrderEstimate } from './useOrderQuote'

// --- Session and account ---
export { useSession, joinAsGuest, loginUser, signupUser, logoutUser, reconnectSession } from './useSession'
export {
  usePortfolio, useOpenOrders, useTrades, useReservedCash, useEquityHistory, useLeaderboard, refreshAccount,
} from './accountStore'

// --- Director (mock only) ---
export {
  pauseMarket, resumeMarket, resetMarket, playScenario, dropConnection, isMarketPaused, DIRECTOR_AVAILABLE,
} from './director'
export type { ScenarioName } from './director'

// --- Shared maths and config ---
export { reservedCash, candleBucket, TIMEFRAME_SECONDS, FEE_RATE } from './orderMath'
export { USE_MOCKS } from './config'

export { ApiError } from './types'
export type {
  Player, MakerQuote, Quote, MarketTick,
  SessionOut, MeOut, OrderIn, OrderOut, FillOut, PortfolioOut, PositionOut,
  Tick, MarketEvent, MarketEventKind, WsMessage, CandleData, Timeframe,
  FinalWhistleMessage, FinalWhistleLine,
  OrderSide, FillReason, MarginOrderIn, OrderQuote, OpenOrderIn, OpenOrder, Receipt, Trade,
  LeaderboardRow, MarginState, MarginStatus, EquityPoint,
  OrderUpdateMessage, ReceiptMessage, MarginCallMessage, DirectorResult,
} from './types'

// --- Learning layer (Person 4): /learning/* REST client and models ---
export {
  createLearningApi, learningRequest, learningWsUrl, LearningApiError, DEFAULT_API_BASE as LEARNING_API_BASE,
} from './learning'
export type {
  LearningApi, LearningHealth, MissionState, MissionOutcome, MissionMessageKind, MissionEntry, MissionMessage,
  MissionStatus, MissionResult, GlossaryTerm, MissionSnapshotMessage, MissionLiveMessage, LearningTickMessage,
  LearningSocketMessage,
} from './learning'

// --- Learn mode tutorials (Person 4): scripted market moments, mock only ---
export { playTutorialMoment, TUTORIAL_MOMENTS_AVAILABLE } from './tutorialDirector'
export type { TutorialMoment } from './tutorialDirector'
