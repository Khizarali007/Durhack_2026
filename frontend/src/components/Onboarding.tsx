import { useEffect, useState } from 'react'
import { usePlayers, useQuote, placeOrder, errorDetail, useOrderQuote, usePortfolio, refreshAccount, getCachedQuote, useMarketTime } from '../api'
import { useSeason, changeTimeline } from '../api/useSeason'
import { starterProgress } from '../utils/starterPortfolio'
import { formatHOOP } from '../utils/format'
import { PlayerAvatar } from './PlayerIdentity'
import PlayerForecast from './stock/PlayerForecast'
import './season.css'
import './Onboarding.css'

const PAGE_SIZE = 6
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Onboarding({ done, storageKey }: { done: () => void; storageKey: string }) {
  const { players, bySymbol, loading } = usePlayers()
  const { portfolio } = usePortfolio()
  const { clock, working, error: clockError } = useSeason()
  useMarketTime()
  const progress = starterProgress(portfolio)
  useEffect(() => { try { localStorage.setItem(storageKey, 'active') } catch { /* Optional persistence. */ } }, [storageKey])
  const [search, setSearch] = useState('')
  const [team, setTeam] = useState('')
  const [sort, setSort] = useState('price-desc')
  const [page, setPage] = useState(0)
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [budget, setBudget] = useState(10000)
  const [manualQty, setManualQty] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selected = bySymbol.get(symbol)
  const positions = portfolio?.positions.filter(p => p.qty > 0) ?? []
  const held = positions.find(p => p.symbol === symbol)
  const quote = useQuote(symbol)
  const qty = side === 'sell' ? Math.min(held?.qty ?? 0, manualQty ?? held?.qty ?? 0)
    : manualQty ?? (quote?.ask ? Math.max(1, Math.min(10000, Math.floor(budget / (quote.ask * 1.001)))) : 1)
  const estimate = useOrderQuote(symbol, side, symbol && qty > 0 ? qty : null)
  const startingCash = portfolio?.starting_cash ?? 100000
  const cash = portfolio?.available_cash ?? portfolio?.cash ?? startingCash
  const overLimit = side === 'buy' && (held ? held.avg_cost * held.qty : 0) + (estimate.quote?.notional ?? 0) > startingCash * .25
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean)
  const price = (p: typeof players[number]) => getCachedQuote(p.symbol)?.ask ?? p.start_price
  const matches = players.filter(p => (!team || p.team === team) && terms.every(t => normalize(`${p.name} ${p.team} ${p.symbol}`).includes(t)))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (price(a) - price(b)) * (sort === 'price-desc' ? -1 : 1)) || a.name.localeCompare(b.name))
  const teams = [...new Set(players.map(p => p.team).filter(Boolean))].sort()
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)

  function selectPlayer(next: string) {
    setSymbol(next); setManualQty(null); setSide('buy'); setError(''); setNotice('')
  }
  async function start() { if (progress.ready && await changeTimeline({ paused: false })) done() }
  async function trade() {
    if (!symbol || !qty || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await placeOrder({ symbol, side, qty })
      if (result.filled_qty > 0) {
        await refreshAccount()
        setNotice(`${side === 'buy' ? 'Bought' : 'Sold'} ${result.filled_qty} ${selected?.name ?? symbol} shares`)
        setManualQty(null); setSide('buy'); setSymbol('')
      } else setError('No shares filled. Try a smaller order.')
    } catch (e) { setError(errorDetail(e)) } finally { setBusy(false) }
  }

  return <div className="draft-page">
    <header className="draft-brand"><span>HoopStreet</span><span>NBA · 2024–25 season</span></header>
    <div className="draft-heading"><div><h1>Build your roster</h1><p>Pick at least 3 players across 2 NBA teams.</p></div><div className="draft-cash"><span>Available budget</span><strong>{formatHOOP(cash, 2)}</strong><small>of {formatHOOP(startingCash, 0)}</small></div></div>
    <div className="draft-layout">
      <section className="draft-market" aria-label="Available players">
        <div className="draft-filters">
          <div className="draft-search"><span aria-hidden="true">⌕</span><input aria-label="Search players" placeholder="Search players" type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}/></div>
          <select aria-label="Filter by team" value={team} onChange={e => { setTeam(e.target.value); setPage(0) }}><option value="">All teams</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <select aria-label="Sort players" value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}><option value="price-desc">Price: high to low</option><option value="price-asc">Price: low to high</option><option value="name">Name: A–Z</option></select>
        </div>
        <div className="draft-list-heading"><span>Player <small>{matches.length}</small></span><span>Price / share</span></div>
        <div className="draft-player-list">
          {matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(p => {
            const owned = positions.find(h => h.symbol === p.symbol)
            const live = getCachedQuote(p.symbol)
            return <button key={p.symbol} className="draft-player" aria-pressed={symbol === p.symbol} onClick={() => selectPlayer(p.symbol)} disabled={busy}>
              <PlayerAvatar player={p}/>
              <span className="draft-player-name"><strong>{p.name}</strong><small>{p.team}{owned ? ` · ${owned.qty} shares owned` : ''}</small></span>
              <span className="draft-player-price">{live?.ask === null ? 'Unavailable' : formatHOOP(price(p), 2)}{!live && <small>Opening value</small>}</span><span className="draft-select" aria-hidden="true">{symbol === p.symbol ? '✓' : '+'}</span>
            </button>
          })}
          {!matches.length && <div className="draft-empty">{loading ? 'Loading players…' : 'No players found. Try another name or team.'}</div>}
        </div>
        <footer className="draft-pagination"><span>{matches.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, matches.length)} of ${matches.length}` : '0 players'}</span><div><button aria-label="Previous players" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>←</button><span>{currentPage + 1} / {pages}</span><button aria-label="Next players" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>→</button></div></footer>
      </section>
      <aside className="draft-sidebar">
        {!selected && <section className="draft-roster">
          <div className="panel-heading"><h2>Your roster</h2><span className="quiet-label">{positions.length} {positions.length === 1 ? 'player' : 'players'}</span></div>
          <div className="draft-slots">{positions.map(p => <button key={p.symbol} onClick={() => selectPlayer(p.symbol)} disabled={busy} aria-label={`Manage ${p.name ?? p.symbol}`}><PlayerAvatar player={p} size="sm"/><span><strong>{p.name ?? p.symbol}</strong><small>{p.qty} shares · {p.team}</small></span><b>{formatHOOP(p.market_value, 2)}</b></button>)}{Array.from({ length: Math.max(0, 3 - positions.length) }, (_, i) => <div key={i} className="draft-slot-empty"><span>+</span><span>Choose a player</span></div>)}</div>
          <div className="draft-checks"><span className={progress.playerCount >= 3 ? 'complete' : ''}>{progress.playerCount >= 3 ? '✓' : '○'} 3 players · min. {formatHOOP(startingCash * .05, 0)} each</span><span className={progress.teamCount >= 2 ? 'complete' : ''}>{progress.teamCount >= 2 ? '✓' : '○'} 2 NBA teams</span><span className={progress.balanced ? 'complete' : ''}>{progress.balanced ? '✓' : '○'} No player over 50% of roster value</span></div>
          <button className="action-primary opening-buy" disabled={!progress.ready || busy || working || !clock || clock.busy} onClick={() => void start()}>{working ? 'Starting…' : 'Start season'} <span aria-hidden="true">→</span></button>
        </section>}
        {selected && <section className="draft-ticket" aria-label="Player order" key={symbol}>
          <div className="panel-heading"><div className="draft-selected-player"><PlayerAvatar player={selected}/><h2>{selected.name}</h2></div><button className="draft-close" aria-label="Close player order" disabled={busy} onClick={() => setSymbol('')}>×</button></div>
          {held && <div className="draft-side">{(['buy', 'sell'] as const).map(s => <button key={s} disabled={busy} aria-pressed={side === s} onClick={() => { setSide(s); setManualQty(null); setError('') }}>{s === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>}
          <div className="opening-quote"><div><span>{side === 'buy' ? 'Buy' : 'Sell'} price / share</span><strong>{quote?.[side === 'buy' ? 'ask' : 'bid'] ? formatHOOP(quote[side === 'buy' ? 'ask' : 'bid']!) : '—'}</strong></div></div>
          <PlayerForecast symbol={symbol} compact/>
          {side === 'buy' && <div className="allocation-presets">{[10000, 15000, 20000].map(amount => <button disabled={busy} aria-pressed={budget === amount && manualQty === null} key={amount} onClick={() => { setBudget(amount); setManualQty(null) }}>{formatHOOP(amount, 0)}</button>)}</div>}
          <label className="quantity-line">Shares <input aria-label="Purchase quantity" disabled={busy} type="number" min={1} max={side === 'sell' ? held?.qty : 10000} value={qty} onChange={e => setManualQty(Math.max(1, Math.min(10000, Math.trunc(Number(e.target.value) || 1))))}/></label>
          <div className="opening-total"><span>{side === 'buy' ? 'Estimated cost' : 'Estimated proceeds'}<small>Fees included</small></span><strong>{estimate.quote ? formatHOOP(estimate.quote.total) : '—'}</strong></div>
          {estimate.quote && estimate.quote.fillable_qty < qty && <p className="fine-print">{estimate.quote.fillable_qty} shares available.</p>}
          <button className="action-primary opening-buy" disabled={busy || working || !portfolio || overLimit || !estimate.quote || estimate.quote.cash_short || estimate.quote.fillable_qty === 0 || qty === 0} onClick={() => void trade()}>{busy ? 'Placing order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty} shares`}</button>
          {overLimit && <p className="fine-print">Maximum {formatHOOP(startingCash * .25, 0)} invested per player during setup.</p>}
          {estimate.quote?.cash_short && <p className="fine-print">Not enough available cash. Reduce the quantity.</p>}
        </section>}
        {notice && <p className="draft-notice" role="status">✓ {notice}</p>}
        {(error || estimate.error || clockError) && <p className="draft-error" role="alert">{error || estimate.error || clockError}</p>}
      </aside>
    </div>
    <footer className="draft-footer"><details><summary>Game rules</summary><p>Invest in players, collect performance payments and grow your portfolio through the season. Your final score is cash plus estimated sale proceeds after costs, plus pending payments. Each eligible share pays H$0.0002 per positive Game Score point.</p><p>Player photos: <a href="https://www.espn.com/nba/players" target="_blank" rel="noreferrer">ESPN</a>, matched using SportsDataverse athlete IDs. Photos may show current uniforms.</p><p>Start with at least 3 players worth H$5 each across 2 NBA teams. Keep any one player at or below half your invested roster value. You can sell and change your picks before starting; trades include fees and the bid–ask spread.</p></details><span>Virtual currency · Historical season</span></footer>
  </div>
}
