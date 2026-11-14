export const USE_MOCKS: boolean = import.meta.env['VITE_USE_MOCKS'] !== 'false'
export const API_BASE = '/trading'

function deriveMarketWsPath(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/trading/ws`
}
export const MARKET_WS_PATH = deriveMarketWsPath()

export function getStoredToken(): string | null { return localStorage.getItem('hs-token') }
export function setStoredToken(token: string): void { localStorage.setItem('hs-token', token) }
export function clearStoredToken(): void {
  localStorage.removeItem('hs-token')
  localStorage.removeItem('hs-user-id')
}
export function getStoredUserId(): string | null { return localStorage.getItem('hs-user-id') }
export function setStoredUserId(id: string): void { localStorage.setItem('hs-user-id', id) }
