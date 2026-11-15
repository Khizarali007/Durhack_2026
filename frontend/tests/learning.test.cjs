const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
function load(path,stubs={},globals={}) {
 const source=fs.readFileSync(path,'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 vm.runInNewContext(js,{exports:module.exports,module,require:id=>{if(id in stubs)return stubs[id];throw Error(`Unexpected dependency ${id}`)},...globals},{filename:path})
 return module.exports
}
const questions=JSON.parse(fs.readFileSync('../content/learning-check.json','utf8'))
const {gradeAnswers}=load('src/learning/grade.ts')
test('cannot grade missing, invalid or fractional answers',()=>{
 for(const answers of [{},{execution:-1},{execution:1.5},{execution:100}]) assert.equal(gradeAnswers(questions,answers).score,null)
 assert.equal(gradeAnswers([],{}).complete,false)
})
test('graded answers award 100 for correct and zero for wrong; no changes to inputs',()=>{
 const answers=Object.fromEntries(questions.map(q=>[q.id,q.answer]))
 const before=JSON.stringify(answers)
 assert.equal(gradeAnswers(questions,answers).score,100)
 assert.equal(JSON.stringify(answers),before)
 assert.equal(gradeAnswers(questions,Object.fromEntries(questions.map(q=>[q.id,(q.answer+1)%q.options.length]))).score,0)
})
function store(){
 const entries=new Map()
 const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)}
 return load('src/learning/tour/store.ts',{
  react:{useSyncExternalStore:()=>{}},
  '../../api/config':{getStoredUserId:()=> 'account-a'},
  '../../api/accountStore':{learningPortfolio:()=>({payouts_received:3})},
 },{localStorage:storage})
}
function order(id='fill-1',qty=1){return {symbol:'SGA',side:'buy',filled_qty:qty,fills:qty?[{trade_id:id,qty,price:100,fee:.1}]:[]}}
test('only successful new fills during an active run count, and duplicates do not',()=>{
 const s=store();s.recordOrder(order());s.tour.start('first-trade')
 assert.equal(s.getTourState().runs['first-trade'].trades.length,0)
 s.recordOrder(order());s.recordOrder(order());s.recordOrder(order('empty',0))
 assert.equal(s.getTourState().runs['first-trade'].trades.length,1)
 assert.equal(s.getTourState().runs['first-trade'].payoutBaseline,3)
 s.tour.exit();s.recordOrder(order('outside'))
 assert.equal(s.getTourState().runs['first-trade'].trades.length,1)
})
test('account switch and rewind cannot reuse another account tutorial progress',()=>{
 const s=store();s.tour.start('first-trade');s.recordOrder(order());s.tour.markDone(5,'fill-1')
 s.syncLearningAccount('account-b')
 assert.equal(Object.keys(s.getTourState().runs).length,0)
 s.tour.start('first-trade')
 assert.equal(s.getTourState().runs['first-trade'].trades.length,0)
 s.syncLearningAccount('account-a')
 assert.equal(s.getTourState().runs['first-trade'].trades.length,1)
 s.tour.finish()
 assert.ok(s.getTourState().completed['first-trade'])
 s.syncLearningAccount('fresh-rewind-account')
 assert.equal(Object.keys(s.getTourState().completed).length,0)
})
const {summariseTrades}=load('src/learning/tour/summary.ts',{'../../api':{getCachedQuote:()=>undefined},'../format':{formatPrice:String}})
const fill=(symbol,side,qty,price,fee=0)=>({symbol,side,qty,price,fee})
test('exercise P/L keeps separate cost bases and includes both fees',()=>{
 const result=summariseTrades([fill('A','buy',1,100,1),fill('B','buy',1,1000,1),fill('A','sell',1,110,1)])
 assert.equal(result.realised,8)
})
test('selling unrecorded earlier holdings does not invent a tutorial cost basis',()=>{
 assert.equal(summariseTrades([fill('A','sell',1,110)]).realised,null)
 assert.equal(summariseTrades([fill('A','buy',1,100),fill('A','sell',2,110)]).realised,null)
})
