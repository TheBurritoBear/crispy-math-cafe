const SUPABASE_URL='https://msjyijchqjxectlmjmxv.supabase.co';
const SUPABASE_KEY='sb_publishable_CVgkk8nRHbnoiL0cz0mwDQ_0UTx_yuT';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let sessionToken=localStorage.getItem('cmc_session')||'';
let player=null;
let currentQ=null;
let rush={timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:false};
let duck={timer:null,time:60,score:0,correct:0,incorrect:0,target:20,active:false,rowStats:{1:0,2:0,3:0},lanes:{}};

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

function maxFactorForLevel(level){
  if(level<=1) return 5;
  if(level===2) return 9;
  if(level===3) return 12;
  if(level===4) return 16;
  if(level===5) return 20;
  return Math.min(50,20+(level-5)*5);
}
function levelGoal(level){ return level<=3?10:10+(level-3)*5; }
function duckGoalForLevel(){ return 20; }

function makeQ(level,harder=false){
  let max=maxFactorForLevel(level);
  let min=1;
  if(level>=4) min=Math.max(2,Math.floor(max*.2));
  if(harder){
    max=Math.min(50,max+Math.max(2,Math.floor(level*1.5)));
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
  $('duckStatus').textContent='You’re out of hints. Beat the goal to earn +1 and jump back to your order.';
  $('duckStart').focus();
}
function updateUnlockUI(){
  $('duckStart').disabled=duck.active;
  $('duckIntro').textContent='Carnival Duck Dash: tap a moving duck, solve its addition or subtraction problem, and reach 20 points in 60 seconds. Top row = 3 points, middle = 2, bottom = 1. Wrong answers cost 1 point.';
  if(!duck.active){
    $('duckEquation').textContent='Tap Start, then tap any duck to choose a problem.';
  }
  $('duckGoal').textContent=20;
}
function updateUI(){
  const goal=levelGoal(player.current_level);
  $('levelBadge').textContent='Level '+player.current_level;
  $('coinBadge').textContent=player.coins+' coins';
  $('shopCoinCount').textContent=player.coins;
  $('playerLabel').textContent=player.display_name;
  $('hintLabel').textContent='Hints: '+player.hints;
  if(player.hints>0){
    $('hintBtn').innerHTML=`💡 Use hint <span id="hintCountInline">(${player.hints} available)</span>`;
  }else{
    $('hintBtn').textContent='🎯 Earn a hint →';
  }
  $('storeTitle').textContent=player.store_name||'My Chicken Shop';
  $('storeNameEditor').classList.remove('hidden');
  $('storeNameInput').value=player.store_name||'';
  $('progressText').textContent=`${player.level_correct} / ${goal} correct to complete this level`;
  $('progressFill').style.width=Math.min(100,(player.level_correct/goal)*100)+'%';
  $('ordersFilled').textContent=player.total_orders;
  $('streakValue').textContent=player.current_streak;
  $('shopCopy').textContent=player.current_level<=3
    ?`Let’s fill ${goal} correct orders, at your own pace.`
    :`Level ${player.current_level} takes ${goal} correct orders. Keep the kitchen moving!`;
  $('chickenAvatar').dataset.style=player.active_chicken||'plain';
  $('chickenStyleLabel').textContent='Serving '+displayStyleName(player.active_chicken).toLowerCase();
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
    await savePlayer({active_chicken:id});
  }catch(e){alert(e.message);}
}

/* ---------- order ticket, driven by the town map ---------- */
function renderOrder(order){
  currentQ=order;
  const goal=levelGoal(player.current_level);
  $('ticketIcon').textContent=order.icon;
  $('orderCounter').textContent=`ORDER ${Math.min(goal,player.level_correct+1)} OF ${goal}`;
  $('orderPrompt').textContent=`${order.name} wants chicken!`;
  $('orderStory').textContent=`${order.a} boxes. ${order.b} pieces in each box.`;
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

function startRush(){
  clearInterval(rush.timer);
  rush={timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:true};
  $('rushInput').disabled=false;
  $('rushSubmit').disabled=false;
  $('rushStart').disabled=true;
  $('rushMsg').textContent='';
  rushNext();
  renderRush();
  $('rushInput').focus();
  rush.timer=setInterval(async()=>{
    rush.time--;
    renderRush();
    if(rush.time<=0)await finishRush();
  },1000);
}
async function finishRush(){
  clearInterval(rush.timer);
  if(!rush.active)return;
  rush.active=false;
  $('rushInput').disabled=true;
  $('rushSubmit').disabled=true;
  $('rushStart').disabled=false;
  try{
    await rpc('submit_score',{
      p_session_token:sessionToken,p_mode:'rush',p_level:player.current_level,
      p_score:rush.score,p_correct:rush.correct,p_incorrect:rush.incorrect,
      p_duration_seconds:60,p_metadata:{difficulty_max:maxFactorForLevel(player.current_level)}
    });
  }catch(e){}
  $('rushMsg').textContent=`Finished! Score ${rush.score} · ${rush.correct} correct · ${rush.incorrect} incorrect.`;
}
function rushNext(){
  rush.q=makeQ(player.current_level,true);
  $('rushEquation').textContent=`${rush.q.a} × ${rush.q.b} = ?`;
  $('rushInput').value='';
}
function rushAnswer(){
  if(!rush.active)return;
  const val=Number($('rushInput').value);
  if(!Number.isFinite(val))return;
  if(val===rush.q.answer){rush.correct++;rush.score++;}
  else{rush.incorrect++;rush.score--;}
  renderRush();rushNext();$('rushInput').focus();
}
function renderRush(){
  $('rushTime').textContent=rush.time+'s';
  $('rushScore').textContent=rush.score;
}

function duckProblemForRow(row){
  const level=Math.max(1,player?.current_level||1);
  const maxByRow={
    1:Math.min(24,8+level*2),
    2:Math.min(50,16+level*4),
    3:Math.min(90,26+level*6)
  };
  const max=maxByRow[row]||20;
  const isSubtract=Math.random()<0.42;
  if(isSubtract){
    const a=3+Math.floor(Math.random()*Math.max(2,max-2));
    const b=1+Math.floor(Math.random()*Math.max(1,a));
    return {a,b,op:'−',answer:a-b,row,points:row};
  }
  const partMax=Math.max(3,Math.floor(max*.58));
  const a=1+Math.floor(Math.random()*partMax);
  const b=1+Math.floor(Math.random()*partMax);
  return {a,b,op:'+',answer:a+b,row,points:row};
}
function duckProblemText(q){ return `${q.a} ${q.op} ${q.b} = ?`; }
function shuffled(values){
  return [...values].sort(()=>Math.random()-.5);
}
function duckAnswerChoices(answer,row){
  const spread=row===3?7:row===2?5:3;
  const values=new Set([answer]);
  let guard=0;
  while(values.size<3&&guard++<50){
    const delta=1+Math.floor(Math.random()*spread);
    const sign=Math.random()<.5?-1:1;
    values.add(Math.max(0,answer+(delta*sign)));
  }
  while(values.size<3) values.add(answer+values.size+1);
  return shuffled([...values]);
}
function chickenPreviewMarkup(style='plain',mini=false){
  return `<div class="chicken-avatar ${mini?'mini-chicken':''}" data-style="${escapeHtml(style||'plain')}" aria-hidden="true">
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
      <div class="wing wing-left"></div>
      <div class="wing wing-right"></div>
      <div class="tail"></div>
      <div class="legs"><span></span><span></span></div>
    </div>
  </div>`;
}
function buildDuckTarget(row,index,count=3){
  const speed={1:15.5,2:11.5,3:8.5}[row];
  const direction=row===2?'rtl':'ltr';
  const btn=document.createElement('button');
  btn.type='button';
  btn.className=`duck-target row-${row} ${direction}`;
  btn.dataset.row=row;
  btn.style.setProperty('--duck-speed',speed+'s');
  btn.style.setProperty('--duck-delay',(-index*(speed/count))+'s');
  btn.innerHTML=`<span class="duck-icon">🦆</span><span class="duck-answer">0</span><span class="duck-points">+${row}</span>`;
  btn.onclick=()=>shootDuck(btn);
  return btn;
}
function setupDuckLane(row,build=false){
  const q=duckProblemForRow(row);
  const answers=duckAnswerChoices(q.answer,row);
  duck.lanes[row]={q,answers};
  const question=$('duckRow'+row+'Question');
  if(question) question.textContent=duckProblemText(q);
  const lane=$('duckLane'+row);
  if(build||!lane.children.length){
    lane.innerHTML='';
    for(let i=0;i<3;i++) lane.appendChild(buildDuckTarget(row,i,3));
  }
  [...lane.querySelectorAll('.duck-target')].forEach((btn,i)=>{
    const val=answers[i%answers.length];
    btn.dataset.answer=val;
    const answerEl=btn.querySelector('.duck-answer');
    if(answerEl) answerEl.textContent=val;
  });
}
function populateDuckLanes(){
  [3,2,1].forEach(row=>setupDuckLane(row,true));
}
function pulseDuck(btn,kind){
  btn.classList.remove('hit','miss');
  void btn.offsetWidth;
  btn.classList.add(kind);
  setTimeout(()=>btn.classList.remove(kind),320);
}
async function shootDuck(btn){
  if(!duck.active)return;
  const row=Number(btn.dataset.row)||1;
  const lane=duck.lanes[row];
  if(!lane)return;
  const val=Number(btn.dataset.answer);
  const correct=val===lane.q.answer;
  if(correct){
    duck.correct++;
    duck.score+=row;
    duck.rowStats[row]++;
    pulseDuck(btn,'hit');
    $('duckStatus').textContent=`Bingo! +${row} point${row===1?'':'s'} from row ${row}.`;
    setupDuckLane(row,false);
  }else{
    duck.incorrect++;
    duck.score=Math.max(0,duck.score-1);
    pulseDuck(btn,'miss');
    $('duckStatus').textContent=`Miss! ${duckProblemText(lane.q).replace(' = ?','')} = ${lane.q.answer}. −1 point.`;
  }
  renderDuck();
  if(duck.score>=duck.target) await finishDuck(true);
}
function startDuck(){
  clearInterval(duck.timer);
  duck={
    timer:null,time:60,score:0,correct:0,incorrect:0,target:20,
    active:true,rowStats:{1:0,2:0,3:0},lanes:{}
  };
  $('duckStart').disabled=true;
  $('duckTime').textContent='60s';
  $('duckScore').textContent='0';
  $('duckGoal').textContent='20';
  $('duckEquation').textContent='Tap the duck carrying the correct answer. Ducks never stop moving.';
  $('duckStatus').textContent='Go! Pick any row. Higher rows are faster and worth more.';
  populateDuckLanes();
  renderDuck();
  duck.timer=setInterval(async()=>{
    duck.time--;
    renderDuck();
    if(duck.time<=0) await finishDuck(false);
  },1000);
}
async function finishDuck(success){
  clearInterval(duck.timer);
  if(!duck.active)return;
  duck.active=false;
  document.querySelectorAll('.duck-target').forEach(d=>d.classList.add('game-over'));
  $('duckStart').disabled=false;
  const elapsed=Math.max(1,60-duck.time);
  try{
    await rpc('submit_score',{
      p_session_token:sessionToken,p_mode:'duck_dash',p_level:player.current_level,
      p_score:duck.score,p_correct:duck.correct,p_incorrect:duck.incorrect,
      p_duration_seconds:elapsed,
      p_metadata:{earned_hint:success,target:20,time_left:duck.time,row_stats:duck.rowStats,control:'one_tap_ducks'}
    });
  }catch(e){}
  if(success){
    await savePlayer({hints:player.hints+1});
    $('duckStatus').textContent=`20 points! Hint earned 🎉 Returning to the map…`;
    setTimeout(()=>showPanel('orders'),1100);
  }else{
    $('duckStatus').textContent=`Time! You scored ${duck.score}/20. Tap Start to try again.`;
  }
}
function renderDuck(){
  $('duckTime').textContent=duck.time+'s';
  $('duckScore').textContent=duck.score;
  $('duckGoal').textContent=20;
}


async function renderShop(){
  $('shopCoinCount').textContent=player.coins;
  try{
    const items=await rpc('get_shop_items');
    $('shopItems').innerHTML=items.map(i=>{
      const owned=player.purchased_items.includes(i.id);
      const locked=player.current_level<i.min_level;
      const equipped=player.active_chicken===i.id;
      let button='';
      if(owned){
        button=`<button data-equip="${i.id}" class="${equipped?'secondary':''}">${equipped?'Equipped':'Equip'}</button>`;
      }else{
        const label=locked?`Unlock after Level ${i.min_level-1}`:`${i.cost} coins`;
        button=`<button data-buy="${i.id}" ${locked?'disabled':''}>${label}</button>`;
      }
      return `<div class="shopItem">
        <div class="preview chicken-shop-preview">${chickenPreviewMarkup(i.id,true)}</div>
        <div>
          <strong>${i.display_name}</strong>
          <div class="shop-meta">${i.description||''}</div>
        </div>
        ${button}
      </div>`;
    }).join('')||'<p>No shop items yet.</p>';
    document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buyItem(b.dataset.buy));
    document.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>equipPurchased(b.dataset.equip));
  }catch(e){$('shopItems').textContent='Shop unavailable.';}
}
async function buyItem(id){
  try{
    player=await rpc('purchase_item',{p_session_token:sessionToken,p_item_id:id});
    await savePlayer({active_chicken:id});
    renderShop();
  }catch(e){alert(e.message);}
}
async function equipPurchased(id){
  if(!player.purchased_items.includes(id))return;
  try{await savePlayer({active_chicken:id});renderShop();}
  catch(e){alert(e.message);}
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
$('createBtn').onclick=createPlayer;
$('loginBtn').onclick=login;
$('serveBtn').onclick=serveOrder;
$('hintBtn').onclick=useHint;
$('rushStart').onclick=startRush;
$('rushSubmit').onclick=rushAnswer;
$('rushInput').addEventListener('keydown',e=>{if(e.key==='Enter')rushAnswer();});
$('duckStart').onclick=startDuck;
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
  if(!currentQ)return;
  if(e.key>='0'&&e.key<='9'){appendAnswer(e.key);}
  else if(e.key==='Backspace'){deleteAnswer();e.preventDefault();}
  else if(e.key==='Enter'){serveOrder();}
  else if(e.key==='Escape'){Town.skip();}
});

tryRestore();
