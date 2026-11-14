// Person 3's ui components (SegmentedControl, Button) don't pass extra
// attributes through, so these two targets are found by position inside the
// ticket instead of by data-tour. If the ticket's markup changes, update here.

/** The Buy / Sell control: the second child of the ticket, after its title row. */
export const TICKET_SIDE = '[data-tour="ticket"] > :nth-child(2)'

/** The big confirm button: the only button directly inside the ticket. */
export const TICKET_CONFIRM = '[data-tour="ticket"] > button'
