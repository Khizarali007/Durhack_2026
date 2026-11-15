/**
 * Currency denomination boundary. API/store amounts remain legacy accounting
 * units for compatibility with the engine and signed receipts. 1,000 of those
 * units = H$1; one integer ledger cent = H$0.00001. Never round stored balances.
 */
export const ACCOUNTING_UNITS_PER_HOOP = 1000
export const DISPLAY_PRICE_DECIMALS = 5
export const DISPLAY_PRICE_TICK = 0.00001
export function toDisplayCurrency(amount:number):number{return amount/ACCOUNTING_UNITS_PER_HOOP}
export function toAccountingCurrency(amount:number):number{return amount*ACCOUNTING_UNITS_PER_HOOP}
export function priceInputText(amount:number):string{return toDisplayCurrency(amount).toFixed(DISPLAY_PRICE_DECIMALS)}
