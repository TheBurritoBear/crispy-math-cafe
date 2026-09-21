const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(){
 const elements=new Map(),cleared=[],calls=[];
 function element(id){
  if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:'',textContent:'',classList:{add(){},remove(){}},querySelector:selector=>element(id+selector)});
  return elements.get(id);
 }
 let resolve;
 const pending=new Promise(done=>{resolve=done});
 const context=vm.createContext({document:{getElementById:element},localStorage:{getItem:()=>''},clearInterval:id=>cleared.push(id),supabase:{createClient:()=>({rpc:(name,args)=>{calls.push({name,args});return pending;}})}});
 vm.runInContext(source.slice(0,source.indexOf("\ndocument.querySelectorAll('.tabs button')")),context);
 vm.runInContext("player={current_level:4}; let selectedPanel='game'; showPanel=id=>{selectedPanel=id}; rush.active=true; rush.timer=101; duck.active=true; duck.timer=202; currentQ={answer:6};",context);
 return {run:code=>vm.runInContext(code,context),element,cleared,calls,resolve:()=>resolve({data:null,error:null})};
}
for(const mode of ['rush','duck']){
 test(`${mode} Quit stops timer and returns immediately while score save is pending`,async()=>{
  const t=setup();const pending=t.run(mode==='rush'?"finishRush('quit')":"finishDuck('quit')");
  assert.equal(t.run('selectedPanel'),'orders');
  assert.equal(t.run(`${mode}.active`),false);
  assert.equal(t.run('currentQ'),null);
  assert.deepEqual(t.cleared,[mode==='rush'?101:202]);
  assert.equal(t.element(mode+'Start').disabled,false);
  assert.equal(t.element(mode+'Quit').disabled,true);
  if(mode==='duck')assert.equal(t.element('duckOver').hidden,true);
  assert.equal(t.calls[0].args.p_metadata.end,'quit');
  t.resolve();await pending;
  assert.equal(t.run('selectedPanel'),'orders');
 });
 test(`${mode} normal timeout still shows its results`,async()=>{
  const t=setup();const pending=t.run(mode==='rush'?"finishRush('time')":"finishDuck('time')");
  assert.equal(t.run('selectedPanel'),'game');
  if(mode==='duck')assert.equal(t.element('duckOver').hidden,false);
  t.resolve();await pending;
 });
}
