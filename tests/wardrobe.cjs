const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function setup(overrides={},catalog=[]){
  const calls=[];
  const elements={};
  const element=id=>elements[id]??=( {textContent:'',innerHTML:''} );
  let saved={current_level:4,coins:600,purchased_items:[],active_chicken:'plain',extra_state:{other_setting:true},...overrides};
  const context=vm.createContext({localStorage:{getItem:()=>''},document:{querySelectorAll:()=>[],getElementById:element},alert:message=>{throw Error(message)},supabase:{createClient:()=>({rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='get_shop_items')return {data:catalog,error:null};
    if(name==='purchase_item'){
      if(!saved.purchased_items.includes(args.p_item_id)){
        saved.coins-=args.p_item_id==='pink'?100:200;saved.purchased_items.push(args.p_item_id);
      }
    }else if(name==='save_progress'){
      saved.extra_state={...saved.extra_state,...args.p_extra_state};saved.active_chicken=args.p_active_chicken;
    }
    return {data:structuredClone(saved),error:null};
  }})}});
  vm.runInContext(source.slice(0,source.indexOf("\ndocument.querySelectorAll('.tabs button')")),context);
  context.fixture=structuredClone(saved);
  vm.runInContext(`player=fixture; const realRenderShop=renderShop; updateUI=()=>{}; renderShop=async()=>{}; shopCatalog=[{id:'pink',item_type:'color',cost:100,min_level:1},{id:'firefighter',item_type:'costume',cost:200,min_level:1}];`,context);
  return {run:code=>vm.runInContext(code,context),calls,saved:()=>saved,element};
}
test('pink + firefighter stay equipped together, survive reload, and charge once',async()=>{
 const t=setup();await t.run("selectAvatarItem('color','pink')");await t.run("selectAvatarItem('costume','firefighter')");
 assert.equal(t.saved().coins,300);
 assert.equal(t.saved().extra_state.avatar_color,'pink');assert.equal(t.saved().extra_state.avatar_costume,'firefighter');
 assert.equal(t.saved().extra_state.other_setting,true);
 await t.run("selectAvatarItem('costume','firefighter')");assert.equal(t.saved().coins,300);
 const restored=setup(t.saved());assert.equal(restored.run('appearanceFor().color'),'pink');assert.equal(restored.run('appearanceFor().costume'),'firefighter');
 await t.run("selectAvatarItem('color','natural')");assert.equal(t.saved().extra_state.avatar_costume,'firefighter');
 await t.run("selectAvatarItem('costume','none')");assert.equal(t.saved().extra_state.avatar_color,'natural');
});
test('legacy pumpkin owners retain costume when selecting color',async()=>{
 const t=setup({active_chicken:'halloween_chicken',purchased_items:['halloween_chicken']});
 assert.equal(t.run('appearanceFor().costume'),'halloween_chicken');
 await t.run("selectAvatarItem('color','pink')");assert.equal(t.saved().extra_state.avatar_costume,'halloween_chicken');
 await t.run("selectAvatarItem('costume','none')");assert.equal(t.run('appearanceFor().costume'),'none');
});
test('unaffordable selections and duplicate taps do not purchase twice',async()=>{
 const poor=setup({coins:99});await poor.run("selectAvatarItem('color','pink')");assert.equal(poor.calls.length,0);
 const t=setup();await Promise.all([t.run("selectAvatarItem('color','pink')"),t.run("selectAvatarItem('color','pink')")]);
 assert.equal(t.calls.filter(c=>c.name==='purchase_item').length,1);
});
test('main avatar and preview carry independent color and costume attributes',()=>{
 const t=setup();const html=t.run("chickenPreviewMarkup('plain',false,'pink','firefighter',true)");
 assert.match(html,/id="chickenAvatar"/);assert.match(html,/data-color="pink"/);assert.match(html,/data-costume="firefighter"/);
 assert.match(html,/class="costume-suit"/);assert.match(html,/class="pumpkin-suit"/);
});
test('owned pumpkin stays selectable below purchase level and preserves blue feathers',async()=>{
 const item={id:'halloween_chicken',item_type:'costume',cost:200,min_level:4,display_name:'Pumpkin Costume'};
 const t=setup({current_level:3,coins:0,purchased_items:['halloween_chicken'],extra_state:{avatar_color:'blue',avatar_costume:'firefighter'}},[item]);
 await t.run('realRenderShop()');
 const button=t.element('shopItems').innerHTML.match(/<button data-avatar-item="halloween_chicken"[^>]*>[^<]*<\/button>/)[0];
 assert.doesNotMatch(button,/disabled/);assert.match(button,/>Equip</);
 await t.run("selectAvatarItem('costume','halloween_chicken')");
 assert.equal(t.saved().extra_state.avatar_costume,'halloween_chicken');
 assert.equal(t.saved().extra_state.avatar_color,'blue');
 assert.equal(t.calls.filter(c=>c.name==='purchase_item').length,0);
 const unowned=setup({current_level:3,coins:1000},[item]);await unowned.run('realRenderShop()');
 const lockedButton=unowned.element('shopItems').innerHTML.match(/<button data-avatar-item="halloween_chicken"[^>]*>[^<]*<\/button>/)[0];
 assert.match(lockedButton,/disabled/);assert.match(lockedButton,/Unlock after Level 3/);
});
