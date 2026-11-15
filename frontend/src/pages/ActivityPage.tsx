import {useTrades} from '../api'
import TradesTable from '../components/orders/TradesTable'
import PayoutLedger from '../components/PayoutLedger'
export default function ActivityPage(){const trades=useTrades();return <div style={{padding:24,overflow:'auto'}}><h1>Payments and trades</h1><PayoutLedger/><h2>Recent fills</h2><TradesTable trades={trades} showSymbol empty="Your trades will appear here."/></div>}
