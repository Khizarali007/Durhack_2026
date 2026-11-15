import PlayerForecast from './stock/PlayerForecast'
import { useState } from 'react'
import { usePlayers, useQuote, placeOrder, errorDetail, useOrderQuote } from '../api'
import { formatHOOP } from '../utils/format'
import './season.css'
export default function Onboarding({done}:{done:()=>void}){
 const {players}=usePlayers()
 const [symbol,setSymbol]=useState('JOKIC')
 const [budget,setBudget]=useState(10000)
 const [manualQty,setManualQty]=useState<number|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const quote=useQuote(symbol)
 const qty=manualQty??Math.max(1,Math.min(10000,Math.floor(budget/((quote?.ask||1)*1.001))))
 const estimate=useOrderQuote(symbol,'buy',qty)
 async function buy(){setBusy(true);setError('');try{const result=await placeOrder({symbol,side:'buy',qty});if(result.filled_qty>0)done();else setError('No shares filled. Try another player or a smaller order.')}catch(e){setError(errorDetail(e))}finally{setBusy(false)}}
 return <section className="season-onboarding">
  <div className="season-intro">
  <h1>Spot tomorrow’s stars.</h1><p>Start with <strong>H$100,000 virtual cash</strong>. Your challenge: grow it over the <strong>2024–25 NBA season</strong> through performance payments and investments that gain value.</p>
  <ol className="season-steps"><li>Research a player and buy shares.</li><li>Play a week to reveal results and collect payments.</li><li>Review what changed. Hold, buy or sell.</li></ol>
  <p>Your final score is cash plus what your remaining shares could sell for after costs, plus any pending payout rights. You do not have to sell everything to finish.</p>
  <p><small>Historical replay · simulated market · virtual money. Rewinding or restarting resets demo accounts.</small></p></div><div className="season-first-pick">
  <h2>Who will you back first?</h2>
  <p>Compare price and expected payments. The analyst estimate can be wrong.</p>
  <div className="season-row player-presets">{[['Nikola Jokic','Established star'],['Victor Wembanyama','Early-career upside'],['Dyson Daniels','Less established']].map(([name,label])=>{const player=players.find(p=>p.name===name);return player&&<button key={name} type="button" onClick={()=>{setSymbol(player.symbol);setManualQty(null)}}>{name} · {label}</button>})}</div>
  <select aria-label="First player" value={symbol} onChange={e=>{setSymbol(e.target.value);setManualQty(null)}}>{players.map(p=><option key={p.symbol} value={p.symbol}>{p.name} · {p.team}</option>)}</select>
  <p>Buy price per share: <strong>{quote?.ask?formatHOOP(quote.ask):'Loading…'}</strong> · Analyst estimate: <strong>{quote?formatHOOP(quote.fair_value):'Loading…'}</strong></p>
  <PlayerForecast symbol={symbol} compact/>
  <div className="season-row" aria-label="First investment budget">{[5000,10000,25000].map(amount=><button type="button" aria-pressed={budget===amount&&manualQty===null} key={amount} onClick={()=>{setBudget(amount);setManualQty(null)}}>About {formatHOOP(amount,0)} · {amount/1000}%</button>)}</div>
  <p>Choose your allocation. Keep the rest as cash or add other players later.</p>
  <label>Shares <input aria-label="First purchase quantity" type="number" min={1} max={10000} value={qty} onChange={e=>setManualQty(Math.max(1,Math.min(10000,Math.trunc(Number(e.target.value)||1))))}/></label>
  <p>Estimated cash payment: <strong>{estimate.quote?formatHOOP(estimate.quote.total):'Loading…'}</strong> including fees and available liquidity. {estimate.quote&&estimate.quote.fillable_qty<qty&&`Only ${estimate.quote.fillable_qty} shares currently available.`}</p>
  <button disabled={busy||!quote?.ask||!estimate.quote||estimate.quote.cash_short||estimate.quote.fillable_qty===0} onClick={()=>void buy()}>{busy?'Buying…':'Buy shares and enter the season'}</button>{(error||estimate.error)&&<p role="alert">{error||estimate.error}</p>}
  <details><summary>How do payments work?</summary><p>A share earns H$0.02 per positive Game Score point when held at the game day’s synthetic noon cutoff. Payments arrive at day close. A rest day pays nothing, and a good game does not guarantee a price rise.</p></details>
  </div>
 </section>
}
