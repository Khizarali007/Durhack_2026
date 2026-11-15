import type { Tutorial } from '../types'
export const welcome: Tutorial = {
 id:'welcome', number:1, title:'Welcome tour', minutes:2,
 summary:'Your wallet, season score, replay controls and player market.',
 teaches:['HOOP','Cash','Quoted portfolio value','Season score','Player share'],
 recap:['Located cash and quoted equity','Distinguished the exit score from quoted equity','Explored replay controls and the player screen'],
 steps:[
  {route:'/',title:'Welcome to HoopStreet',body:'Start with H$100 virtual cash. Invest in NBA performance through the 2024–25 regular season. Player shares pay game dividends; they are not ownership of the player.',complete:{type:'next'}},
  {route:'/',title:'Spread your risk',body:'Your starter portfolio holds at least three players across two teams, with no player above half of the invested value. This reduces reliance on one player; it does not guarantee a profit. You can rebalance freely after setup.',complete:{type:'next'}},
  {route:'/',target:'header-cash',title:'Your cash',body:'Buying spends cash. Sales and performance payments add cash. Open buy orders reserve part of the balance, so check Spendable before buying.',complete:{type:'next'}},
  {route:'/',target:'header-equity',title:'One season score',body:'This is your estimated exit value after selling costs, including cash and pending payment rights. Quoted equity remains available under Replay settings.',complete:{type:'next'}},
  {route:'/',target:'season-controls',title:'Your season score',body:'The competition uses cash plus estimated sale proceeds after fees and price impact, plus pending payment rights. Paid dividends are already in cash. Unsellable shares contribute zero to this estimate.',complete:{type:'next'}},
  {route:'/',target:'season-controls',title:'The replay clock',body:'Play season runs continuously. Weekly reports collect in Updates without stopping trading. Pause and speed controls let you set the pace. Forward jumps preserve holdings and settle payments; rewinding resets every account and requires Solana writes to be off.',complete:{type:'next'}},
  {route:'/',target:'nav-market',title:'Find the market',body:'Click Market to browse the player list. Search by name, ticker or team.',complete:{type:'navigate',path:'/market'}},
  {route:'/stock/JOKIC',target:'stock-price',title:'An indicative price',body:'The prominent price is the midpoint of the best bid and ask. The last actual trade can be older. The order ticket tells you what you could pay or receive now.',complete:{type:'next'}},
 ]
}
