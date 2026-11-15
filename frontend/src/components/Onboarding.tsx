import { useState } from 'react'
import { usePlayers, useQuote, placeOrder, errorDetail, useOrderQuote } from '../api'
import { formatHOOP } from '../utils/format'
import './season.css'
export default function Onboarding({done}:{done:()=>void}){
 const {players}=usePlayers()
 const [symbol,setSymbol]=useState('JOKIC')
 const [qty,setQty]=useState(10)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const quote=useQuote(symbol)
 const estimate=useOrderQuote(symbol,'buy',qty)
 async function buy(){setBusy(true);setError('');try{await placeOrder({symbol,side:'buy',qty});done()}catch(e){setError(errorDetail(e))}finally{setBusy(false)}}
 return <section className="season-onboarding"><h1>Back your basketball judgement.</h1><p>Start with <strong>$100,000 virtual cash</strong>. Build an NBA portfolio across the 2024–25 season, earn payments from game performances, and grow what your shares could sell for.</p><p>A share earns $0.02 per positive Game Score point when you own it at that game day’s noon cutoff. The share price reflects expected future payments; a great player can still be an expensive investment.</p><h2>Your first investment</h2><select aria-label="First player" value={symbol} onChange={e=>setSymbol(e.target.value)}>{players.map(p=><option key={p.symbol} value={p.symbol}>{p.name} · {p.team}</option>)}</select><label>Shares <input aria-label="First purchase quantity" type="number" min={1} max={10000} value={qty} onChange={e=>setQty(Math.max(1,Math.min(10000,Math.trunc(Number(e.target.value)||1))))}/></label><p>Estimated cash payment: <strong>{estimate.quote?formatHOOP(estimate.quote.total):'Loading…'}</strong> including trading fees.</p><button disabled={busy||!quote?.ask||!estimate.quote||estimate.quote.cash_short} onClick={()=>void buy()}>{busy?'Buying…':'Buy shares and enter the season'}</button>{error&&<p role="alert">{error}</p>}<p><small>Historical daily replay, simulated market. No real-money investment. All accounts reset if the demo rewinds or restarts.</small></p></section>
}
