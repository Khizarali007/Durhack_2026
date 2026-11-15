const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}
function harness(storage=new Map()){
 let user='a', tick, unsub
 let clock={t:0,start_t:0,end_t:100,paused:true,busy:false,rate:1,session_id:'s',error:null}
 let score={score:99990,starting_cash:100000,t:0,session_id:'s',contributors:[]}
 const calls=[]
 const apiFetch=async(path,opts)=>{
  if(opts){const b=JSON.parse(opts.body);calls.push(b);clock={...clock,...('paused' in b?{paused:b.paused}:{}),...('target_t' in b?{busy:true}:{})};return {...clock}}
  return {...(path==='/market/timeline'?clock:score)}
 }
 const deps={react:{useSyncExternalStore:(sub,get)=>{unsub??=sub(()=>{});return get()}},'./rest':{apiFetch,errorDetail:String},'./useSession':{getSessionSnapshot:()=>({session:{user_id:user}})},'./accountStore':{refreshAccount:async()=>{}}}
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('src/api/useSeason.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>deps[id],setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}})
 return {api:module.exports,calls,storage,read:()=>module.exports.useSeason(),poll:async()=>{await flush();tick();await flush()},finish(t,value=100050){clock={...clock,t,busy:false};score={...score,t,score:value}},user(id){user=id},reset(){clock={...clock,session_id:'new',t:0};score={...score,session_id:'new',t:0}},stop(){unsub?.()}}
}
test('weekly report freezes before/after values and pauses before requesting replay',async()=>{
 const h=harness();h.read();await flush()
 assert.equal(await h.api.changeTimeline({target_t:7},true),true)
 assert.equal(h.calls[0].paused,true)
 assert.equal(h.calls[1].target_t,7)
 assert.equal(h.read().round,null)
 h.finish(7);await h.poll()
 assert.equal(h.read().round.before.score,99990)
 assert.equal(h.read().round.after.score,100050)
 h.finish(8,100100);await h.poll()
 assert.equal(h.read().score.score,100100)
 assert.equal(h.read().round.after.score,100050)
 h.stop()
})
test('reports survive reload but never cross accounts or replay sessions',async()=>{
 const h=harness();h.read();await flush();await h.api.changeTimeline({target_t:7},true);h.finish(7);await h.poll();h.stop()
 const restored=harness(h.storage);restored.finish(7);restored.read();await flush()
 assert.equal(restored.read().round.after.score,100050)
 restored.user('b');await restored.poll();assert.equal(restored.read().round,null)
 restored.user('a');restored.reset();await restored.poll();assert.equal(restored.read().round,null)
 restored.stop()
})
test('pending week survives refresh and completes only when its target is reached',async()=>{
 const h=harness();h.read();await flush();await h.api.changeTimeline({target_t:7},true);h.stop()
 const restored=harness(h.storage);restored.finish(3);restored.read();await flush()
 assert.equal(restored.read().round,null)
 restored.finish(7);await restored.poll();assert.equal(restored.read().round.after.t,7)
 restored.stop()
})
