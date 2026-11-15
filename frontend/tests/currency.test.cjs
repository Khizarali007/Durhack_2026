const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
function load(path,deps={}){
 const module={exports:{}}
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 vm.runInNewContext(js,{module,exports:module.exports,require:id=>deps[id]})
 return module.exports
}
const currency=load('src/utils/currency.ts')
const format=load('src/utils/format.ts',{'./currency':currency})
const input=load('src/components/stock/ticket/qty.ts',{'../../../utils/currency':currency})
test('starting balance, prices, payments and fees use one denomination',()=>{
 assert.equal(format.formatHOOP(100000),'H$100.00')
 assert.equal(format.formatPrice(154.06),'H$0.15406')
 assert.equal(format.formatHOOP(.4),'H$0.0004')
 assert.equal(format.formatHOOP(.01),'H$0.00001')
 assert.equal(format.formatPnl(-.01),'-H$0.00001')
 assert.equal(format.formatPct(12.34,2),'+12.34%')
 assert.equal(format.formatQty(1000),'1,000')
})
test('bid/ask presets round-trip to the exact same limit and stop tick',()=>{
 for(const oldPrice of [.01,.02,.15,43.08,154.06,100000]){
  assert.equal(input.parsePrice(currency.priceInputText(oldPrice)),oldPrice)
 }
 assert.equal(input.parsePrice('0.15001'),150.01)
 for(const invalid of ['0','-1','0.000001','Infinity','1.2.3',''])assert.equal(input.parsePrice(invalid),null)
 assert.equal(input.parseQty('231'),231)
})
test('rescaling preserves buying power and cash conservation including tiny fees',()=>{
 const cash=100000,price=154.06,qty=64,fee=9.86
 const remaining=cash-price*qty-fee
 const shown=currency.toDisplayCurrency
 assert.ok(Math.abs(shown(cash)-shown(remaining)-shown(price)*qty-shown(fee))<1e-12)
 assert.equal(Math.floor(shown(cash)/shown(price)),Math.floor(cash/price))
 assert.equal(shown(5000),5)
})
test('learning examples match the scaled payout and score without double counting',()=>{
 const questions=JSON.parse(fs.readFileSync('../content/learning-check.json','utf8'))
 const payout=questions.find(q=>q.explanation.includes('Game Score')||q.explanation.includes('0.00002'))
 assert.ok(payout.explanation.includes('H$0.004'))
 const score=questions.find(q=>q.question.includes('season score'))
 assert.equal(score.options[score.answer],'H$100.205')
})
