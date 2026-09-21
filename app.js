const SUPABASE_URL='https://msjyijchqjxectlmjmxv.supabase.co';
const SUPABASE_KEY='sb_publishable_CVgkk8nRHbnoiL0cz0mwDQ_0UTx_yuT';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let sessionToken=localStorage.getItem('cmc_session')||'';
let player=null;
let currentQ=null;
let rush={timer:null,time:60,score:0,correct:0,incorrect:0,q:null,active:false};
let duck={timer:null,time:30,score:0,correct:0,incorrect:0,target:5,q:null,active:false};

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
function duckGoalForLevel(level){ return 5+Math.min(7,Math.floor((level-2)/2)); }

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
function chickenEmoji(id){
  if(id==='halloween_chicken') return '🎃';
  if(id==='firecracker') return '🐔💥';
  if(id==='gochujang') return '🐔🔥';
  if(id==='golden_garlic') return '🐔✨';
  return '🐔';
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
  nextOrder();
  renderShop();
}
function updateUnlockUI(){
  const unlocked=player.current_level>=2;
  $('duckTab').classList.toggle('locked',!unlocked);
  $('duckStart').disabled=!unlocked||duck.active;
  $('duckIntro').textContent=unlocked
    ?'Beat the goal before time runs out to earn +1 hint. Difficulty scales with your level.'
    :'Finish Level 1 to unlock this game.';
  if(!unlocked&&!duck.active){
    $('duckEquation').textContent='Locked';
    $('duckStatus').textContent='Complete Level 1 to unlock.';
  }
  $('duckGoal').textContent=duckGoalForLevel(player.current_level);
}
function updateUI(){
  const goal=levelGoal(player.current_level);
  $('levelBadge').textContent='Level '+player.current_level;
  $('coinBadge').textContent=player.coins+' coins';
  $('shopCoinCount').textContent=player.coins;
  $('playerLabel').textContent=player.display_name;
  $('hintLabel').textContent='Hints: '+player.hints;
  $('hintCountInline').textContent='('+player.hints+' available)';
  $('storeTitle').textContent=player.store_name||'My Chicken Shop';
  $('progressText').textContent=`${player.level_correct} / ${goal} correct to complete this level`;
  $('progressFill').style.width=Math.min(100,(player.level_correct/goal)*100)+'%';
  $('ordersFilled').textContent=player.total_orders;
  $('streakValue').textContent=player.current_streak;
  $('shopCopy').textContent=player.current_level<=3
    ?`Let’s fill ${goal} correct orders, at your own pace.`
    :`Level ${player.current_level} takes ${goal} correct orders. Keep the kitchen moving!`;
  $('chickenAvatar').textContent=chickenEmoji(player.active_chicken);
  $('chickenAvatar').dataset.style=player.active_chicken;
  $('chickenStyleLabel').textContent='Serving '+displayStyleName(player.active_chicken).toLowerCase();
  const next=sauces.find(s=>s.level>player.current_level);
  $('nextUnlockText').textContent=next
    ?`Complete level ${next.level-1}: unlock ${next.name}`
    :'All sauce styles unlocked!';
  renderSauces();
  updateUnlockUI();
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
function nextOrder(){
  currentQ=makeQ(player.current_level);
  const goal=levelGoal(player.current_level);
  $('orderCounter').textContent=`ORDER ${Math.min(goal,player.level_correct+1)} OF ${goal}`;
  $('equation').textContent=`${currentQ.a} × ${currentQ.b} = ?`;
  $('orderStory').textContent=`${currentQ.a} boxes. ${currentQ.b} pieces in each box.`;
  $('orderQuestion').textContent='How many pieces altogether?';
  $('answerInput').value='';
  $('feedback').textContent='';
  $('feedback').className='feedback';
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
  const raw=$('answerInput').value.trim();
  if(raw==='')return;
  const val=Number(raw);
  if(!Number.isFinite(val))return;
  $('serveBtn').disabled=true;
  const correct=val===currentQ.answer;
  let lvl=player.current_level,lc=player.level_correct,coins=player.coins,streak=player.current_streak;
  let levelUp=false;
  if(correct){
    lc++;coins++;streak++;
    if(lc>=levelGoal(lvl)){lvl++;lc=0;levelUp=true;}
    $('feedback').textContent=levelUp?'✓ Correct! Level up! 🎉':'✓ Correct!';
    $('feedback').className='feedback good';
  }else{
    streak=0;
    $('feedback').textContent=`Not quite · ${currentQ.a} × ${currentQ.b} = ${currentQ.answer}`;
    $('feedback').className='feedback bad';
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
      nextOrder();
      $('serveBtn').disabled=false;
      renderShop();
    },correct?520:900);
  }catch(e){
    $('serveBtn').disabled=false;
    setMsg($('feedback'),e.message);
  }
}
async function useHint(){
  if(player.hints<=0){
    $('feedback').textContent='No hints left. Earn more in the Hint Game.';
    $('feedback').className='feedback bad';
    return;
  }
  $('feedback').textContent=`Hint: count ${currentQ.a} groups of ${currentQ.b}. Try skip-counting by ${currentQ.b}s.`;
  $('feedback').className='feedback good';
  await savePlayer({hints:player.hints-1});
}
function skipOrder(){nextOrder();}
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

function startDuck(){
  if(player.current_level<2)return;
  clearInterval(duck.timer);
  duck={
    timer:null,time:30,score:0,correct:0,incorrect:0,
    target:duckGoalForLevel(player.current_level),q:null,active:true
  };
  $('duckInput').disabled=false;
  $('duckSubmit').disabled=false;
  $('duckStart').disabled=true;
  $('duckGoal').textContent=duck.target;
  $('duckStatus').textContent='Go! Reach the goal before time runs out.';
  duckNext();renderDuck();$('duckInput').focus();
  duck.timer=setInterval(async()=>{
    duck.time--;
    renderDuck();
    if(duck.time<=0)await finishDuck(false);
  },1000);
}
function duckNext(){
  duck.q=makeQ(player.current_level,true);
  $('duckEquation').textContent=`${duck.q.a} × ${duck.q.b} = ?`;
  $('duckInput').value='';
}
async function duckAnswer(){
  if(!duck.active)return;
  const val=Number($('duckInput').value);
  if(!Number.isFinite(val))return;
  if(val===duck.q.answer){duck.correct++;duck.score+=2;}
  else{duck.incorrect++;duck.score=Math.max(0,duck.score-1);}
  renderDuck();
  if(duck.correct>=duck.target)await finishDuck(true);
  else{duckNext();$('duckInput').focus();}
}
async function finishDuck(success){
  clearInterval(duck.timer);
  if(!duck.active)return;
  duck.active=false;
  $('duckInput').disabled=true;
  $('duckSubmit').disabled=true;
  $('duckStart').disabled=player.current_level<2;
  const finalScore=duck.score+(success?duck.time:0);
  try{
    await rpc('submit_score',{
      p_session_token:sessionToken,p_mode:'duck_dash',p_level:player.current_level,
      p_score:finalScore,p_correct:duck.correct,p_incorrect:duck.incorrect,
      p_duration_seconds:30-duck.time,
      p_metadata:{earned_hint:success,target:duck.target,time_left:duck.time}
    });
  }catch(e){}
  if(success){
    await savePlayer({hints:player.hints+1});
    $('duckStatus').textContent=`Hint earned! 🎉 Final score ${finalScore}.`;
  }else{
    $('duckStatus').textContent=`Time! You got ${duck.correct}/${duck.target}. Try again for the hint.`;
  }
  $('duckScore').textContent=finalScore;
}
function renderDuck(){
  $('duckTime').textContent=duck.time+'s';
  $('duckScore').textContent=duck.score;
  $('duckGoal').textContent=duck.target;
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
        <div class="preview">${i.id==='halloween_chicken'?'🎃🐔':'🐔'}</div>
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
  if(btn.dataset.tab==='duck'&&player.current_level<2){
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'));
    $('duck').classList.remove('hidden');
    updateUnlockUI();
    return;
  }
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'));
  $(btn.dataset.tab).classList.remove('hidden');
  if(btn.dataset.tab==='leaderboard')loadBoard('rush');
  if(btn.dataset.tab==='shop')renderShop();
});
document.querySelectorAll('[data-number]').forEach(b=>b.onclick=()=>appendAnswer(b.dataset.number));
$('clearAnswer').onclick=clearAnswer;
$('deleteAnswer').onclick=deleteAnswer;
$('skipBtn').onclick=skipOrder;
$('createBtn').onclick=createPlayer;
$('loginBtn').onclick=login;
$('serveBtn').onclick=serveOrder;
$('hintBtn').onclick=useHint;
$('answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')serveOrder();});
$('rushStart').onclick=startRush;
$('rushSubmit').onclick=rushAnswer;
$('rushInput').addEventListener('keydown',e=>{if(e.key==='Enter')rushAnswer();});
$('duckStart').onclick=startDuck;
$('duckSubmit').onclick=duckAnswer;
$('duckInput').addEventListener('keydown',e=>{if(e.key==='Enter')duckAnswer();});
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
tryRestore();