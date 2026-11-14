import type { OpenOrder, OrderOut, OrderQuote } from '../../../api'

/** What the ticket shows after you press confirm. */
export type TicketResult =
  | { kind: 'filled'; out: OrderOut; estimate: OrderQuote | null }
  | { kind: 'placed'; order: OpenOrder }
  | { kind: 'error'; message: string }
