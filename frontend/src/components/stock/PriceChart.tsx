import { useEffect, useRef, useState } from 'react'
import { createChart, LineSeries, ColorType, LineStyle } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import { usePlayers } from '../../api'
import type { MarketEvent } from '../../api'
import { apiFetch } from '../../api/rest'
import { readChartColors } from '../../utils/chartTheme'
import { useThemeContext } from '../../context/useThemeContext'
import { toDisplayCurrency, DISPLAY_PRICE_DECIMALS, DISPLAY_PRICE_TICK } from '../../utils/currency'
import styles from './PriceChart.module.css'

type Point = {t:number;mid:number|null;fair:number}
const COLORS = ['#45d6a5','#6ba4ff','#ffc770','#d49bff']
export default function PriceChart({symbol}: {symbol:string;events?:MarketEvent[]}) {
  const ref = useRef<HTMLDivElement>(null)
  const fit = useRef<(() => void) | null>(null)
  const {players} = usePlayers()
  const {theme,projector} = useThemeContext()
  const [compare,setCompare] = useState<string[]>([])
  const [error,setError] = useState('')
  const selection = [symbol,...compare.filter(s=>s!==symbol)].slice(0,4).join(',')
  useEffect(()=>{
    const el=ref.current
    if (!el) return
    const c=readChartColors()
    const chart=createChart(el,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'transparent'},textColor:c.text},grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},timeScale:{timeVisible:false}})
    fit.current = () => chart.timeScale().fitContent()
    const symbols=selection.split(',')
    const series=symbols.map((s,i)=>chart.addSeries(LineSeries,{color:COLORS[i],lineWidth:2,title:s,priceLineVisible:false,priceFormat:{type:'price',precision:DISPLAY_PRICE_DECIMALS,minMove:DISPLAY_PRICE_TICK}}))
    const fair=chart.addSeries(LineSeries,{color:'#97a7bb',lineStyle:LineStyle.Dashed,lineWidth:1,title:'Analyst estimate',priceLineVisible:false,priceFormat:{type:'price',precision:DISPLAY_PRICE_DECIMALS,minMove:DISPLAY_PRICE_TICK}})
    let alive=true, first=true, loading=false, session=''
    async function load(){
      if(loading)return
      loading=true
      try{
        const data=await apiFetch<{session_id:string;history:Record<string,Point[]>}>(`/market/history?symbols=${selection}`)
        if(!alive)return
        if(data.session_id!==session){first=true;session=data.session_id}
        symbols.forEach((s,i)=>series[i].setData(data.history[s].map(p=>p.mid==null?{time:p.t as UTCTimestamp}:{time:p.t as UTCTimestamp,value:toDisplayCurrency(p.mid)})))
        fair.setData(data.history[symbol].map(p=>({time:p.t as UTCTimestamp,value:toDisplayCurrency(p.fair)})))
        if(first){chart.timeScale().fitContent();first=false}
        setError('')
      }catch{if(alive)setError('History unavailable. Reconnecting…')}
      finally{loading=false}
    }
    void load()
    const timer=setInterval(()=>void load(),1000)
    return()=>{alive=false;clearInterval(timer);fit.current=null;chart.remove()}
  },[selection,symbol,theme,projector])
  return <section className={styles.panel} aria-label={`${symbol} price chart`} data-tour="stock-chart">
    <div className={styles.toolbar}>
      <span>Price · H$ · 1D</span>
      <button onClick={()=>fit.current?.()}>Fit history</button>
      <select aria-label="Compare another player" value="" onChange={e=>{if(e.target.value)setCompare(old=>[...old.filter(x=>x!==e.target.value),e.target.value].slice(-3))}}>
        <option value="">Compare player…</option>
        {players.filter(p=>p.symbol!==symbol&&!compare.includes(p.symbol)).map(p=><option key={p.symbol} value={p.symbol}>{p.name}</option>)}
      </select>
      {compare.map(s=><button key={s} onClick={()=>setCompare(old=>old.filter(x=>x!==s))}>{players.find(p=>p.symbol===s)?.name??s} ×</button>)}
    </div>
    {error&&<p role="status">{error}</p>}
    <div ref={ref} style={{height:320,width:'100%'}}/>
    <small title="Indicative bid/ask midpoint. Gaps indicate no two-sided quote. Scroll to zoom; drag to pan.">Midpoint price · Dashed line: analyst estimate</small>
    <a className={styles.credit} href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">Charts: TradingView Lightweight Charts™</a>
  </section>
}
