import type { Tutorial } from '../types'
import { p } from '../summary'
const STOCK='/stock/JOKIC'
export const hypeVsFundamentals: Tutorial = {
 id:'hype-vs-fundamentals',number:4,title:'Price vs expectations',minutes:2,
 summary:'Understand the analyst estimate, slow ability, recent form and market prices.',
 teaches:['Analyst estimate','Market premium','Hot streak','Performance payout'],missionNumber:4,
 recap:['Separated quoted price from estimated future payouts','Compared ability and form','Read the chart without assuming the estimate is correct'],
 steps:[
  {route:STOCK,target:'stock-value-line',title:'Price and estimate differ',body:c=>`The quoted midpoint is ${p(c.quote('JOKIC')?.quoted_price)} and the analyst estimate is ${p(c.quote('JOKIC')?.fair_value)}. Quotes reflect dealer inventory and trading as well as expectations. The estimate is not a redemption promise.`,complete:{type:'next'}},
  {route:STOCK,target:'stock-forecast',title:'Ability changes slowly',body:'Established ability updates gradually. Recent form reacts faster, so a good game can lift near-term payout expectations without multiplying a proven player’s long-term value.',complete:{type:'next'}},
  {route:STOCK,target:'stock-forecast',title:'Expected is not paid',body:'Expected next payout is a forecast. Actual payment uses the revealed game’s positive Game Score and eligible holdings. A missed game pays zero.',complete:{type:'next'}},
  {route:STOCK,target:'stock-chart',title:'Read the two lines',body:'Solid lines are recorded daily quote midpoints; the dashed line is the model estimate. Compare another player outside the tour. Only revealed dates appear. These are not intraday candles or injected news events.',complete:{type:'next'}},
  {title:'A great player can be expensive',body:'A premium does not prove hype, and a discount does not guarantee a bargain. The model can be wrong; fees, payout expectations and downside all matter.',complete:{type:'next'}},
 ]
}
