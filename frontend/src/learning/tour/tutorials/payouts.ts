import type { Tutorial } from '../types'
const STOCK='/stock/JOKIC'
export const payouts: Tutorial = {
 id:'performance-payouts',number:6,title:'Earn a performance payout',minutes:3,
 summary:'Buy one Jokić share, advance game days and find an actual payment in the ledger.',
 teaches:['Performance payout','Cash','Season score'],
 recap:['Owned a share across a game cutoff','Advanced until cash was credited','Checked the payment ledger and exit score'],
 steps:[
  {route:STOCK,target:'ticket-tab-market',title:'Choose Market',body:'This exercise buys one extra Jokić share and advances the shared demo season. Use it before the season ends. It affects all accounts on this local replay.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-side-buy',title:'Choose Buy',body:'Click Buy. A payment requires ownership at the synthetic noon cutoff on a game day.',complete:{type:'click'}},
  {route:STOCK,target:'ticket-qty',title:'One extra share',body:'Enter 1 to keep the practice position small.',complete:{type:'input',value:'1'}},
  {route:STOCK,target:'ticket',title:'Buy before advancing',body:'Choose Market, Buy and quantity 1, then confirm. This tutorial does not sell the share at the end.',complete:{type:'order_filled',side:'buy',symbol:'JOKIC'},after:'The share is in your portfolio. Holding after the cutoff of a game you missed does not grant that game’s payout.'},
  {route:STOCK,target:'season-next-day',title:'Advance to a payment',body:'Click Next day and wait for replay to finish. Repeat until Payouts credited increases. Rest days and missed games pay nothing, so several days may be needed. Any new payment in your current portfolio counts.',complete:{type:'payout'},after:'The backend credited actual cash. The payout notification and ledger show the amount.'},
  {route:'/activity',target:'payout-ledger',title:'Find the payment',body:'Read the date, player, eligible shares and cash paid. Each share earns H$0.02 × max(Game Score, 0). Buying after cutoff does not earn that game; selling after cutoff keeps the recorded entitlement.',complete:{type:'next'}},
  {route:'/activity',target:'season-controls',title:'Count it once',body:'Paid dividends are already in cash. The season score adds net sale proceeds and still-pending rights; it does not add paid dividends a second time.',complete:{type:'next'}},
 ]
}
