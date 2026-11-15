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
  if(old?.user===user&&paid>old.paid)setNotice({user,text:`+${formatHOOP(paid-old.paid)} payment received`})
  previous.current={user,paid}
 },[user,paid])
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(null),6000);return()=>clearTimeout(id)},[notice])
 if(!notice||notice.user!==user)return null
 return <div role="status" className="payment-notice"><span className="payment-check" aria-hidden="true">✓</span><strong>{notice.text}</strong><button aria-label="Dismiss payment notice" onClick={()=>setNotice(null)}>×</button></div>
}
