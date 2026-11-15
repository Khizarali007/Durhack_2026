import { useEffect, useState } from 'react'
import { apiFetch } from '../api/rest'
import { usePlayers, usePortfolio } from '../api'
import { formatHOOP } from '../utils/format'
import './season.css'
type Payout={symbol:string;qty_held:number;amount:number;t:number;game_score:number}
export default function PayoutLedger(){
  const [rows,setRows]=useState<Payout[]>([])
  const [error,setError]=useState('')
  const {bySymbol}=usePlayers()
  const {portfolio}=usePortfolio()
  const paid=portfolio?.payouts_received
  useEffect(()=>{let alive=true;apiFetch<Payout[]>('/payouts?limit=1000').then(x=>{if(alive){setRows(x);setError('')}}).catch(()=>{if(alive)setError('Payout history temporarily unavailable')});return()=>{alive=false}},[paid])
  return <section className="season-payouts" data-tour="payout-ledger"><h2>Performance payments</h2><p>Cash credited for shares held at the noon cutoff. Payments settle at day close.</p>{error?<p role="status">{error}</p>:rows.length===0?<p>No payments yet. Hold shares across a game’s ownership cutoff to qualify.</p>:<table><thead><tr><th>Date</th><th>Player</th><th>Shares held</th><th>Cash paid</th></tr></thead><tbody>{rows.map((p,i)=><tr key={`${p.t}-${p.symbol}-${i}`}><td>{new Date(p.t*1000).toLocaleDateString('en-GB',{timeZone:'UTC'})}</td><td>{bySymbol.get(p.symbol)?.name??p.symbol}</td><td>{p.qty_held}</td><td>+{formatHOOP(p.amount)}</td></tr>)}</tbody></table>}</section>
}
