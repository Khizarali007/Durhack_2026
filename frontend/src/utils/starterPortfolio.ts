import type { PortfolioOut } from '../api/types'

/** Meaningful starter allocations; cash is not part of concentration weights. */
export function starterProgress(portfolio:PortfolioOut|null){
 const positions=portfolio?.positions.filter(p=>p.qty>0)??[]
 const invested=positions.reduce((sum,p)=>sum+p.market_value,0)
 const minimum=(portfolio?.starting_cash??100000)*.05
 // A small tolerance lets a 5% purchase count despite whole-share rounding.
 const qualifying=positions.filter(p=>p.qty*p.avg_cost>=minimum*.98)
 const playerCount=qualifying.length
 const teamCount=new Set(qualifying.map(p=>p.team).filter(Boolean)).size
 const largestWeight=invested>0?Math.max(...positions.map(p=>p.market_value))/invested:0
 const balanced=invested>0&&largestWeight<=.5001
 return {playerCount,teamCount,largestWeight,balanced,ready:playerCount>=3&&teamCount>=2&&balanced}
}
