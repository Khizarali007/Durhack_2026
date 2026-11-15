import type { Tutorial } from '../types'
import { p } from '../summary'
const STOCK='/stock/SGA'
export const readTheSpread: Tutorial = {
 id:'read-the-spread',number:3,title:'Read the spread',minutes:3,
 summary:'Compare bids, asks, maker liquidity and estimated costs without placing an order.',
 teaches:['Bid','Ask','Spread','Market maker','Slippage','Fee','Limit order'],missionNumber:2,
 recap:['Compared bid and ask','Inspected maker inventory and a larger-order preview','Read the limit-price rule'],
 steps:[
  {route:STOCK,target:'ticket-tab-market',title:'Select Market',body:'Click Market to inspect an immediate-order preview. This lesson does not ask you to submit it.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-side-buy',title:'Preview a purchase',body:'Select Buy so we can compare its costs.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-best',title:'Two prices',body:c=>`The bid is ${p(c.quote('SGA')?.bid)}; the ask is ${p(c.quote('SGA')?.ask)}. Their difference is the spread. Neither is the model estimate.`,complete:{type:'next'}},
  {route:STOCK,target:'ticket-makers',title:'Finite liquidity',body:'Three dealers hold finite cash and shares. Their quotes respond to information and inventory. An order can move the quotes as it fills.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-qty',title:'Preview 100 shares',body:'Enter 100. No money moves until you confirm; we will not confirm this order.',complete:{type:'input',value:'100'}},
  {route:STOCK,target:'ticket-breakdown',title:'Cost breakdown',body:'Open Cost breakdown to inspect spread, slippage and fees.',complete:{type:'click'},after:'Spread and slippage are inside the execution price. Fees are charged separately, with cent rounding per fill.'},
  {route:STOCK,target:'ticket-tab-limit',title:'Limit the price',body:'Select Limit. A buy limit caps the price per share; it does not guarantee a fill, and fees are additional.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-price',title:'A price condition',body:'A buy can fill at your limit or lower; a sell at your limit or higher. Fills can be partial. A limit buy reserves cash until it fills or is cancelled. We are only previewing.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-tab-market',title:'Return to Market',body:'Return the ticket to Market before finishing.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-qty',title:'Reset the quantity',body:'Set the quantity back to 1 so the large preview is not left ready to submit.',complete:{type:'input',value:'1'}},
 ]
}
