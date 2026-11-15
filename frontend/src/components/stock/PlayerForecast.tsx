import {useTourState} from '../../learning/tour/store'
import {useEffect,useState} from 'react'
import {apiFetch} from '../../api/rest'
import { subscribeTime } from '../../api'
import {formatHOOP} from '../../utils/format'
type Forecast={next_game_expected_payout:number;underlying_ability:number;recent_form:number;last_game_score:number|null;last_game_day:string|null;games_observed:number;injury_status:string;injury_reason:string;confidence:string}
export default function PlayerForecast({symbol,compact=false}:{symbol:string;compact?:boolean}){
 const [data,setData]=useState<{symbol:string;value:Forecast}|null>(null)
 const [error,setError]=useState('')
 const tour=useTourState()
  // Valuations only change at day close: load once, then again when the market day changes (not every 1.5 s).
  useEffect(() => {
    let alive = true
    let day = -1
    const load = () =>
      apiFetch<Forecast>(`/market/valuation/${symbol}`)
        .then((value) => {
          if (alive) {
            setData({ symbol, value })
            setError('')
          }
        })
        .catch(() => {
          if (alive) setError('Forecast temporarily unavailable')
        })
    void load()
    const unsubscribe = subscribeTime((t) => {
      const today = Math.floor(t / 86400)
      if (day !== -1 && today !== day) void load()
      day = today
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [symbol])
 if(error)return <p role="status">{error}</p>
 if(!data||data.symbol!==symbol)return <p>Loading performance forecast…</p>
 const v=data.value
 if(compact)return <div className="opening-forecast"><span>Expected next payment / share</span><strong>{formatHOOP(v.next_game_expected_payout,6)}</strong></div>
 return <div className="player-forecast" data-tour="stock-forecast"><div className="forecast-primary"><span>Expected next payment / share</span><strong>{formatHOOP(v.next_game_expected_payout,6)}</strong><span className="fine-print">Estimate</span></div><details open={tour.running||undefined}><summary>Performance data</summary><div className="forecast-data"><span>Ability <b>{v.underlying_ability.toFixed(2)}</b></span><span>Recent form <b>{v.recent_form.toFixed(2)}</b></span><span>{v.games_observed} games</span><span>{v.last_game_score==null?'No games revealed':`Last Game Score ${v.last_game_score.toFixed(1)}`}</span><span>{v.injury_status}</span></div></details></div>
}
