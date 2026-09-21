const SUPABASE_URL='https://msjyijchqjxectlmjmxv.supabase.co';
const SUPABASE_KEY='sb_publishable_CVgkk8nRHbnoiL0cz0mwDQ_0UTx_yuT';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let sessionToken=localStorage.getItem('cmc_session')||'';
let player=null;
let currentQ=null;
let rush=freshRush();
const DUCK={time:60,goal:20,missPenalty:2,maxMisses:5,perLane:3,speed:{1:20,2:16,3:12.5}};
let duck=freshDuck();
let duckOperationBags={};

function freshRush(){return {timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:false};}
function freshDuck(){return {timer:null,time:DUCK.time,score:0,correct:0,incorrect:0,active:false,rowStats:{1:0,2:0,3:0}};}

const $=id=>document.getElementById(id);

const sauces=[
  {id:'plain',name:'Plain',level:1,icon:'✓'},
  {id:'original',name:'Original',level:2,icon:'🍗'},
  {id:'soy_garlic',name:'Soy garlic',level:3,icon:'🧄'},
  {id:'honey_butter',name:'Honey butter',level:4,icon:'🍯'},
  {id:'sweet_chili',name:'Sweet chili',level:5,icon:'🌶️'},
  {id:'sesame',name:'Sesame',level:6,icon:'◌'},
  {id:'gochujang',name:'Gochujang',level:7,icon:'🔥'},
  {id:'golden_garlic',name:'Golden garlic',level:8,icon:'✨'},
  {id:'firecracker',name:'Firecracker',level:9,icon:'💥'}
];

const avatarColors={natural:'Natural',bright_green:'Bright green',pink:'Pink',blue:'Blue'};
const avatarCostumes={none:'No costume',dress:'Party dress',cowboy:'Cowboy',firefighter:'Firefighter',halloween_chicken:'Pumpkin costume'};
let shopActionBusy=false;
let shopCatalog=[];
function appearanceFor(p=player){
  const extra=p?.extra_state||{};
  const legacy=p?.active_chicken==='halloween_chicken'?'halloween_chicken':'none';
  return {
    color:Object.hasOwn(avatarColors,extra.avatar_color)?extra.avatar_color:'natural',
    costume:Object.hasOwn(avatarCostumes,extra.avatar_costume)?extra.avatar_costume:legacy,
    sauce:sauces.some(s=>s.id===p?.active_chicken)?p.active_chicken:'plain'
  };
}
function appearancePatch(category,id){
  const current=appearanceFor();
  return {extra_state:{...(player.extra_state||{}),avatar_color:category==='color'?id:current.color,avatar_costume:category==='costume'?id:current.costume}};
}

function maxFactorForLevel(level){
  if(level<=1) return 5;
  if(level===2) return 9;
  // Level 3 practices through 11; later levels add just one new factor.
  return Math.min(50,11+Math.max(0,level-3));
}
function levelGoal(level){ return level<3?10:50; }
function duckGoalForLevel(){ return 20; }

function makeQ(level,harder=false){
  let max=maxFactorForLevel(level);
  let min=1;
  if(level>=4) min=Math.max(2,Math.floor(max*.2));
  if(harder){
    // Rush favors tougher facts within this level, without raising its cap.
    min=Math.max(min,Math.floor(max*.25));
  }
  const span=Math.max(1,max-min+1);
  const a=min+Math.floor(Math.random()*span);
  const b=min+Math.floor(Math.random()*span);
  return {a,b,answer:a*b};
}
function setMsg(el,msg,good=false){
  el.textContent=msg;
  el.className=good?'msg good':'msg bad';
}
async function rpc(name,args={}){
  const {data,error}=await sb.rpc(name,args);
  if(error) throw error;
  return data;
}
function displayStyleName(id){
  if(id==='halloween_chicken') return 'Halloween chicken';
  return sauces.find(s=>s.id===id)?.name||'Plain';
}
async function createPlayer(){
  const name=$('playerName').value.trim(),code=$('saveCode').value.trim();
  $('authMsg').textContent='Creating your shop…';
  try{
    const data=await rpc('create_player',{p_name:name,p_save_code:code});
    sessionToken=data.session_token;
    localStorage.setItem('cmc_session',sessionToken);
    player=data.player;
    enterGame();
  }catch(e){setMsg($('authMsg'),e.message);}
}
async function login(){
  const name=$('playerName').value.trim(),code=$('saveCode').value.trim();
  $('authMsg').textContent='Loading your shop…';
  try{
    const data=await rpc('login_player',{p_name:name,p_save_code:code});
    sessionToken=data.session_token;
    localStorage.setItem('cmc_session',sessionToken);
    player=data.player;
    enterGame();
  }catch(e){setMsg($('authMsg'),e.message);}
}
async function tryRestore(){
  if(!sessionToken)return;
  try{
    player=await rpc('load_player',{p_session_token:sessionToken});
    enterGame();
  }catch{
    localStorage.removeItem('cmc_session');
    sessionToken='';
  }
}
function enterGame(){
  $('authCard').classList.add('hidden');
  $('gameApp').classList.remove('hidden');
  updateUI();
  // the town owns which building is ordering; app.js still owns the math
  Town.init({
    level:player.current_level,
    makeQuestion:()=>makeQ(player.current_level),
    onOpen:renderOrder,
    onClose:hideOrderTicket
  });
  renderShop();
}
function showPanel(panelId){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===panelId));
  document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'));
  $(panelId).classList.remove('hidden');
  if(panelId!=='orders') hideOrderTicket();
  if(panelId==='leaderboard') loadBoard('rush');
  if(panelId==='shop') renderShop();
}
function openHintGame(){
  hideOrderTicket();
  showPanel('duck');
  updateUnlockUI();
  $('duckStatus').textContent='You’re out of hints. Win Duck Dash to earn +1 and jump back to your order.';
  $('duckStart').focus();
}
function updateUnlockUI(){
  $('duckStart').disabled=duck.active;
  $('duckIntro').textContent=`Ducks mix addition, subtraction, and multiplication. Tap only TRUE equations! The middle row matches your level; the top row is slightly harder. Get ${DUCK.goal} points in ${DUCK.time} seconds. Wrong duck = −${DUCK.missPenalty} points, and ${DUCK.maxMisses} wrong ducks ends the game.`;
  renderDuck();
}
function updateUI(){
  const goal=levelGoal(player.current_level);
  $('levelBadge').textContent='Level '+player.current_level;
  $('coinBadge').textContent=player.coins+' coins';
  $('shopCoinCount').textContent=player.coins;
  $('playerLabel').textContent=player.display_name;
  $('hintLabel').textContent='Hints: '+player.hints;
  if(player.hints>0){
    $('hintBtn').innerHTML=`💡 Hint <span id="hintCountInline">(${player.hints})</span>`;
  }else{
    $('hintBtn').textContent='🦆 Earn a hint';
  }
  $('storeTitle').textContent=player.store_name||'My Chicken Shop';
  $('townShopName').textContent=player.store_name||'My Chicken Shop';
  $('townShopName').title=player.store_name||'My Chicken Shop';
  $('storeNameEditor').classList.remove('hidden');
  $('storeNameInput').value=player.store_name||'';
  $('progressText').textContent=`${player.level_correct} / ${goal} correct to complete this level`;
  $('progressFill').style.width=Math.min(100,(player.level_correct/goal)*100)+'%';
  $('ordersFilled').textContent=player.total_orders;
  $('streakValue').textContent=player.current_streak;
  $('shopCopy').textContent=player.current_level<=3
    ?`Let’s fill ${goal} correct orders, at your own pace.`
    :`Level ${player.current_level} takes ${goal} correct orders. Keep the kitchen moving!`;
  const look=appearanceFor();
  $('chickenAvatar').outerHTML=chickenPreviewMarkup(look.sauce,false,look.color,look.costume,true);
  $('chickenStyleLabel').textContent=avatarColors[look.color]+' chicken'+(look.costume==='none'?'':' · '+avatarCostumes[look.costume]);
  const next=sauces.find(s=>s.level>player.current_level);
  $('nextUnlockText').textContent=next
    ?`Complete level ${next.level-1}: unlock ${next.name}`
    :'All sauce styles unlocked!';
  renderSauces();
  updateUnlockUI();
  // grow the town if the player just levelled up
  if(window.Town) Town.setLevel(player.current_level);
}
function renderSauces(){
  $('sauceGrid').innerHTML=sauces.map(s=>{
    const locked=player.current_level<s.level;
    const active=player.active_chicken===s.id;
    return `<div class="sauce-chip ${locked?'locked':''} ${active?'active':''}">
      <span>${locked?'🔒':s.icon}</span>
      <button type="button" data-sauce="${s.id}" ${locked?'disabled':''}>${s.name}</button>
    </div>`;
  }).join('');
  document.querySelectorAll('[data-sauce]').forEach(btn=>{
    btn.onclick=()=>equipStyle(btn.dataset.sauce);
  });
}
async function equipStyle(id){
  if(sauces.find(s=>s.id===id)?.level>player.current_level)return;
  try{
    await savePlayer({active_chicken:id,...appearancePatch('color',appearanceFor().color)});
  }catch(e){alert(e.message);}
}

/* ---------- order ticket, driven by the town map ---------- */
function plural(n,one,many){ return `${n} ${n===1?one:many}`; }
function orderStoryText(a,b){
  // 1 box. 1 piece in the box. / 3 boxes. 1 piece in each box.
  const where=a===1?'in the box':'in each box';
  return `${plural(a,'box','boxes')}. ${plural(b,'piece','pieces')} ${where}.`;
}
function renderOrder(order){
  currentQ=order;
  const goal=levelGoal(player.current_level);
  $('ticketIcon').textContent=order.icon;
  $('orderCounter').textContent=`ORDER ${Math.min(goal,player.level_correct+1)} OF ${goal}`;
  $('orderPrompt').textContent=`${order.name} wants chicken!`;
  $('orderStory').textContent=orderStoryText(order.a,order.b);
  $('equation').textContent=`${order.a} × ${order.b} = ?`;
  $('orderQuestion').textContent='How many pieces altogether?';
  $('answerInput').value='';
  $('feedback').textContent='';
  $('feedback').className='feedback';
  $('serveBtn').disabled=false;
  $('orderTicketHost').classList.add('open');
}
function hideOrderTicket(){
  $('orderTicketHost').classList.remove('open');
  currentQ=null;
}

async function savePlayer(patch={}){
  const args={
    p_session_token:sessionToken,
    p_current_level:patch.current_level??player.current_level,
    p_level_correct:patch.level_correct??player.level_correct,
    p_coins:patch.coins??player.coins,
    p_total_correct:patch.total_correct??player.total_correct,
    p_total_incorrect:patch.total_incorrect??player.total_incorrect,
    p_total_orders:patch.total_orders??player.total_orders,
    p_current_streak:patch.current_streak??player.current_streak,
    p_best_streak:patch.best_streak??player.best_streak,
    p_hints:patch.hints??player.hints,
    p_store_name:patch.store_name??player.store_name,
    p_active_chicken:patch.active_chicken??player.active_chicken,
    p_purchased_items:patch.purchased_items??player.purchased_items,
    p_extra_state:patch.extra_state??{}
  };
  player=await rpc('save_progress',args);
  updateUI();
  return player;
}
async function serveOrder(){
  if(!currentQ)return;
  const raw=$('answerInput').value.trim();
  if(raw==='')return;
  const val=Number(raw);
  if(!Number.isFinite(val))return;
  $('serveBtn').disabled=true;
  const buildingId=currentQ.buildingId;
  const correct=val===currentQ.answer;
  let lvl=player.current_level,lc=player.level_correct,coins=player.coins,streak=player.current_streak;
  let levelUp=false;
  if(correct){
    lc++;coins++;streak++;
    if(lc>=levelGoal(lvl)){lvl++;lc=0;levelUp=true;}
    $('feedback').textContent=levelUp?'✓ Correct! Level up! 🎉':'✓ Correct!';
    $('feedback').className='feedback good';
    flashFeedback(levelUp);
  }else{
    streak=0;
    $('feedback').textContent=`Not quite · ${currentQ.a} × ${currentQ.b} = ${currentQ.answer}`;
    $('feedback').className='feedback bad';
    flashFeedback(false);
    shakeTicket();
  }
  try{
    await savePlayer({
      current_level:lvl,level_correct:lc,coins,
      total_correct:player.total_correct+(correct?1:0),
      total_incorrect:player.total_incorrect+(correct?0:1),
      total_orders:player.total_orders+1,
      current_streak:streak,
      best_streak:Math.max(player.best_streak,streak)
    });
    setTimeout(()=>{
      // right answer: scooter flies over and the customer is done.
      // wrong answer: same customer, brand new question, ticket stays open.
      if(correct) Town.complete(buildingId);
      else Town.reroll(buildingId);
      $('serveBtn').disabled=false;
      renderShop();
    },correct?520:1100);
  }catch(e){
    $('serveBtn').disabled=false;
    setMsg($('feedback'),e.message);
  }
}
function shakeTicket(){
  const card=document.querySelector('#orderTicketHost .order-card');
  if(!card)return;
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}
async function useHint(){
  if(player.hints<=0){
    openHintGame();
    return;
  }
  if(!currentQ)return;
  $('feedback').textContent=`Hint: count ${currentQ.a} groups of ${currentQ.b}. Try skip-counting by ${currentQ.b}s.`;
  $('feedback').className='feedback good';
  await savePlayer({hints:player.hints-1});
}
async function saveStoreName(){
  const name=$('storeNameInput').value.trim();
  if(!name)return;
  if(name.length>18){
    $('storeNameInput').setCustomValidity('Use 18 characters or fewer so your name fits on the map.');
    $('storeNameInput').reportValidity();
    return;
  }
  $('storeNameInput').setCustomValidity('');
  try{
    await savePlayer({store_name:name});
    $('storeNameInput').blur();
  }catch(e){alert(e.message);}
}
function flashFeedback(levelUp=false){
  const el=$('feedback');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  if(levelUp){
    document.body.classList.add('level-up');
    setTimeout(()=>document.body.classList.remove('level-up'),750);
  }
}
function skipOrder(){ Town.skip(); }
function appendAnswer(n){
  const input=$('answerInput');
  if(input.value.length>=5)return;
  input.value=(input.value||'')+n;
}
function clearAnswer(){ $('answerInput').value=''; }
function deleteAnswer(){ $('answerInput').value=$('answerInput').value.slice(0,-1); }
function editRushAnswer(key){
  if(!rush.active)return;
  const input=$('rushInput');
  if(key==='clear')input.value='';
  else if(key==='delete')input.value=input.value.slice(0,-1);
  else if(/^[0-9]$/.test(key)&&input.value.length<5)input.value+=key;
}

function resetRush(){
  clearInterval(rush.timer);
  rush=freshRush();
  $('rushInput').value='';
  $('rushInput').disabled=true;
  $('rushSubmit').disabled=true;
  $('rushStart').disabled=false;
  $('rushQuit').disabled=true;
  $('rushEquation').textContent='Press start';
  $('rushMsg').textContent='';
  renderRush();
}
function startRush(){
  resetRush();
  rush.active=true;
  $('rushInput').disabled=false;
  $('rushSubmit').disabled=false;
  $('rushStart').disabled=true;
  $('rushQuit').disabled=false;
  $('rushMsg').textContent='';
  rushNext();
  renderRush();
  rush.timer=setInterval(async()=>{
    rush.time--;
    renderRush();
    if(rush.time<=0)await finishRush('time');
  },1000);
}
async function finishRush(reason='time'){
  clearInterval(rush.timer);
  if(!rush.active)return;
  rush.active=false;
  $('rushNumberPad').disabled=true;
  const round=rush;
  $('rushInput').disabled=true;
  $('rushSubmit').disabled=true;
  $('rushStart').disabled=false;
  $('rushQuit').disabled=true;
  const elapsed=Math.max(1,60-rush.time);
  if(reason==='quit'){
    resetRush();
    hideOrderTicket();
    showPanel('orders');
  }
  try{
    await rpc('submit_score',{
      p_session_token:sessionToken,p_mode:'rush',p_level:player.current_level,
      p_score:round.score,p_correct:round.correct,p_incorrect:round.incorrect,
      p_duration_seconds:elapsed,p_metadata:{difficulty_max:maxFactorForLevel(player.current_level),end:reason}
    });
  }catch(e){}
  if(rush===round){
    $('rushMsg').textContent=`Finished! Score ${round.score} · ${round.correct} correct · ${round.incorrect} incorrect.`;
  }
}
function rushNext(){
  rush.q=makeQ(player.current_level,true);
  $('rushEquation').textContent=`${rush.q.a} × ${rush.q.b} = ?`;
  $('rushInput').value='';
}
function rushAnswer(){
  if(!rush.active)return;
  if(!$('rushInput').value.trim())return;
  const val=Number($('rushInput').value);
  if(!Number.isFinite(val))return;
  if(val===rush.q.answer){rush.correct++;rush.score++;}
  else{rush.incorrect++;rush.score--;}
  renderRush();rushNext();
}
function renderRush(){
  $('rushNumberPad').disabled=!rush.active;
  $('rushTime').textContent=rush.time+'s';
  $('rushScore').textContent=rush.score;
}

function chickenPreviewMarkup(style='plain',mini=false,color='natural',costume='none',main=false){
  const renderedStyle=costume==='halloween_chicken'?'halloween_chicken':style;
  return `<div ${main?'id="chickenAvatar" role="img" aria-label="'+escapeHtml(avatarColors[color]+' chicken, '+avatarCostumes[costume])+'"':'aria-hidden="true"'} class="chicken-avatar ${mini?'mini-chicken':''}" data-style="${escapeHtml(renderedStyle)}" data-color="${escapeHtml(color)}" data-costume="${escapeHtml(costume)}">
    <div class="chef-hat"><span></span><span></span><span></span></div>
    <div class="chicken-body">
      <div class="comb"></div>
      <div class="eye eye-left"></div>
      <div class="eye eye-right"></div>
      <div class="beak"></div>
      <div class="wattle"></div>
      <div class="pumpkin-suit">
        <span class="pumpkin-eye pumpkin-eye-left"></span>
        <span class="pumpkin-eye pumpkin-eye-right"></span>
        <span class="pumpkin-nose"></span>
        <span class="pumpkin-mouth"></span>
      </div>
      <div class="costume-suit">${costume==='dress'?`<svg class="party-dress" viewBox="0 0 110 90" aria-hidden="true">
        <path d="M33 8 L42 8 Q55 25 68 8 L77 8 L73 34 Q87 53 104 78 Q55 96 6 78 Q23 53 37 34Z" fill="#a56de2" stroke="#2a1a11" stroke-width="3" stroke-linejoin="round"/>
        <path d="M37 34 Q55 39 73 34 L78 43 Q55 49 32 43Z" fill="#ffd45a" stroke="#2a1a11" stroke-width="2"/>
        <path d="M39 50 L29 77 M55 52 L55 81 M71 50 L81 77" fill="none" stroke="#814bb9" stroke-width="3" stroke-linecap="round"/>
        <path d="M12 77 Q55 91 98 77" fill="none" stroke="#f6d5ff" stroke-width="4"/>
        <path d="M43 33 L55 38 L67 33 L67 47 L55 42 L43 47Z" fill="#f6bff0" stroke="#2a1a11" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="55" cy="40" r="4" fill="#ffd45a" stroke="#2a1a11" stroke-width="2"/>
      </svg>`:'<span class="costume-badge"></span><span class="costume-belt"></span>'}</div>
      ${costume==='dress'?`<svg class="party-hair-bow" viewBox="0 0 36 24" aria-hidden="true"><path d="M3 3 Q11 1 18 9 Q25 1 33 3 L33 21 Q25 23 18 15 Q11 23 3 21Z" fill="#a56de2" stroke="#2a1a11" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="18" cy="12" rx="4" ry="6" fill="#ffd45a" stroke="#2a1a11" stroke-width="2"/></svg>`:''}
      <div class="wing wing-left"></div>
      <div class="wing wing-right"></div>
      <div class="tail"></div>
      <div class="legs"><span></span><span></span></div>
    </div>
  </div>`;
}
/* Duck Dash mixes all three operations in each row.
   Multiplication uses the order level's limits; the top row stretches
   only ONE factor by one, instead of using Rush's harder-question range. */
function nextDuckOperation(row){
  if(!duckOperationBags[row]?.length){
    const bag=['+','−','×'];
    for(let i=bag.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    duckOperationBags[row]=bag;
  }
  return duckOperationBags[row].pop();
}
function duckLimitsForRow(row){
  const level=Math.max(1,player?.current_level||1);
  const base=maxFactorForLevel(row===1?Math.max(1,level-1):level);
  return {factor:base,stretch:row===3?Math.min(50,base+1):base,total:base*2+(row===3?2:0)};
}
function duckFactForRow(row){
  const op=nextDuckOperation(row);
  const limits=duckLimitsForRow(row);
  const random=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
  let a,b,answer;
  if(op==='×'){
    a=random(1,limits.stretch);b=random(1,limits.factor);
    if(Math.random()<.5)[a,b]=[b,a];
    answer=a*b;
  }else if(op==='+'){
    answer=random(2,limits.total);
    a=random(1,answer-1);b=answer-a;
  }else{
    a=random(1,limits.total);b=random(1,a);answer=a-b;
  }
  return {a,b,op,answer};
}
function duckWrongAnswer(q){
  const {a,b,answer}=q;
  const options=[answer+1,answer-1,answer+2,answer-2,answer+a,answer-a,answer+b,answer-b,answer+10,answer-10];
  if(q.op==='×'&&a+b!==answer) options.push(a+b);          // the classic "added instead of multiplied"
  const good=[...new Set(options)].filter(v=>v>0&&v!==answer);
  return good[Math.floor(Math.random()*good.length)]??answer+1;
}
function duckEquation(row,force){
  // force: true / false to pick the kind, undefined for a coin flip
  const q=duckFactForRow(row);
  const isTrue=typeof force==='boolean'?force:Math.random()<0.5;
  const shown=isTrue?q.answer:duckWrongAnswer(q);
  return {...q,shown,isTrue};
}
function buildDuckTarget(row,index){
  const speed=DUCK.speed[row];
  const btn=document.createElement('button');
  btn.type='button';
  btn.className=`duck-target row-${row} ${row===2?'rtl':'ltr'}`;
  btn.dataset.row=row;
  btn.style.setProperty('--duck-speed',speed+'s');
  btn.style.setProperty('--duck-delay',(-index*(speed/DUCK.perLane))+'s');
  btn.innerHTML=`<svg class="duck-shape" viewBox="0 0 150 96" aria-hidden="true" focusable="false">
    <ellipse class="duck-body" cx="60" cy="64" rx="54" ry="30"></ellipse>
    <circle class="duck-body duck-head" cx="106" cy="33" r="23"></circle>
    <polygon class="duck-beak" points="123,27 149,23 149,39 123,41"></polygon>
    <circle class="duck-eye" cx="112" cy="26" r="3.2"></circle>
  </svg><span class="duck-eq"></span><span class="duck-points">+${row}</span><span class="duck-flag" aria-hidden="true"></span>`;
  btn.addEventListener('pointerdown',e=>{e.preventDefault();shootDuck(btn);});
  btn.addEventListener('click',e=>{if(e.detail===0)shootDuck(btn);}); // keyboard / switch access
  return btn;
}
function setDuckEqText(el,text){
  el.textContent=text;
  el.style.fontSize=text.length<=9?'':text.length<=11?'.86rem':text.length<=13?'.74rem':'.64rem';
}
function loadDuck(btn,eq){
  btn._eq=eq;
  btn.classList.remove('hit','miss','busy');
  btn.querySelector('.duck-flag').textContent='';
  setDuckEqText(btn.querySelector('.duck-eq'),`${eq.a} ${eq.op} ${eq.b} = ${eq.shown}`);
  btn.setAttribute('aria-label',`${eq.a} ${{'+':'plus','−':'minus','×':'times'}[eq.op]} ${eq.b} equals ${eq.shown}`);
}
function laneHas(row,kind,except){
  return [...$('duckLane'+row).querySelectorAll('.duck-target')].some(d=>d!==except&&d._eq&&d._eq.isTrue===kind);
}
function refillDuck(btn){
  const row=Number(btn.dataset.row);
  // every lane always keeps at least one true duck to find and one false duck to skip
  let force;
  if(!laneHas(row,true,btn)) force=true;
  else if(!laneHas(row,false,btn)) force=false;
  loadDuck(btn,duckEquation(row,force));
}
function populateDuckLanes(){
  [3,2,1].forEach(row=>{
    const lane=$('duckLane'+row);
    lane.innerHTML='';
    for(let i=0;i<DUCK.perLane;i++){
      const btn=buildDuckTarget(row,i);
      lane.appendChild(btn);
      loadDuck(btn,duckEquation(row,i===0?true:i===1?false:undefined));
    }
  });
}
function shootDuck(btn){
  if(!duck.active||btn.classList.contains('busy')||!btn._eq)return;
  const row=Number(btn.dataset.row)||1;
  const eq=btn._eq;
  btn.classList.add('busy');
  if(eq.isTrue){
    duck.correct++;
    duck.score+=row;
    duck.rowStats[row]++;
    btn.classList.add('hit');
    btn.querySelector('.duck-flag').textContent='✓';
    setDuckStatus(`Yes! ${eq.a} ${eq.op} ${eq.b} = ${eq.answer}. +${row} point${row===1?'':'s'}!`,true);
  }else{
    duck.incorrect++;
    duck.score=Math.max(0,duck.score-DUCK.missPenalty);
    btn.classList.add('miss');
    btn.querySelector('.duck-flag').textContent='✗';
    setDuckEqText(btn.querySelector('.duck-eq'),`${eq.a} ${eq.op} ${eq.b} = ${eq.answer}`);
    const left=DUCK.maxMisses-duck.incorrect;
    setDuckStatus(`Oops! ${eq.a} ${eq.op} ${eq.b} is ${eq.answer}, not ${eq.shown}. −${DUCK.missPenalty} points. ${left>0?`${left} miss${left===1?'':'es'} left.`:''}`,false);
    shakeDuckBoard();
  }
  renderDuck();
  if(duck.score>=DUCK.goal){finishDuck('win');return;}
  if(duck.incorrect>=DUCK.maxMisses){finishDuck('misses');return;}
  const round=duck;
  setTimeout(()=>{ if(duck===round&&round.active&&btn.isConnected) refillDuck(btn); },eq.isTrue?450:900);
}
function setDuckStatus(msg,good){
  const el=$('duckStatus');
  el.textContent=msg;
  el.className='msg duck-msg '+(good===true?'good':good===false?'bad':'');
}
function shakeDuckBoard(){
  const el=$('duckCarnival');
  el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');
}
function resetDuck(){
  clearInterval(duck.timer);
  duck=freshDuck();
  duckOperationBags={};
  $('duckStart').disabled=false;
  $('duckStart').textContent='Start Duck Dash';
  $('duckQuit').disabled=true;
  $('duckCarnival').classList.remove('is-over','is-won','shake');
  const over=$('duckOver');
  over.hidden=true;
  over.querySelector('.duck-over-emoji').textContent='💦';
  over.querySelector('.duck-over-title').textContent='Game over!';
  over.querySelector('.duck-over-text').textContent='';
  $('duckOverBtn').textContent='Try again';
  [1,2,3].forEach(row=>$('duckLane'+row).replaceChildren());
  setDuckStatus('Tap Start when you’re ready.');
  renderDuck();
}
function startDuck(){
  resetDuck();
  duck.active=true;
  $('duckStart').disabled=true;
  $('duckQuit').disabled=false;
  $('duckCarnival').classList.remove('is-over','is-won');
  $('duckOver').hidden=true;
  setDuckStatus('Go! Tap only the TRUE ducks. Top row is faster and worth more.');
  populateDuckLanes();
  renderDuck();
  duck.timer=setInterval(()=>{
    duck.time--;
    renderDuck();
    if(duck.time<=0) finishDuck('time');
  },1000);
}
async function finishDuck(reason){
  clearInterval(duck.timer);
  if(!duck.active)return;
  duck.active=false;
  const round=duck;
  const success=reason==='win';
  $('duckCarnival').classList.add('is-over');
  if(success) $('duckCarnival').classList.add('is-won');
  $('duckStart').disabled=false;
  $('duckQuit').disabled=true;
  $('duckStart').textContent=success?'Play again':'Try again';
  const over=$('duckOver');
  over.querySelector('.duck-over-emoji').textContent=success?'🎉':reason==='misses'?'💦':reason==='quit'?'🚪':'⏰';
  over.querySelector('.duck-over-title').textContent=
    success?'Hint earned!':reason==='misses'?'Game over!':reason==='quit'?'Quit game':'Time’s up!';
  over.querySelector('.duck-over-text').textContent=
    success?`${duck.score} points with ${duck.incorrect} miss${duck.incorrect===1?'':'es'}. Heading back to the map…`
    :reason==='misses'?`${DUCK.maxMisses} wrong ducks. Slow down and check each fact. You had ${duck.score} points.`
    :reason==='quit'?`You left with ${duck.score} point${duck.score===1?'':'s'}. Tap Start when you’re ready to try again.`
    :`You got ${duck.score} of ${DUCK.goal} points. So close. Try again!`;
  over.hidden=reason==='quit';
  setDuckStatus(success?'Hint earned! 🎉':reason==='quit'?'Round ended.':'Tap “Try again” to play another round.',success?true:null);
  const elapsed=Math.max(1,DUCK.time-duck.time);
  if(reason==='quit'){
    resetDuck();
    hideOrderTicket();
    showPanel('orders');
  }
  try{
    await rpc('submit_score',{
      p_session_token:sessionToken,p_mode:'duck_dash',p_level:player.current_level,
      p_score:round.score,p_correct:round.correct,p_incorrect:round.incorrect,
      p_duration_seconds:elapsed,
      p_metadata:{earned_hint:success,end:reason,target:DUCK.goal,time_left:round.time,row_stats:round.rowStats,control:'true_false_ducks'}
    });
  }catch(e){}
  if(success){
    try{ await savePlayer({hints:player.hints+1}); }catch(e){}
    setTimeout(()=>{ if(duck===round){ $('duckOver').hidden=true; showPanel('orders'); } },1800);
  }
}
function renderDuck(){
  $('duckTime').textContent=duck.time+'s';
  $('duckScore').textContent=duck.score;
  $('duckGoal').textContent=DUCK.goal;
  const misses=$('duckMisses');
  if(misses){
    misses.innerHTML=Array.from({length:DUCK.maxMisses},(_,i)=>`<i class="${i<duck.incorrect?'used':''}">${i<duck.incorrect?'✗':'○'}</i>`).join('');
    misses.setAttribute('aria-label',`${duck.incorrect} of ${DUCK.maxMisses} misses`);
  }
}


async function renderShop(){
  $('shopCoinCount').textContent=player.coins;
  try{
    shopCatalog=await rpc('get_shop_items');
    const look=appearanceFor();
    $('shopItems').innerHTML=[['color','Colors','100 coins each · only your chicken changes color'],['costume','Costumes','200 coins each · keep your selected chicken color']].map(([category,title,subtitle])=>{
      const items=shopCatalog.filter(i=>i.item_type===category);
      const defaultId=category==='color'?'natural':'none';
      const defaultName=category==='color'?'Natural feathers':'No costume';
      const options=[{id:defaultId,display_name:defaultName,description:category==='color'?'Use your unlocked sauce color.':'Back to your chef hat.',free:true},...items];
      return `<section class="shop-category"><h3>${title}</h3><p class="muted">${subtitle}</p><div class="shop-grid">${options.map(i=>{
        const owned=i.free||player.purchased_items.includes(i.id);
        const locked=!owned&&player.current_level<i.min_level;
        const equipped=look[category]===i.id;
        const previewColor=category==='color'?i.id:look.color;
        const previewCostume=category==='costume'?i.id:look.costume;
        const label=equipped?'Equipped':owned?'Equip':locked?`Unlock after Level ${i.min_level-1}`:`Buy · ${i.cost} coins`;
        const disabled=shopActionBusy||equipped||locked||(!owned&&player.coins<i.cost);
        return `<div class="shopItem ${equipped?'is-equipped':''}">
          <div class="preview chicken-shop-preview">${chickenPreviewMarkup(look.sauce,true,previewColor,previewCostume)}</div>
          <div><strong>${escapeHtml(i.display_name)}</strong><div class="shop-meta">${escapeHtml(i.description||'')}</div></div>
          <button data-avatar-item="${escapeHtml(i.id)}" data-category="${category}" ${disabled?'disabled':''} aria-pressed="${equipped}">${label}</button>
        </div>`;
      }).join('')}</div></section>`;
    }).join('');
    document.querySelectorAll('[data-avatar-item]').forEach(b=>b.onclick=()=>selectAvatarItem(b.dataset.category,b.dataset.avatarItem));
  }catch(e){$('shopItems').textContent='Shop unavailable. Open the shop again to retry.';}
}
async function selectAvatarItem(category,id){
  if(shopActionBusy||!['color','costume'].includes(category))return;
  const free=(category==='color'&&id==='natural')||(category==='costume'&&id==='none');
  const item=shopCatalog.find(i=>i.id===id&&i.item_type===category);
  if(!free&&!item)return;
  if(!free&&(!player.purchased_items.includes(id))&&(player.current_level<item.min_level||player.coins<item.cost))return;
  shopActionBusy=true;
  document.querySelectorAll('[data-avatar-item]').forEach(b=>b.disabled=true);
  try{
    if(!free&&!player.purchased_items.includes(id)){
      player=await rpc('purchase_item',{p_session_token:sessionToken,p_item_id:id});
      updateUI();
    }
    await savePlayer(appearancePatch(category,id));
  }catch(e){alert(e.message);}
  finally{shopActionBusy=false;await renderShop();}
}

async function loadBoard(mode='rush'){
  try{
    const rows=await rpc('get_leaderboard',{p_mode:mode,p_limit:20});
    $('boardBody').innerHTML=(rows||[]).map(r=>`<tr>
      <td><strong>${r.rank}</strong></td>
      <td>${escapeHtml(r.player_name)}</td>
      <td>Level ${r.level}</td>
      <td><strong>${r.score}</strong></td>
      <td>${r.correct}</td>
    </tr>`).join('')||'<tr><td colspan="5">No scores yet. Be the first!</td></tr>';
  }catch{
    $('boardBody').innerHTML='<tr><td colspan="5">Leaderboard unavailable.</td></tr>';
  }
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function logout(){
  try{await rpc('logout_player',{p_session_token:sessionToken});}catch{}
  localStorage.removeItem('cmc_session');
  location.reload();
}

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{
  showPanel(btn.dataset.tab);
});
document.querySelectorAll('[data-number]').forEach(b=>b.onclick=()=>appendAnswer(b.dataset.number));
$('clearAnswer').onclick=clearAnswer;
$('deleteAnswer').onclick=deleteAnswer;
$('skipBtn').onclick=skipOrder;
$('saveStoreName').onclick=saveStoreName;
$('storeNameInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveStoreName();});
$('storeNameInput').addEventListener('input',()=>$('storeNameInput').setCustomValidity(''));
$('createBtn').onclick=createPlayer;
$('loginBtn').onclick=login;
$('serveBtn').onclick=serveOrder;
$('hintBtn').onclick=useHint;
$('rushStart').onclick=startRush;
$('rushSubmit').onclick=rushAnswer;
$('rushQuit').onclick=()=>finishRush('quit');
document.querySelectorAll('[data-rush-key]').forEach(b=>b.onclick=()=>editRushAnswer(b.dataset.rushKey));
$('duckStart').onclick=startDuck;
$('duckQuit').onclick=()=>finishDuck('quit');
$('duckOverBtn').onclick=startDuck;
$('rushBoardBtn').onclick=()=>{
  $('rushBoardBtn').classList.add('active');
  $('duckBoardBtn').classList.remove('active');
  loadBoard('rush');
};
$('duckBoardBtn').onclick=()=>{
  $('duckBoardBtn').classList.add('active');
  $('rushBoardBtn').classList.remove('active');
  loadBoard('duck_dash');
};
$('logoutBtn').onclick=logout;

// hardware keyboard (iPad Smart Keyboard, laptops). The answer box is
// read-only so iPad never slides the software keyboard over the game.
document.addEventListener('keydown',e=>{
  if(rush.active&&!$('rush').classList.contains('hidden')){
    if(e.target.matches('input:not([readonly]),textarea,[contenteditable="true"]'))return;
    if(/^[0-9]$/.test(e.key)){editRushAnswer(e.key);e.preventDefault();}
    else if(e.key==='Backspace'){editRushAnswer('delete');e.preventDefault();}
    else if(e.key==='Enter'){rushAnswer();e.preventDefault();}
    return;
  }
  if(!currentQ)return;
  if(e.key>='0'&&e.key<='9'){appendAnswer(e.key);}
  else if(e.key==='Backspace'){deleteAnswer();e.preventDefault();}
  else if(e.key==='Enter'){serveOrder();}
  else if(e.key==='Escape'){Town.skip();}
});

tryRestore();
