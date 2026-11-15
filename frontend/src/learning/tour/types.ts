import type { FillReason, MarketEventKind, OrderSide, Quote, TutorialMoment } from '../../api'

/** A fill made while a tutorial was running. */
export interface TutorialTrade {
  trade_id: string
  symbol: string
  side: OrderSide
  qty: number
  price: number
  fee: number
  reason: FillReason
}

/** A market headline seen while a tutorial was running. */
export interface SeenEvent {
  key: string
  symbol: string
  kind: MarketEventKind
  headline: string
}

/** How a step is finished. */
export type StepCompletion =
  /** Explanation only: the user presses Next. */
  | { type: 'next' }
  | { type: 'payout' }
  /** The user clicks the highlighted element. */
  | { type: 'click' }
  /** The user reaches a route. `prefix` matches anything under it, e.g. "/stock/". */
  | { type: 'navigate'; path: string; prefix?: boolean }
  /** The highlighted text field (or the first one inside it) holds this value. */
  | { type: 'input'; value: string | ((ctx: TourContext) => string) }
  /** An order on this side and symbol fills (optionally with this fill reason). */
  | { type: 'order_filled'; side: OrderSide; symbol: string; reason?: FillReason }
  /** A market event of this kind arrives for this symbol. `moment` asks the tutorial director to make it happen. */
  | { type: 'event'; kind: MarketEventKind; symbol: string; moment?: TutorialMoment; fallback: string }

/** Live values a step's copy can use. */
export interface TourContext {
  quote: (symbol: string) => Quote | undefined
  /** Every fill made during this tutorial, oldest first. */
  trades: TutorialTrade[]
  /** Every headline seen during this tutorial, oldest first. */
  events: SeenEvent[]
  /** The fill or headline that completed this step, if it was an order or event step. */
  trade?: TutorialTrade
  event?: SeenEvent
}

type Copy = string | ((ctx: TourContext) => string)

export interface TourStep {
  /** Route the step needs. The engine navigates there when the step starts. */
  route?: string
  /** `data-tour` id of the element to spotlight. None: a centred card. */
  target?: string
  /** CSS selector for elements that can't carry a data-tour attribute (Person 3's ui components). */
  selector?: string
  title: string
  /** One to three plain-English sentences. */
  body: Copy
  complete: StepCompletion
  /** Shown once the action is done: what just happened, with live values. */
  after?: Copy
  /** For steps waiting on the market: after this many seconds, Next unlocks anyway. */
  waitSeconds?: number
  /** Shown when waitSeconds runs out. */
  waitNote?: string
}

export interface Tutorial {
  id: string
  number: number
  title: string
  summary: string
  minutes: number
  /** Glossary terms this tutorial teaches (must exist in content/glossary.json). */
  teaches: string[]
  /** Mission in content/missions.json whose lesson closes the tutorial. */
  missionNumber?: number
  /** Coming soon: the screens it needs aren't built yet. */
  comingSoon?: string
  /** What you did, shown on the completion card. */
  recap: string[]
  steps: TourStep[]
}
