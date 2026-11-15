import { Link } from 'react-router-dom'
import { usePortfolio } from '../api'
import { useSeason } from '../api/useSeason'
import { formatHOOP, formatPct, formatPnl } from '../utils/format'
import { PlayerAvatar } from '../components/PlayerIdentity'
import '../components/season.css'

export default function HomePage(){
 const {score,clock,nextReport}=useSeason()
 const {portfolio}=usePortfolio()
 return <div className="overview-page">
  <header className="overview-heading"><h1>Overview</h1><span className="quiet-label">2024–25 <span className="separator">/</span> Virtual portfolio</span></header>
  <section className="balance-panel" aria-label="Portfolio summary">
   <div className="balance-main"><span className="metric-label">{score?.finished?'Final score':'Portfolio value'} <span title="Cash + estimated sale proceeds after costs + pending payments" className="metric-info">ⓘ</span></span><strong className="balance-number">{score?formatHOOP(score.score):'—'}</strong><span className={(score?.return_pct??0)>=0?'trend-up':'trend-down'}>{score?`${formatPnl(score.score-score.starting_cash)} (${formatPct(score.return_pct,2)})`:'—'} <span className="quiet-label">since start</span></span></div>
   <dl className="balance-stats"><div><dt>Available cash</dt><dd>{portfolio?formatHOOP(portfolio.available_cash??portfolio.cash):'—'}</dd></div><div><dt>Holdings · net sale value</dt><dd>{score?formatHOOP(score.net_sale_proceeds):'—'}</dd></div><div><dt>Payments earned</dt><dd>{score?formatHOOP(score.payouts_received):'—'}</dd></div></dl>
  </section>
  <div className="overview-grid">
   <section className="holdings-panel" aria-label="Your holdings"><div className="panel-heading"><h2>Holdings <span className="count-badge">{portfolio?.positions.length??0}</span></h2><Link className="text-action" to="/market">Add player <span aria-hidden="true">＋</span></Link></div>
    {portfolio?.positions.length?<div className="holdings-list">{portfolio.positions.map(p=><Link to={`/stock/${p.symbol}`} className="holding-item" key={p.symbol}><PlayerAvatar player={p}/><span className="holding-name"><strong>{p.name??p.symbol}</strong><small>{p.qty} shares · {p.team}</small></span><span className="holding-value"><strong>{formatHOOP(p.market_value)}</strong><small className={p.unrealised_pnl>=0?'trend-up':'trend-down'}>{formatPct(p.unrealised_pnl_pct,2)}</small></span><span className="row-arrow" aria-hidden="true">↗</span></Link>)}</div>:<div className="empty-holdings"><p>No holdings</p><Link className="action-primary" to="/market">Find a player</Link></div>}
    <div className="panel-foot"><span>Holdings shown at quoted prices</span><Link to="/portfolio">View portfolio →</Link></div>
   </section>
   <section className="season-review"><h2>{score?.finished?'Season complete':'Weekly reports'}</h2>{!score?.finished&&nextReport&&<p className="quiet-label">Next report · {new Date(nextReport*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}</p>}<Link className="result-action" to="/updates">View updates →</Link></section>
  </div>
  <footer className="overview-foot"><span>{clock?.busy?'Updating market…':'Historical NBA data · Simulated market'}</span><Link to="/learn">Learn the basics ↗</Link></footer>
 </div>
}
