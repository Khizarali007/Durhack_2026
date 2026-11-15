import PlayerForecast from './stock/PlayerForecast'
import { useState } from 'react'
import { usePlayers, useQuote, placeOrder, errorDetail, useOrderQuote } from '../api'
import { formatHOOP } from '../utils/format'
import './season.css'
export default function Onboarding({done}:{done:()=>void}){
 const {players}=usePlayers()
 const [search,setSearch]=useState('')
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const terms=normalize(search).trim().split(/\s+/).filter(Boolean)
 const matchingPlayers=players.filter(p=>terms.every(term=>normalize(`${p.name} ${p.team} ${p.symbol}`).includes(term)))
 const [symbol,setSymbol]=useState('JOKIC'), [budget,setBudget]=useState(10000)
 const [manualQty,setManualQty]=useState<number|null>(null)
 function selectPlayer(nextSymbol:string){setSymbol(nextSymbol);setManualQty(null);setSearch('')}
 const [busy,setBusy]=useState(false), [error,setError]=useState('')
 const quote=useQuote(symbol)
 const qty=manualQty??Math.max(1,Math.min(10000,Math.floor(budget/((quote?.ask||1)*1.001))))
 const estimate=useOrderQuote(symbol,'buy',qty)
 async function buy(){setBusy(true);setError('');try{const result=await placeOrder({symbol,side:'buy',qty});if(result.filled_qty>0)done();else setError('No shares filled. Try a smaller order.')}catch(e){setError(errorDetail(e))}finally{setBusy(false)}}
 return <div className="onboarding-page"><div className="onboarding-brand">HoopStreet <span>2024–25</span></div><section className="season-onboarding">
  <div className="season-intro"><span className="section-kicker">New portfolio</span><h1>Create portfolio</h1><p>Buy NBA player shares. Earn game payments. Grow your portfolio over the season.</p><div className="starting-balance"><span className="metric-label">Starting cash</span><strong>H$100,000</strong><small>Virtual funds</small></div><ol className="onboarding-steps"><li><span>01</span>Choose your players</li><li><span>02</span>Advance a week</li><li><span>03</span>Review and trade</li></ol><details className="onboarding-rules"><summary>How scoring works</summary><p>Cash + estimated sale proceeds after costs + pending payments. Each eligible share pays H$0.02 per positive Game Score point. Rewinding resets accounts.</p></details></div>
  <div className="season-first-pick"><div className="panel-heading"><h2>Buy shares</h2><span className="quiet-label">01 / Start</span></div>
   <div className="player-presets">{['Nikola Jokic','Victor Wembanyama','Dyson Daniels'].map(name=>{const p=players.find(p=>p.name===name);return p&&<button key={name} aria-pressed={symbol===p.symbol} onClick={()=>selectPlayer(p.symbol)}>{name}</button>})}</div>
   <label className="field-label" htmlFor="first-player-search">Player</label>
   <input id="first-player-search" className="first-player-search" type="search" aria-label="Search players" placeholder="Search name, team or ticker" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&matchingPlayers.length===1){e.preventDefault();selectPlayer(matchingPlayers[0].symbol)}if(e.key==='Escape')setSearch('')}}/>
   <select id="first-player" aria-label="First player" size={terms.length?Math.min(5,Math.max(2,matchingPlayers.length+1)):1} value={matchingPlayers.some(p=>p.symbol===symbol)?symbol:''} onChange={e=>selectPlayer(e.target.value)}>
    {!matchingPlayers.some(p=>p.symbol===symbol)&&<option value="" disabled>{matchingPlayers.length?'Select a player':'No players found'}</option>}
    {matchingPlayers.map(p=><option key={p.symbol} value={p.symbol}>{p.name} · {p.team}</option>)}
   </select>
   {terms.length>0&&<span className="player-search-status" role="status">{matchingPlayers.length} matches · Current pick: {players.find(p=>p.symbol===symbol)?.name??symbol}</span>}
   <div className="opening-quote"><div><span>Buy price</span><strong>{quote?.ask?formatHOOP(quote.ask):'—'}</strong></div><div title="Model estimate; not a guaranteed price"><span>Analyst estimate</span><strong>{quote?formatHOOP(quote.fair_value):'—'}</strong></div></div>
   <PlayerForecast symbol={symbol} compact/>
   <span className="field-label">Allocation</span><div className="allocation-presets">{[5000,10000,25000].map(amount=><button aria-pressed={budget===amount&&manualQty===null} key={amount} onClick={()=>{setBudget(amount);setManualQty(null)}}>{amount/1000}% <small>{formatHOOP(amount,0)}</small></button>)}</div>
   <label className="quantity-line">Shares <input aria-label="First purchase quantity" type="number" min={1} max={10000} value={qty} onChange={e=>setManualQty(Math.max(1,Math.min(10000,Math.trunc(Number(e.target.value)||1))))}/></label>
   <div className="opening-total"><span>Estimated total <small>Fees included</small></span><strong>{estimate.quote?formatHOOP(estimate.quote.total):'—'}</strong></div>
   {estimate.quote&&estimate.quote.fillable_qty<qty&&<p role="status">{estimate.quote.fillable_qty} shares available.</p>}
   <button className="action-primary opening-buy" disabled={busy||!quote?.ask||!estimate.quote||estimate.quote.cash_short||estimate.quote.fillable_qty===0} onClick={()=>void buy()}>{busy?'Buying…':`Buy ${qty} shares`}<span aria-hidden="true">→</span></button>{(error||estimate.error)&&<p role="alert">{error||estimate.error}</p>}
  </div>
 </section><div className="onboarding-footer">Historical NBA data · Simulated market · No real money</div></div>
}
