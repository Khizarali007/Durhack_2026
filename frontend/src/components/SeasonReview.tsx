import { Link } from 'react-router-dom'
import { useSeason } from '../api/useSeason'
import { formatHOOP, formatPnl, formatPct } from '../utils/format'
import './season.css'

export default function SeasonReview(){
 const {score,round,clock}=useSeason()
 if(!score)return null
 const final=score.finished
 if(!final&&!round)return <section className="season-review"><h2>Your next decision</h2><p>Build a portfolio, then play a week to see what your players earned. Keep cash for opportunities. Holding is a decision too.</p><div className="season-row"><Link to="/market">Research players →</Link><Link to="/portfolio">Review your holdings →</Link></div></section>
 const end=final?score:round!.after
 const start=final?null:round!.before
 const gain=end.score-(start?.score??end.starting_cash)
 const paid=end.payouts_received-(start?.payouts_received??0)
 const pending=end.pending_payouts-(start?.pending_payouts??0)
 const investment=gain-paid-pending
 const rows=end.contributors.map(p=>{
  const prev=start?.contributors.find(x=>x.symbol===p.symbol)
  return {...p,change:p.contribution-(prev?.contribution??0),paid:p.payouts-(prev?.payouts??0),old:prev}
 }).sort((a,b)=>b.change-a.change)
 const news=rows.filter(p=>p.old&&(p.injury_status!==p.old.injury_status||Math.abs(p.analyst_estimate-p.old.analyst_estimate)>=.01))
 return <section className="season-review" aria-label={final?'Season results':'Round results'}>
  <div className="season-row"><h2>{final?'Your season results':'Your week in review'}</h2>{!final&&<span>{new Date(start!.t*1000).toLocaleDateString('en-GB',{timeZone:'UTC'})} – {new Date(end.t*1000).toLocaleDateString('en-GB',{timeZone:'UTC'})}</span>}</div>
  <p>{final?`You finished ${gain>=0?'above':'below'} your starting budget by ${formatHOOP(Math.abs(gain))} (${formatPct(end.return_pct,2)}).`:'Here is what changed while the season played. These results stay fixed while you consider your next move.'}</p>
  <dl className="round-metrics">
   <div><dt>{final?'Final season score':'Score change'}</dt><dd>{final?formatHOOP(end.score):formatPnl(gain)}</dd></div>
   <div><dt>Performance payments</dt><dd>{formatPnl(paid)}</dd></div>
   <div><dt>Investment gain after costs</dt><dd>{formatPnl(investment)}</dd></div>
   <div><dt>Pending payout rights change</dt><dd>{formatPnl(pending)}</dd></div>
  </dl>
  <p className="season-hint">Payments + investment gain + pending rights change = score change. Paid payments are already in cash. Fees paid during this period: {formatHOOP(end.fees_paid-(start?.fees_paid??0))}, already included. Estimated selling costs are included too.</p>
  {Object.keys(end.unsold_shares).length>0&&<p role="status">Some holdings cannot currently be sold and count as zero sale proceeds in this estimate.</p>}
  {rows.length>0&&<><h3>{final?'Which choices contributed?':'Your player contributions'}</h3><div className="round-table"><table><thead><tr><th>Player</th><th>Payments</th><th>Total contribution</th></tr></thead><tbody>{rows.map(p=><tr key={p.symbol}><td><Link to={`/stock/${p.symbol}`}>{p.name}</Link></td><td>{formatPnl(p.paid)}</td><td>{formatPnl(p.change)}</td></tr>)}</tbody></table></div><p className="season-hint">Includes sold positions, trading costs, and pending rights. Contributions measure your investment outcome—not the player's raw performance.</p></>}
  {!final&&news.length>0&&<details><summary>What changed in your players’ outlook?</summary><ul>{news.map(p=><li key={p.symbol}>{p.name}: analyst estimate {formatHOOP(p.old!.analyst_estimate)} → {formatHOOP(p.analyst_estimate)}.{p.injury_status!==p.old!.injury_status&&` Report status: ${p.injury_status||'No report'}.`}</li>)}</ul><p>These are observations, not proof of what caused a market price move.</p></details>}
  <p><strong>{final?'What did you learn?':'Your next decision:'}</strong> {final?'A strong basketball player is not automatically a good investment at any price. Compare the payments you earned with the price you paid.':'Does the new outlook justify the current price? Hold, add to your position, or sell. You do not have to trade every week.'}</p>
  <div className="season-row"><Link to="/portfolio">Review portfolio →</Link><Link to={final?'/leaderboard':'/market'}>{final?'Compare season scores →':'Find your next investment →'}</Link><Link to="/learn">Understand prices and payouts →</Link></div>
  {clock?.busy&&<p>Replaying the next period…</p>}
 </section>
}
