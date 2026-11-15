// Shared with backend/learning/tests/test_currency_text.py: backend text and UI must show the same H$.
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
const cases=JSON.parse(fs.readFileSync('tests/currency-cases.json','utf8'))
test('UI formatter matches the shared currency cases the backend also checks',()=>{
 for(const c of cases){
  assert.equal(format.formatHOOP(c.units),c.hoop,`hoop ${c.units}`)
  assert.equal(format.formatPrice(c.units),c.price,`price ${c.units}`)
  assert.equal(format.formatPnl(c.units),c.pnl,`pnl ${c.units}`)
 }
})
