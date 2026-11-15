import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession, usePortfolio, useTrades } from '../../api'
import { Button, Card } from '../../components/ui'
import questions from '../../../../content/learning-check.json'
import { gradeAnswers } from '../grade'
import styles from './learn.module.css'

function KnowledgeCheck({userId}:{userId:string}) {
  const key=`hs-learning-check-v2:${userId}`
  const [answers,setAnswers]=useState<Record<string,number>>({})
  const [submitted,setSubmitted]=useState(false)
  const [best,setBest]=useState<number|null>(()=>{try{const raw=localStorage.getItem(key);return raw===null?null:Number(raw)}catch{return null}})
  const grade=gradeAnswers(questions,answers)
  function submit(){
    if(grade.score===null)return
    setSubmitted(true)
    const next=Math.max(best??0,grade.score);setBest(next)
    try{localStorage.setItem(key,String(next))}catch{/* Private storage may be unavailable. */}
  }
  return <Card padding="md"><h3>Check your understanding</h3>
    <p>This learning score does not change your cash or competition score. {best!==null&&`Best this account: ${best}/100.`}</p>
    {questions.map((q,i)=><fieldset key={q.id} className={styles.question} disabled={submitted}>
      <legend>{i+1}. {q.question}</legend>
      {q.options.map((option,n)=><label key={option} className={styles.answer}><input type="radio" name={q.id} value={n} checked={answers[q.id]===n} onChange={()=>setAnswers(old=>({...old,[q.id]:n}))}/>{option}</label>)}
      {submitted&&<p><strong>{answers[q.id]===q.answer?'Correct.':'Review this one.'}</strong> {q.explanation}</p>}
    </fieldset>)}
    {submitted?<div role="status"><h3>Knowledge score: {grade.score}/100</h3><Button onClick={()=>{setSubmitted(false);setAnswers({})}}>Try again</Button></div>:<Button variant="primary" disabled={!grade.complete} onClick={submit}>Check answers</Button>}
  </Card>
}

export function ChallengesSection(){
  const {session}=useSession({autoGuest:false})
  const {portfolio}=usePortfolio()
  const trades=useTrades()
  const actions=[
    {label:'Complete a purchase',done:trades.some(t=>t.side==='buy'),hint:'Use a small market order and inspect its fill.'},
    {label:'Complete a sale',done:trades.some(t=>t.side==='sell'),hint:'Sell a share and compare the proceeds with the preview. Profit is not required.'},
    {label:'Receive a performance payout',done:(portfolio?.payouts_received??0)>0,hint:'Hold across a game cutoff and advance the replay until a payment is credited.'},
  ]
  return <section className={styles.section} aria-labelledby="learn-challenges" id="challenges">
    <div className={styles.sectionHead}><h2 id="learn-challenges" className={styles.sectionTitle}>Challenges</h2><span className={styles.count}>Real actions + knowledge check</span></div>
    <p className={styles.muted}>Practice in the season, then test the rules. No scripted profit target and no separate learning server.</p>
    <Card padding="md"><h3>Hands-on progress</h3><p>Based on this account’s loaded trade history and credited payouts. Rewinding starts a fresh account.</p><ul>{actions.map(a=><li key={a.label}><strong>{a.done?'✓':'○'} {a.label}</strong> — {a.hint}</li>)}</ul><Link to="/stock/SGA">Open the trading screen →</Link></Card>
    {session&&<KnowledgeCheck key={session.user_id} userId={session.user_id}/>}
  </section>
}
