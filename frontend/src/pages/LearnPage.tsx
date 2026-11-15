import {useState} from 'react'
import glossary from '../../../content/glossary.json'
export default function LearnPage(){
 const [query,setQuery]=useState('')
 return <div style={{padding:24,overflow:'auto',lineHeight:1.8}}><h1>Learn through the season</h1><p>Try a small first purchase, advance past a game day and check the payment in your wallet. Then compare your exit value with the quoted portfolio value: spread, fees and price impact explain the difference.</p><p>Compare an established star with a developing player. A great game changes the payout immediately; the ability estimate changes more slowly. An expensive share may already price in strong future performances.</p><label>Search terms <input value={query} onChange={e=>setQuery(e.target.value)}/></label><dl>{glossary.terms.filter(t=>(t.term+' '+t.short).toLowerCase().includes(query.toLowerCase())).map(t=><div key={t.term} style={{marginBottom:18}}><dt><strong>{t.term}</strong></dt><dd>{t.short}</dd></div>)}</dl></div>
}
