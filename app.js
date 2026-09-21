const SUPABASE_URL='https://msjyijchqjxectlmjmxv.supabase.co';
const SUPABASE_KEY='sb_publishable_CVgkk8nRHbnoiL0cz0mwDQ_0UTx_yuT';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let sessionToken=localStorage.getItem('cmc_session')||'';
let player=null;
let currentQ=null;
let rush={timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:false};
let duck={correct:0,target:5,q:null,active:false};

const $=id=>document.getElementById(id);

function maxFactorForLevel(level){
  if(level<=1) return 5;
  if(level===2) return 9;
  if(level===3) return 12;
  if(level===4) return 20;
  return Math.min(50,20+(level-4)*5);
}
function levelGoal(level){ return level<=3?10:10+(level-3)*5; }
function makeQ(level,harder=false){
  const max=maxFactorForLevel(level)+(harder?Math.min(10,level*2):0);
  const a=1+Math.floor(Math.random()*Math.max(2,max));
  const b=1+Math.floor(Math.random()*Math.max(2,max));
  return {a,b,answer:a*b};
}
function setMsg(el,msg,good=false){ el.textContent=msg; el.className=good?'msg good':'msg bad'; }

async function rpc(name,args={}){
  const {data,error}=await sb.rpc(name,args);
  if(error) throw error;
  return data;
}

async function createPlayer(){
  const name=$('playerName').value.trim(), code=$('saveCode').value.trim();
  try{
    const data=await rpc('create_player',{p_name:name,p_save_code:code});
    sessionToken=data.session_token; localStorage.setItem('cmc_session',sessionToken);
    player=data.player; enterGame();
  }catch(e){ setMsg($('authMsg'),e.message); }
}
async function login(){
  const name=$('playerName').value.trim(), code=$('saveCode').value.trim();
  try{
    const data=await rpc('login_player',{p_name:name,p_save_code:code});
    sessionToken=data.session_token; localStorage.setItem('cmc_session',sessionToken);
    player=data.player; enterGame();
  }catch(e){ setMsg($('authMsg'),e.message); }
}
async function tryRestore(){
  if(!sessionToken) return;
  try{ player=await rpc('load_player',{p_session_token:sessionToken}); enterGame(); }
  catch{ localStorage.removeItem('cmc_session'); sessionToken=''; }
}
function enterGame(){
  $('authCard').classList.add('hidden'); $('gameApp').classList.remove('hidden');
  updateUI(); nextOrder(); renderShop();
}
function updateUI(){
  $('levelBadge').textContent='Level '+player.current_level;
  $('coinBadge').textContent=player.coins+' coins';
  $('playerLabel').textContent=player.display_name;
  $('hintLabel').textContent='Hints: '+player.hints;
  $('storeTitle').textContent=player.store_name||'My Chicken Shop';
  $('progressText').textContent=`${player.level_correct} / ${levelGoal(player.current_level)} correct to complete this level`;
}
function nextOrder(){
  currentQ=makeQ(player.current_level);
  $('equation').textContent=`${currentQ.a} × ${currentQ.b} = ?`;
  $('answerInput').value=''; $('feedback').textContent='';
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
  player=await rpc('save_progress',args); updateUI();
}
async function serveOrder(){
  const val=Number($('answerInput').value);
  if(!Number.isFinite(val)) return;
  const correct=val===currentQ.answer;
  let lvl=player.current_level, lc=player.level_correct, coins=player.coins, streak=player.current_streak;
  if(correct){
    lc++; coins++; streak++;
    $('feedback').textContent='✓ Correct!'; $('feedback').className='feedback good';
    if(lc>=levelGoal(lvl)){ lvl++; lc=0; $('feedback').textContent='✓ Correct! Level up!'; }
  }else{
    streak=0; $('feedback').textContent='Not quite. '+currentQ.answer; $('feedback').className='feedback bad';
  }
  await savePlayer({
    current_level:lvl,level_correct:lc,coins,
    total_correct:player.total_correct+(correct?1:0),
    total_incorrect:player.total_incorrect+(correct?0:1),
    total_orders:player.total_orders+1,
    current_streak:streak,
    best_streak:Math.max(player.best_streak,streak)
  });
  setTimeout(nextOrder,450);
}
function useHint(){
  if(player.hints<=0){ $('feedback').textContent='No hints left. Earn more in Duck Dash.'; return; }
  $('feedback').textContent=`Hint: ${currentQ.a} groups of ${currentQ.b}. Count by ${currentQ.b}s.`;
  savePlayer({hints:player.hints-1});
}

function startRush(){
  clearInterval(rush.timer); rush={timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:true};
  $('rushInput').disabled=false; $('rushSubmit').disabled=false; $('rushStart').disabled=true;
  rushNext(); renderRush();
  rush.timer=setInterval(async()=>{
    rush.time--; renderRush();
    if(rush.time<=0){
      clearInterval(rush.timer); rush.active=false; $('rushInput').disabled=true; $('rushSubmit').disabled=true; $('rushStart').disabled=false;
      try{ await rpc('submit_score',{p_session_token:sessionToken,p_mode:'rush',p_level:player.current_level,p_score:rush.score,p_correct:rush.correct,p_incorrect:rush.incorrect,p_duration_seconds:60,p_metadata:{}}); }catch(e){}
      $('rushMsg').textContent=`Finished! Score ${rush.score}.`;
    }
  },1000);
}
function rushNext(){ rush.q=makeQ(player.current_level,true); $('rushEquation').textContent=`${rush.q.a} × ${rush.q.b} = ?`; $('rushInput').value=''; $('rushInput').focus(); }
function rushAnswer(){
  if(!rush.active) return;
  const val=Number($('rushInput').value); if(!Number.isFinite(val)) return;
  if(val===rush.q.answer){rush.correct++;rush.score++;}else{rush.incorrect++;rush.score--;}
  renderRush(); rushNext();
}
function renderRush(){ $('rushTime').textContent=rush.time+'s'; $('rushScore').textContent='Score '+rush.score; }

function startDuck(){
  duck={correct:0,target:5,q:null,active:true}; $('duckInput').disabled=false; $('duckSubmit').disabled=false; $('duckStart').disabled=true; duckNext(); renderDuck();
}
function duckNext(){ duck.q=makeQ(player.current_level,true); $('duckEquation').textContent=`${duck.q.a} × ${duck.q.b} = ?`; $('duckInput').value=''; $('duckInput').focus(); }
async function duckAnswer(){
  if(!duck.active) return;
  const val=Number($('duckInput').value); if(!Number.isFinite(val)) return;
  if(val===duck.q.answer) duck.correct++; else duck.correct=Math.max(0,duck.correct-1);
  if(duck.correct>=duck.target){
    duck.active=false; $('duckInput').disabled=true; $('duckSubmit').disabled=true; $('duckStart').disabled=false;
    await savePlayer({hints:player.hints+1});
    try{ await rpc('submit_score',{p_session_token:sessionToken,p_mode:'duck_dash',p_level:player.current_level,p_score:duck.correct,p_correct:duck.correct,p_incorrect:0,p_duration_seconds:0,p_metadata:{earned_hint:true}}); }catch(e){}
    $('duckStatus').textContent='Hint earned! 🎉';
  }else{ renderDuck(); duckNext(); }
}
function renderDuck(){ $('duckStatus').textContent=`${duck.correct} / ${duck.target} correct`; }

async function renderShop(){
  try{
    const items=await rpc('get_shop_items');
    $('shopItems').innerHTML=items.map(i=>{
      const owned=player.purchased_items.includes(i.id);
      const locked=player.current_level<i.min_level;
      const label=owned?'Owned':locked?`Unlock at Level ${i.min_level}`:`${i.cost} coins`;
      return `<div class="shopItem"><div><strong>${i.display_name}</strong><div>${i.description||''}</div></div><button data-buy="${i.id}" ${owned||locked?'disabled':''}>${label}</button></div>`;
    }).join('');
    document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buyItem(b.dataset.buy));
  }catch(e){ $('shopItems').textContent='Shop unavailable.'; }
}
async function buyItem(id){
  try{ player=await rpc('purchase_item',{p_session_token:sessionToken,p_item_id:id}); updateUI(); renderShop(); }
  catch(e){ alert(e.message); }
}
async function loadBoard(mode='rush'){
  try{
    const rows=await rpc('get_leaderboard',{p_mode:mode,p_limit:20});
    $('boardBody').innerHTML=(rows||[]).map(r=>`<tr><td>${r.rank}</td><td>${r.player_name}</td><td>${r.level}</td><td>${r.score}</td></tr>`).join('')||'<tr><td colspan="4">No scores yet.</td></tr>';
  }catch{ $('boardBody').innerHTML='<tr><td colspan="4">Leaderboard unavailable.</td></tr>'; }
}
async function logout(){
  try{ await rpc('logout_player',{p_session_token:sessionToken}); }catch{}
  localStorage.removeItem('cmc_session'); location.reload();
}

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden')); $(btn.dataset.tab).classList.remove('hidden');
  if(btn.dataset.tab==='leaderboard') loadBoard('rush');
  if(btn.dataset.tab==='shop') renderShop();
});
$('createBtn').onclick=createPlayer; $('loginBtn').onclick=login; $('serveBtn').onclick=serveOrder; $('hintBtn').onclick=useHint;
$('answerInput').addEventListener('keydown',e=>{if(e.key==='Enter') serveOrder();});
$('rushStart').onclick=startRush; $('rushSubmit').onclick=rushAnswer; $('rushInput').addEventListener('keydown',e=>{if(e.key==='Enter') rushAnswer();});
$('duckStart').onclick=startDuck; $('duckSubmit').onclick=duckAnswer; $('duckInput').addEventListener('keydown',e=>{if(e.key==='Enter') duckAnswer();});
$('rushBoardBtn').onclick=()=>loadBoard('rush'); $('duckBoardBtn').onclick=()=>loadBoard('duck_dash'); $('logoutBtn').onclick=logout;
tryRestore();