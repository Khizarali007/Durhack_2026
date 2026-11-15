import {useEffect,useRef,useState} from 'react'
import {usePortfolio} from '../api'
import {formatHOOP} from '../utils/format'
export default function PaymentNotice(){
 const {portfolio}=usePortfolio()
 const previous=useRef<{user:string;paid:number}|null>(null)
 const [notice,setNotice]=useState<{user:string;text:string}|null>(null)
 const user=portfolio?.user_id, paid=portfolio?.payouts_received
 useEffect(()=>{
  if(user==null||paid==null)return
  const old=previous.current
  if(old?.user===user&&paid>old.paid)setNotice({user,text:`Performance payment received: +${formatHOOP(paid-old.paid)} credited to your cash. See Activity for each payment.`})
  previous.current={user,paid}
 },[user,paid])
 if(!notice||notice.user!==user)return null
 return <div role="status" style={{padding:'10px 20px',background:'#145c46',color:'white',display:'flex',justifyContent:'space-between',gap:16}}><strong>{notice.text}</strong><button aria-label="Dismiss payment notice" onClick={()=>setNotice(null)}>×</button></div>
}
