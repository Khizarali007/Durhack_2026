import { useLeaderboard } from '../api'
import { formatHOOP, formatPct } from '../utils/format'
export default function LeaderboardPage(){
 const {rows,loading}=useLeaderboard()
 return <div style={{padding:24,overflow:'auto'}}><h1>Season leaderboard</h1><p>Ranked by estimated liquidation value after fees. All accounts share this local replay session; rewinding resets everyone.</p>{loading?<p>Loading…</p>:rows.length===0?<p>Make a trade to join the leaderboard.</p>:<table><thead><tr><th>Rank</th><th>Player</th><th>Exit value</th><th>Return</th></tr></thead><tbody>{rows.map(r=><tr key={r.rank}><td>{r.rank}</td><td>{r.username}{r.is_me?' (you)':''}</td><td>{formatHOOP(r.equity)}</td><td>{formatPct(r.return_pct)}</td></tr>)}</tbody></table>}</div>
}
