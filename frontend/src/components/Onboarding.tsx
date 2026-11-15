import PlayerForecast from './stock/PlayerForecast'
import { useEffect, useState } from 'react'
import { usePlayers, useQuote, placeOrder, errorDetail, useOrderQuote, usePortfolio, refreshAccount } from '../api'
import { useSeason, changeTimeline } from '../api/useSeason'
import { starterProgress } from '../utils/starterPortfolio'
import { formatHOOP } from '../utils/format'
import './season.css'
export default function Onboarding({done,storageKey}:{done:()=>void;storageKey:string}){
 const {players}=usePlayers()
 const {portfolio}=usePortfolio()
 const {score,clock,working,error:clockError}=useSeason()
 const progress=starterProgress(portfolio)
 useEffect(()=>{try{localStorage.setItem(storageKey,'active')}catch{/* Optional persistence. */}},[storageKey])
 const [search,setSearch]=useState('')
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const terms=normalize(search).trim().split(/\s+/).filter(Boolean)
 const matchingPlayers=players.filter(p=>terms.every(term=>normalize(`${p.name} ${p.team} ${p.symbol}`).includes(term)))
 const [symbol,setSymbol]=useState('JOKIC'), [budget,setBudget]=useState(10000)
 const [manualQty,setManualQty]=useState<number|null>(null)
 function selectPlayer(nextSymbol:string){setSymbol(nextSymbol);setManualQty(null);setSearch('')}
 const [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('')
 const quote=useQuote(symbol)
 const qty=manualQty??Math.max(1,Math.min(10000,Math.floor(budget/((quote?.ask||1)*1.001))))
 const estimate=useOrderQuote(symbol,'buy',qty)
 const held=portfolio?.positions.find(p=>p.symbol===symbol)
 const overLimit=(held?held.avg_cost*held.qty:0)+(estimate.quote?.notional??0)>(portfolio?.starting_cash??100000)*.25
 async function start(){if(progress.ready&&await changeTimeline({paused:false}))done()}
 async function buy(){setBusy(true);setError('');try{const result=await placeOrder({symbol,side:'buy',qty});if(result.filled_qty>0){await refreshAccount();setNotice(`Bought ${result.filled_qty} shares · ${players.find(p=>p.symbol===symbol)?.name??symbol}`);setManualQty(null)}else setError('No shares filled. Try a smaller order.')}catch(e){setError(errorDetail(e))}finally{setBusy(false)}}
 return <div className="onboarding-page"><div className="onboarding-brand">HoopStreet <span>2024–25</span></div><section className="season-onboarding">
  <div className="season-intro"><span className="section-kicker">Starter portfolio</span><h1>Create portfolio</h1><p>Start with three players across two teams.</p><div className="starting-balance"><span className="metric-label">Available cash</span><strong>{formatHOOP(portfolio?.available_cash??portfolio?.cash??100000)}</strong></div>
   <ol className="onboarding-steps"><li className={progress.playerCount>=3?'trend-up':''}><span>{Math.min(3,progress.playerCount)}/3</span>Players · {formatHOOP((portfolio?.starting_cash??100000)*.05,0)} each</li><li className={progress.teamCount>=2?'trend-up':''}><span>{Math.min(2,progress.teamCount)}/2</span>Teams represented</li><li className={progress.balanced?'trend-up':''}><span>{(progress.largestWeight*100).toFixed(1)}%</span>Largest holding · keep at 50% or less</li></ol>

   <div className="starter-holdings">{portfolio?.positions.map(p=><div key={p.symbol}><span>{p.name??p.symbol}<small>{p.qty} shares · {p.team}</small></span><strong>{formatHOOP(p.market_value)}</strong></div>)}</div>
   <button className="action-primary opening-buy" disabled={!progress.ready||busy||working||!clock||clock.busy} onClick={()=>void start()}>{working?'Starting…':'Start season'} <span aria-hidden="true">→</span></button>
   <details className="onboarding-rules"><summary>How scoring works</summary><p>Weights use invested money, excluding cash. Spreading investments reduces concentration, not all risk.</p><p>Cash + estimated sale proceeds after costs + pending payments. Each eligible share pays H$0.00002 per positive Game Score point. Weekly reports arrive in Updates while the season runs. Rewinding resets accounts.</p></details>
  </div>
  <div className="season-first-pick"><div className="panel-heading"><h2>Buy shares</h2><span className="quiet-label">Build your portfolio</span></div>
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
   <span className="field-label">Allocation</span><div className="allocation-presets">{[5000,10000,20000].map(amount=><button aria-pressed={budget===amount&&manualQty===null} key={amount} onClick={()=>{setBudget(amount);setManualQty(null)}}>{amount/1000}% <small>{formatHOOP(amount,0)}</small></button>)}</div>
   <label className="quantity-line">Shares <input aria-label="First purchase quantity" type="number" min={1} max={10000} value={qty} onChange={e=>setManualQty(Math.max(1,Math.min(10000,Math.trunc(Number(e.target.value)||1))))}/></label>
   <div className="opening-total"><span>Estimated total <small>Fees included</small></span><strong>{estimate.quote?formatHOOP(estimate.quote.total):'—'}</strong></div>
   {estimate.quote&&estimate.quote.fillable_qty<qty&&<p role="status">{estimate.quote.fillable_qty} shares available.</p>}
   <button className="action-primary opening-buy" disabled={busy||working||!score||!portfolio||overLimit||!quote?.ask||!estimate.quote||estimate.quote.cash_short||estimate.quote.fillable_qty===0} onClick={()=>void buy()}>{busy?'Buying…':`Buy ${qty} shares`}<span aria-hidden="true">→</span></button>{overLimit&&<p className="fine-print">During setup, invest up to 25% of starting cash per player. Choose fewer shares or another player.</p>}{notice&&<p className="fine-print trend-up" role="status">{notice}</p>}{(error||estimate.error||clockError)&&<p role="alert">{error||estimate.error||clockError}</p>}
  </div>
 </section><div className="onboarding-footer">Historical NBA data · Simulated market · No real money</div></div>
}
