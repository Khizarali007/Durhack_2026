import { useEffect, useRef, useState } from 'react'
import { apiFetch, errorDetail } from '../api/rest'
import { useSession, usePortfolio } from '../api'
import { formatHOOP, formatPct } from '../utils/format'
import './season.css'

type Timeline={t:number;start_t:number;end_t:number;paused:boolean;busy:boolean;rate:number;session_id:string;error:string|null}
type Score={score:number;cash:number;net_sale_proceeds:number;pending_payouts:number;payouts_received:number;return_pct:number;finished:boolean;unsold_shares:Record<string,number>}
export default function SeasonControls(){
  const [clock,setClock]=useState<Timeline|null>(null)
  const [score,setScore]=useState<Score|null>(null)
  const [error,setError]=useState('')
  const [working,setWorking]=useState(false)
  const [previewTime,setPreviewTime]=useState<number|null>(null)
  const dateInput=useRef<HTMLInputElement>(null)
  const {session}=useSession({autoGuest:false})
  const {portfolio}=usePortfolio()
  useEffect(()=>{
    let alive=true
    const load=async()=>{try{const c=await apiFetch<Timeline>('/market/timeline');if(alive)setClock(c)}catch{if(alive)setError('Market unavailable. Reconnecting…')}}
    void load();const id=setInterval(()=>void load(),1000)
    return()=>{alive=false;clearInterval(id)}
  },[])
  useEffect(()=>{
    let alive=true
    if(!session)return
    const load=async()=>{try{const s=await apiFetch<Score>('/season-score');if(alive)setScore(s)}catch{if(alive)setScore(null)}}
    void load();const id=setInterval(()=>void load(),3000)
    return()=>{alive=false;clearInterval(id)}
  },[session])
  async function change(body:object){setWorking(true);setError('');try{setClock(await apiFetch<Timeline>('/market/timeline',{method:'POST',body:JSON.stringify(body)}))}catch(e){setError(errorDetail(e))}finally{setWorking(false)}}
  if(!clock)return <div className="season-controls" role="status">{error||'Connecting to the season…'}</div>
  const finished=clock.t>=clock.end_t
  return <section className="season-controls" aria-label="Season challenge controls" data-tour="season-controls">
    <div className="season-row">
      <strong>2024–25 season · {new Date(clock.t*1000).toLocaleDateString('en-GB',{timeZone:'UTC'})}</strong>
      <button disabled={working||clock.busy||finished} onClick={()=>void change({paused:!clock.paused})}>{clock.paused?'Play':'Pause'}</button>
      <select aria-label="Replay speed" value={clock.rate} disabled={working||clock.busy} onChange={e=>void change({rate:Number(e.target.value)})}>{[1,5,20,50,200,500].map(r=><option key={r} value={r}>{r}×</option>)}</select>
      <button disabled={working||clock.busy||finished} data-tour="season-next-day" onClick={()=>void change({target_t:Math.min(clock.end_t,Math.floor(clock.t/86400)*86400+86400)})}>Next day</button>
      <button disabled={working||clock.busy||finished} onClick={()=>void change({target_t:clock.end_t})}>Finish season</button>
      <label>Jump to <input aria-label="Jump to season date" type="date" min={new Date(clock.start_t*1000).toISOString().slice(0,10)} max={new Date(clock.end_t*1000).toISOString().slice(0,10)} ref={dateInput} disabled={working||clock.busy}/></label><button disabled={working||clock.busy} onClick={()=>{const target=Date.parse((dateInput.current?.value??'')+'T00:00:00Z')/1000;if(Number.isFinite(target))void change({target_t:target});else setError('Choose a season date first')}}>Go to date</button>
      <small>Rewinding resets every account. Speed is a target, limited by processing.</small>
    </div>
    <input aria-label="Market timeline" type="range" min={clock.start_t} max={clock.end_t} step={86400} value={previewTime??clock.t} disabled={working||clock.busy} onChange={e=>setPreviewTime(Number(e.target.value))} onPointerUp={e=>{const target=Number(e.currentTarget.value);setPreviewTime(null);void change({target_t:target})}} onKeyUp={e=>{if(["ArrowLeft","ArrowRight","Home","End","PageUp","PageDown"].includes(e.key)){const target=Number(e.currentTarget.value);setPreviewTime(null);void change({target_t:target})}}}/>
    {clock.busy&&<span role="status">Replaying days and settling payouts… Trading will resume when finished.</span>}
    {(error||clock.error)&&<span role="alert">{error||clock.error}</span>}
    {session&&score&&<div className="season-row"><strong>{finished?'Final season score':'Estimated exit value'}: {formatHOOP(score.score)} ({formatPct(score.return_pct,2)})</strong><span>Cash + net sale proceeds + pending payouts. Paid dividends are already in cash.</span>{Object.keys(score.unsold_shares).length>0&&<strong>Some shares cannot currently be sold and contribute H$0 to this estimate.</strong>}</div>}
    {portfolio&&<div className="season-row"><span>Spendable: <b>{formatHOOP(portfolio.available_cash??portfolio.cash)}</b></span><span>Payouts credited: <b>{formatHOOP(portfolio.payouts_received??0)}</b></span><span>Pending entitlement estimate: {formatHOOP(portfolio.pending_payouts??0)}</span></div>}
  </section>
}
