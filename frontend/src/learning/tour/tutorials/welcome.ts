import type { Tutorial } from '../types'
export const welcome: Tutorial = {
 id:'welcome', number:1, title:'Welcome tour', minutes:2,
 summary:'Your wallet, season score, replay controls and player market.',
 teaches:['Virtual dollars','Cash','Quoted portfolio value','Season score','Player share'],
 recap:['Located cash and quoted equity','Distinguished the exit score from quoted equity','Explored replay controls and the player screen'],
 steps:[
  {route:'/',title:'Welcome to HoopStreet',body:'Start with H$100,000 virtual cash. Invest in NBA performance through the 2024–25 regular season. Player shares pay game dividends; they are not ownership of the player.',complete:{type:'next'}},
  {route:'/',target:'header-cash',title:'Your cash',body:'Buying spends cash. Sales and performance payments add cash. Open buy orders reserve part of the balance, so check Spendable before buying.',complete:{type:'next'}},
  {route:'/',target:'header-equity',title:'Quoted equity',body:'Equity includes holdings at the bid/ask midpoint and pending payout estimates. You cannot necessarily sell for this amount.',complete:{type:'next'}},
  {route:'/',target:'season-controls',title:'Your season score',body:'The competition uses cash plus estimated sale proceeds after fees and price impact, plus pending payment rights. Paid dividends are already in cash. Unsellable shares contribute zero to this estimate.',complete:{type:'next'}},
  {route:'/',target:'season-controls',title:'The replay clock',body:'Play runs the recorded season; Next day reveals the next day of results. Speed controls change replay speed. Forward jumps preserve holdings and settle payments; rewinding resets every account.',complete:{type:'next'}},
  {route:'/',target:'nav-market',title:'Find the market',body:'Click Market to browse the player list. Search by name, ticker or team.',complete:{type:'navigate',path:'/market'}},
  {route:'/stock/JOKIC',target:'stock-price',title:'An indicative price',body:'The prominent price is the midpoint of the best bid and ask. The last actual trade can be older. The order ticket tells you what you could pay or receive now.',complete:{type:'next'}},
 ]
}
