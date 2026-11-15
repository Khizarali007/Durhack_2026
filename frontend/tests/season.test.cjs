const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}
function harness(){
 let user='a',tick,unsub
 let clock={t:0,start_t:0,end_t:2000000,paused:true,busy:false,rate:1,session_id:'s',error:null}
 let score={score:100000,starting_cash:100000,t:0,session_id:'s',contributors:[]}
 const archive=new Map(),calls=[]
 const apiFetch=async(path,opts)=>{
  if(opts){const b=JSON.parse(opts.body);calls.push(b);clock={...clock,...b};return {...clock}}
  if(path==='/season-updates')return {session_id:clock.session_id,reports:archive.get(`${clock.session_id}:${user}`)??[],next_t:604800}
  return {...(path==='/market/timeline'?clock:score)}
 }
 const deps={react:{useSyncExternalStore:(sub,get)=>{unsub??=sub(()=>{});return get()}},'./rest':{apiFetch,errorDetail:String},'./useSession':{getSessionSnapshot:()=>({session:{user_id:user}})}}
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('src/api/useSeason.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>deps[id],setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{}})
 return {api:module.exports,calls,read:()=>module.exports.useSeason(),poll:async()=>{await flush();tick();await flush()},advance(t,value=100050){clock={...clock,t};score={...score,t,score:value}},publish(reports){archive.set(`${clock.session_id}:${user}`,reports)},user(id){user=id},reset(){clock={...clock,session_id:'new',t:0};score={...score,session_id:'new',t:0}},stop(){unsub?.()}}
}
test('continuous play sends no seek or automatic pause when a weekly report arrives',async()=>{
 const h=harness();h.read();await flush()
 assert.equal(await h.api.changeTimeline({paused:false}),true)
 h.publish([{before:{t:0,score:100000},after:{t:604800,score:100050}}]);h.advance(604800);await h.poll()
 assert.equal(h.read().reports.length,1)
 assert.equal(h.read().clock.paused,false)
 assert.equal(h.calls.length,1)
 assert.equal(h.calls[0].paused,false)
 h.advance(700000,100200);await h.poll()
 assert.equal(h.read().reports[0].after.score,100050)
 assert.equal(h.read().score.score,100200)
 h.stop()
})
test('server report history loads without browser storage and stays isolated by account/session',async()=>{
 const h=harness();h.publish([{before:{t:0},after:{t:604800}},{before:{t:604800},after:{t:1209600}}]);h.read();await flush()
 assert.equal(h.read().reports.length,2)
 h.user('b');await h.poll();assert.equal(h.read().reports.length,0)
 h.user('a');await h.poll();assert.equal(h.read().reports.length,2)
 h.reset();await h.poll();assert.equal(h.read().reports.length,0)
 h.stop()
})
const moduleUnderTest={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/starterPortfolio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleUnderTest,exports:moduleUnderTest.exports})
const progress=moduleUnderTest.exports.starterProgress
const portfolio=(entries,cash=70000)=>({starting_cash:100000,cash,positions:entries.map(([symbol,team,value,cost=value])=>({symbol,team,qty:100,avg_cost:cost/100,market_value:value}))})
test('tutorial requires meaningful diversified holdings, not three dust purchases',()=>{
 assert.equal(progress(null).ready,false)
 assert.equal(progress(portfolio([['A','ATL',10000]])).ready,false)
 assert.equal(progress(portfolio([['A','ATL',10000],['B','ATL',10000],['C','ATL',10000]])).ready,false)
 assert.equal(progress(portfolio([['A','ATL',20000],['B','BOS',100],['C','DEN',100]])).ready,false)
 assert.equal(progress(portfolio([['A','ATL',20000],['B','BOS',5000],['C','DEN',5000]])).ready,false)
 assert.equal(progress(portfolio([['A','ATL',10000],['B','BOS',10000],['C','DEN',10000]])).ready,true)
 assert.equal(progress(portfolio([['A','ATL',9800],['B','BOS',4900],['C','DEN',4900]])).ready,true)
})
