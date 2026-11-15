import { Link } from 'react-router-dom'
import { useSeason, type Round } from '../api/useSeason'
import { formatHOOP, formatPnl } from '../utils/format'
import './season.css'
const date=(t:number)=>new Date(t*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})
export default function SeasonReview({report}:{report?:Round}){
 const {score}=useSeason()
 const round=report
 if(!score)return null
 const final=!report&&score.finished
 if(!final&&!round)return <section className="season-review waiting-review"><h2>No reports yet</h2><p>Reports arrive automatically while the season plays.</p></section>
 const end=final?score:round!.after, start=final?null:round!.before
 const gain=end.score-(start?.score??end.starting_cash)
 const paid=end.payouts_received-(start?.payouts_received??0)
 const pending=end.pending_payouts-(start?.pending_payouts??0)
 const rows=end.contributors.map(p=>{const prev=start?.contributors.find(x=>x.symbol===p.symbol);return {...p,change:p.contribution-(prev?.contribution??0),paid:p.payouts-(prev?.payouts??0),old:prev}}).sort((a,b)=>b.change-a.change)
 const news=rows.filter(p=>p.old&&(p.injury_status!==p.old.injury_status||Math.abs(p.analyst_estimate-p.old.analyst_estimate)>=.01))
 return <section key={end.t} className="season-review" aria-label={final?'Season results':'Weekly report'}>
  <div className="panel-heading"><h2>{final?'Season result':'Weekly report'}</h2><span className="quiet-label">{final?'2024–25':`${date(start!.t)} – ${date(end.t)}`}</span></div>
  <strong className={`round-gain ${gain>=0?'trend-up':'trend-down'}`}>{formatPnl(gain)}</strong><span className="quiet-label">{final?'Total return':'Change this week'}</span>
  <dl className="result-breakdown"><div><dt>Payments</dt><dd>{formatPnl(paid)}</dd></div><div><dt>Investment gain <small>after costs</small></dt><dd>{formatPnl(gain-paid-pending)}</dd></div>{pending!==0&&<div><dt>Pending payments</dt><dd>{formatPnl(pending)}</dd></div>}</dl>
  {Object.keys(end.unsold_shares).length>0&&<p className="liquidity-notice">Some shares have no buyer and count as H$0 sale proceeds.</p>}
  <details className="result-details"><summary>Player breakdown <span>＋</span></summary><div className="round-table"><table><thead><tr><th>Player</th><th>Payments</th><th>Return</th></tr></thead><tbody>{rows.map(p=><tr key={p.symbol}><td><Link to={`/stock/${p.symbol}`}>{p.name}</Link></td><td>{formatPnl(p.paid)}</td><td>{formatPnl(p.change)}</td></tr>)}</tbody></table></div><p className="fine-print">Includes sold holdings and costs. Fees paid: {formatHOOP(end.fees_paid-(start?.fees_paid??0))}. Payments are already included in cash.</p></details>
  {!final&&news.length>0&&<details className="result-details"><summary>Outlook changes <span>＋</span></summary>{news.map(p=><p key={p.symbol} className="outlook-item"><b>{p.name}</b><span>{formatHOOP(p.old!.analyst_estimate)} → {formatHOOP(p.analyst_estimate)}</span>{p.injury_status!==p.old!.injury_status&&<small>{p.injury_status||'No report'}</small>}</p>)}<p className="fine-print">Analyst estimates, not guaranteed prices.</p></details>}
  <Link className="result-action" to={final?'/leaderboard':'/market'}>{final?'View leaderboard':'Trade players'} <span>↗</span></Link>
 </section>
}
