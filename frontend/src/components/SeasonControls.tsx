import { useTourState } from '../learning/tour/store'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '../api'
import { useSeason, changeTimeline } from '../api/useSeason'
import { formatHOOP, formatPct } from '../utils/format'
import './season.css'

export default function SeasonControls(){
 const {clock,score,error,working,round,rewinding}=useSeason()
 const {portfolio}=usePortfolio()
 const navigate=useNavigate()
 const tour=useTourState()
 const [previewTime,setPreviewTime]=useState<number|null>(null)
 const dateInput=useRef<HTMLInputElement>(null)
 const [dateError,setDateError]=useState('')
 if(!clock)return <div className="season-controls" role="status">{error||'Connecting to the season…'}</div>
 const finished=clock.t>=clock.end_t
 const disabled=working||clock.busy
 async function roundTo(target:number){if(await changeTimeline({target_t:target},true))navigate('/')}
 return <section className="season-controls" aria-label="Season challenge controls" data-tour="season-controls">
  <div className="season-row season-main">
   <div><strong>{finished?'Season complete':'2024–25 season challenge'}</strong><div>{new Date(clock.t*1000).toLocaleDateString('en-GB',{timeZone:'UTC'})} · Grow your starting budget by season end</div></div>
   {score&&<div className="season-score"><span>{clock.busy?'Score before replay':score.finished?'Final season score':'Season score · estimated exit value'}</span><strong>{formatHOOP(score.score)} <small>({formatPct(score.return_pct,2)})</small></strong></div>}
   <button className="season-primary" disabled={disabled||finished} onClick={()=>void roundTo(Math.min(clock.end_t,Math.floor(clock.t/86400)*86400+7*86400))}>{clock.busy?'Playing…':'Play next week →'}</button>
   {(round||finished)&&<button onClick={()=>navigate('/')}>View results</button>}
  </div>
  {portfolio&&<div className="season-row"><span>Spendable: <b>{formatHOOP(portfolio.available_cash??portfolio.cash)}</b></span><span>Payouts credited: <b>{formatHOOP(portfolio.payouts_received??0)}</b></span></div>}
  {clock.busy&&<span role="status">{rewinding?'Starting a fresh replay and resetting all accounts…':'Replaying games and settling payments… Your holdings are preserved. Trading resumes when finished.'}</span>}
  {(error||clock.error||dateError)&&<span role="alert">{error||clock.error||dateError}</span>}
  <details className="season-details" open={tour.running||undefined}><summary>Replay controls & scoring details</summary>
   <p>Score = cash + estimated sale proceeds after fees and price impact + pending payout rights. Paid payments are already in cash. This estimates an exit; it does not sell your shares.</p>
   {!!score&&Object.keys(score.unsold_shares).length>0&&<p>Some shares cannot currently be sold and contribute H$0 sale proceeds.</p>}
   <div className="season-row">
    <button disabled={disabled||finished} onClick={()=>void changeTimeline({paused:!clock.paused})}>{clock.paused?'Play':'Pause'}</button>
    <select aria-label="Replay speed" value={clock.rate} disabled={disabled} onChange={e=>void changeTimeline({rate:Number(e.target.value)})}>{[1,5,20,50,200,500].map(r=><option key={r} value={r}>{r}×</option>)}</select>
    <button disabled={disabled||finished} data-tour="season-next-day" onClick={()=>void changeTimeline({target_t:Math.min(clock.end_t,Math.floor(clock.t/86400)*86400+86400)})}>Next day</button>
    <button disabled={disabled||finished} onClick={()=>void roundTo(clock.end_t)}>Finish season</button>
    <label>Jump to <input aria-label="Jump to season date" type="date" min={new Date(clock.start_t*1000).toISOString().slice(0,10)} max={new Date(clock.end_t*1000).toISOString().slice(0,10)} ref={dateInput} disabled={disabled}/></label>
    <button disabled={disabled} onClick={()=>{const t=Date.parse((dateInput.current?.value??'')+'T00:00:00Z')/1000;if(Number.isFinite(t)){setDateError('');void changeTimeline({target_t:t})}else setDateError('Choose a season date first')}}>Go to date</button>
   </div>
   <input aria-label="Market timeline" type="range" min={clock.start_t} max={clock.end_t} step={86400} value={previewTime??clock.t} disabled={disabled} onChange={e=>setPreviewTime(Number(e.target.value))} onPointerUp={e=>{setPreviewTime(null);void changeTimeline({target_t:Number(e.currentTarget.value)})}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)){setPreviewTime(null);void changeTimeline({target_t:Number(e.currentTarget.value)})}}}/>
   <small>Rewinding resets all accounts and is blocked while Solana writes are enabled. Forward replay preserves receipt processing; chain confirmation can arrive later. Speed depends on processing.</small>
   {score&&<p>Quoted equity: {formatHOOP(score.quoted_equity)} · Pending rights: {formatHOOP(score.pending_payouts)}. Quoted equity is not the competition score.</p>}
  </details>
 </section>
}
