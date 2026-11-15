import type { Tutorial } from '../types'
const STOCK='/stock/WEMBY'
export const surviveTheStorm: Tutorial = {
 id:'survive-the-storm',number:5,title:'Survive the storm',minutes:2,
 summary:'Read injury information and preview a stop-loss without inventing a crash.',
 teaches:['Stop-loss','Volatility','Diversification'],missionNumber:5,
 recap:['Read currently revealed injury information','Previewed a stop trigger','Learned why a stop cannot guarantee its price'],
 steps:[
  {route:STOCK,target:'stock-forecast',title:'What is known today?',body:'The forecast shows the latest revealed status and injury reason. Historical reports arrive at synthetic day close. There is no guaranteed warning before an injury and this lesson does not inject a storm.',complete:{type:'next'}},
  {route:STOCK,target:'stock-forecast',title:'Availability versus ability',body:'An injury reduces expected near-term payments according to the model’s recovery assumptions. It does not erase the player’s underlying ability. Uncertain forecasts remain uncertain.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-tab-stop',title:'Preview a stop-loss',body:'Click Stop-loss. Previewing does not place an order, and you need owned shares to submit one.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-price',title:'A trigger, not a guaranteed price',body:'The default trigger is below the current bid. Once triggered, a stop tries to sell at available market bids. A gap can produce a worse price; insufficient liquidity can prevent a complete sale.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-account',title:'Check your exposure',body:'Only owned, unreserved shares can be protected. Cancel unwanted orders in Open orders. Diversifying reduces dependence on one player but cannot remove all risk.',complete:{type:'next'}},
  {route:STOCK,target:'ticket-tab-market',title:'Leave the preview',body:'Return to Market. No stop has been placed by this lesson.',complete:{type:'click'}},
 ]
}
