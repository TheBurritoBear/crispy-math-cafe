const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(){
 const elements=new Map();
 function element(id){
  if(!elements.has(id))elements.set(id,{style:{},classList:{remove(){}},querySelector:s=>element(id+s),setAttribute(k,v){this[k]=v},replaceChildren(){}});
  return elements.get(id);
 }
 const context=vm.createContext({document:{getElementById:element},localStorage:{getItem:()=>''},clearInterval(){},supabase:{createClient:()=>({})}});
 vm.runInContext(source.slice(0,source.indexOf("\ndocument.querySelectorAll('.tabs button')")),context);
 return {run:code=>vm.runInContext(code,context),context,element};
}
test('each row mixes all operations and respects the level limits',()=>{
 const t=setup();
 const cap=level=>level<=1?5:level===2?9:level===3?12:level===4?16:level===5?20:Math.min(50,20+(level-5)*5);
 for(let level=1;level<=15;level++){
  t.run(`player={current_level:${level}};duckOperationBags={}`);
  for(const row of [1,2,3]){
   const base=cap(row===1?Math.max(1,level-1):level),max=base*2+(row===3?2:0);
   for(let batch=0;batch<40;batch++){
    const ops=[];
    for(let i=0;i<3;i++){
     const q=t.run(`duckFactForRow(${row})`);ops.push(q.op);
     assert.ok(q.a>=1&&q.b>=1);
     if(q.op==='×'){
      assert.equal(q.answer,q.a*q.b);
      assert.ok(Math.max(q.a,q.b)<=Math.min(50,base+(row===3?1:0)));
      assert.ok(Math.min(q.a,q.b)<=base);
     }else if(q.op==='+'){
      assert.equal(q.answer,q.a+q.b);assert.ok(q.answer<=max);
     }else{
      assert.equal(q.answer,q.a-q.b);assert.ok(q.answer>=0);assert.ok(q.a<=max);
     }
    }
    assert.deepEqual(ops.sort(),['+','×','−'].sort());
   }
  }
 }
});
test('true and false equations retain their operation in visible and accessible labels',()=>{
 const t=setup();t.run('player={current_level:3}');
 const btn=t.element('target');t.context.target=btn;
 for(const truth of [true,false])for(let i=0;i<30;i++){
  const eq=t.run(`duckEquation(3,${truth})`);
  assert.equal(eq.shown===eq.answer,truth);
  t.context.equation=eq;t.run('loadDuck(target,equation)');
  assert.equal(t.element('target.duck-eq').textContent,`${eq.a} ${eq.op} ${eq.b} = ${eq.shown}`);
  assert.equal(btn['aria-label'],`${eq.a} ${{'+':'plus','−':'minus','×':'times'}[eq.op]} ${eq.b} equals ${eq.shown}`);
 }
});
test('exiting clears partial operation mixes so the next round starts balanced',()=>{
 const t=setup();t.run('nextDuckOperation(1);nextDuckOperation(2);nextDuckOperation(3);resetDuck()');
 assert.equal(t.run('Object.keys(duckOperationBags).length'),0);
 for(const row of [1,2,3])assert.equal(t.run(`new Set([nextDuckOperation(${row}),nextDuckOperation(${row}),nextDuckOperation(${row})]).size`),3);
});
