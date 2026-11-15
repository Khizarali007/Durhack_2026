import {useEffect,useState} from 'react'
import {apiFetch} from '../../api/rest'
import {formatHOOP} from '../../utils/format'
type Forecast={next_game_expected_payout:number;underlying_ability:number;recent_form:number;last_game_score:number|null;last_game_day:string|null;games_observed:number;injury_status:string;injury_reason:string;confidence:string}
export default function PlayerForecast({symbol,compact=false}:{symbol:string;compact?:boolean}){
 const [data,setData]=useState<{symbol:string;value:Forecast}|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{let alive=true;const load=()=>apiFetch<Forecast>(`/market/valuation/${symbol}`).then(value=>{if(alive){setData({symbol,value});setError('')}}).catch(()=>{if(alive)setError('Forecast temporarily unavailable')});void load();const id=setInterval(()=>void load(),1500);return()=>{alive=false;clearInterval(id)}},[symbol])
 if(error)return <p role="status">{error}</p>
 if(!data||data.symbol!==symbol)return <p>Loading performance forecast…</p>
 const v=data.value
 if(compact)return <p>Expected next game payment: <strong>{formatHOOP(v.next_game_expected_payout,3)} / share</strong><br/><small>{v.confidence} · {v.games_observed} season games revealed. A forecast, not a guaranteed payment.</small></p>
 return <div data-tour="stock-forecast" style={{padding:'12px 20px',fontSize:13,lineHeight:1.8}}><div style={{display:'flex',gap:24,flexWrap:'wrap'}}><span>Expected next payout / share <b>{formatHOOP(v.next_game_expected_payout,3)}</b></span><span>Underlying ability <b>{v.underlying_ability.toFixed(2)}</b></span><span>Recent form <b>{v.recent_form.toFixed(2)}</b></span></div><div>{v.confidence} · {v.games_observed} games revealed · {v.last_game_score==null?'No season games revealed yet':`Latest Game Score ${v.last_game_score.toFixed(1)} on ${v.last_game_day}`}</div><div>{v.injury_status}{v.injury_reason?` — ${v.injury_reason}`:''}</div><small>Ability changes slowly; recent form affects near-term payouts more. This is a model estimate, not a guaranteed payment.</small></div>
}
