import type { Tutorial } from '../types'
import { p } from '../summary'
const STOCK='/stock/SGA'
export const firstTrade: Tutorial = {
 id:'first-trade',number:2,title:'Your first trade',minutes:3,
 summary:'Buy and sell one SGA share, then inspect the real costs. A profit is not required.',
 teaches:['Ask','Bid','Market order','Fee','Realised profit'],missionNumber:1,
 recap:['Submitted a small purchase and sale','Checked actual fills and fees','Compared the wallet with the season exit score'],
 steps:[
  {route:STOCK,target:'ticket',title:'Use one virtual share',body:'This exercise uses your current account and real simulated-market orders. It does not reset the season or force prices upward. Keep the quantity at one to limit the cost of practice.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-tab-market',title:'Select a market order',body:'Click Market. It trades against available maker quotes. A large order may only fill partly.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-side-buy',title:'Select Buy',body:'Click Buy to choose the purchase side.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-qty',title:'One share',body:'Enter 1. This is an additional purchase even if you already own SGA.',complete:{type:'input',value:'1'}},
  {route:STOCK,target:'ticket-quote',title:'Read the quote',body:c=>`Buy at the ask, currently ${p(c.quote('SGA')?.ask)}. Sell at the bid, currently ${p(c.quote('SGA')?.bid)}. The spread and fees usually make an immediate round trip lose a little money.`,complete:{type:'next'}},
  {route:STOCK,target:'ticket',title:'Buy one SGA',body:'Choose Market, Buy and quantity 1, then confirm. Only a successful fill completes this step; clicking a rejected order does not.',complete:{type:'order_filled',side:'buy',symbol:'SGA'},after:c=>c.trade?`Bought ${c.trade.qty} at ${p(c.trade.price)}, with ${p(c.trade.fee)} in fees. Your cash and holdings have changed.`:'Purchase filled.'},
  {route:STOCK,target:'ticket-result',title:'Inspect the receipt',body:'Compare the preview with the actual fill and fee. Blockchain receipt status is separate: this demo may show disabled, and you should not assume every trade is confirmed on Solana.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-side-sell',title:'Select Sell',body:'Click Sell. We will sell one share, leaving any earlier SGA holdings alone.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-qty',title:'Sell one share',body:'Keep the quantity at 1. The preview now shows net sale proceeds.',complete:{type:'input',value:'1'}},
  {route:STOCK,target:'ticket',title:'Confirm the sale',body:'Choose Market, Sell and quantity 1, then confirm at available bids. A small loss from costs is an expected learning outcome, not a failed lesson.',complete:{type:'order_filled',side:'sell',symbol:'SGA'},after:c=>c.trade?`Sold ${c.trade.qty} at ${p(c.trade.price)}, with ${p(c.trade.fee)} in fees.`:'Sale filled.'},
  {route:STOCK,target:'season-controls',title:'Read the result',body:'Cash now includes the sale proceeds. Your challenge score values remaining holdings at estimated net sale proceeds. Performance payouts are another source of return; the next lessons explain them.',complete:{type:'next'}},
 ]
}
