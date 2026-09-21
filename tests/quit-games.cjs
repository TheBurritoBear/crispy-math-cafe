const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(){
 const elements=new Map(),cleared=[],calls=[];
 function element(id){
  if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}},querySelector:selector=>element(id+selector),setAttribute(name,value){this[name]=value},replaceChildren(){this.innerHTML=''}});
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
  assert.ok(t.cleared.includes(mode==='rush'?101:202));
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

for(const mode of ['rush','duck']){
 test(`${mode} Quit clears the round and old saves cannot restore it`,async()=>{
  const t=setup();
  t.run(`${mode}.time=17; ${mode}.score=11; ${mode}.correct=6; ${mode}.incorrect=3;`);
  if(mode==='rush'){
   t.run('rush.q={a:3,b:7,answer:21}');t.element('rushInput').value='21';t.element('rushMsg').textContent='Previous result';
  }else{
   t.run('duck.rowStats={1:2,2:3,3:1}');
   [1,2,3].forEach(row=>{t.element('duckLane'+row).innerHTML='old moving ducks'});
  }
  const pending=t.run(mode==='rush'?"finishRush('quit')":"finishDuck('quit')");
  for(const field of ['score','correct','incorrect'])assert.equal(t.run(`${mode}.${field}`),0);
  assert.equal(t.run(`${mode}.time`),60);assert.equal(t.run(`${mode}.timer`),null);
  assert.equal(t.element(mode+'Time').textContent,'60s');assert.equal(Number(t.element(mode+'Score').textContent),0);
  assert.equal(t.calls[0].args.p_score,11);assert.equal(t.calls[0].args.p_correct,6);
  if(mode==='rush'){
   assert.equal(t.run('rush.q'),null);assert.equal(t.element('rushInput').value,'');assert.equal(t.element('rushEquation').textContent,'Press start');assert.equal(t.element('rushMsg').textContent,'');
  }else{
   [1,2,3].forEach(row=>{assert.equal(t.run(`duck.rowStats[${row}]`),0);assert.equal(t.element('duckLane'+row).innerHTML,'')});
   assert.equal(t.element('duckMisses')['aria-label'],'0 of 5 misses');assert.equal(t.element('duckStart').textContent,'Start Duck Dash');assert.equal(t.element('duckOver').hidden,true);
  }
  t.resolve();await pending;
  assert.equal(t.run(`${mode}.score`),0);
  if(mode==='rush')assert.equal(t.element('rushMsg').textContent,'');
 });
}

test('an old Rush save cannot overwrite a newly started round',async()=>{
 const t=setup();const pending=t.run("finishRush('quit')");
 t.run('rush=freshRush();rush.active=true;rush.score=2');t.element('rushMsg').textContent='New round';
 t.resolve();await pending;
 assert.equal(t.run('rush.active'),true);assert.equal(t.run('rush.score'),2);assert.equal(t.element('rushMsg').textContent,'New round');
});
