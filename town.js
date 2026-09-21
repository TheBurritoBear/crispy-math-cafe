/* ==========================================================
   Crispy Math Café — town map module
   Owns: the map, the growing world, and which building is
   currently asking for chicken.
   Does NOT own: question difficulty, scoring, coins, saving.
   Those stay in app.js and are passed in via init().
   ========================================================== */

const Town = (function(){
  'use strict';

  const BUILDINGS = [
    // tier 1 — the first little village
    {id:'bakery', name:'Bakery',      icon:'🥐', x:50, y:28, roof:'#B7301F', tier:1},
    {id:'green',  name:'Green House', icon:'🏡', x:28, y:50, roof:'#1C5C3A', tier:1},
    {id:'blue',   name:'Blue House',  icon:'🏠', x:72, y:50, roof:'#2A7F8C', tier:1},
    {id:'pets',   name:'Pet Shop',    icon:'🐶', x:50, y:72, roof:'#D08A1E', tier:1},
    // tier 2 — the corners fill in
    {id:'school', name:'School',      icon:'🏫', x:25, y:25, roof:'#2F6DA8', tier:2},
    {id:'lib',    name:'Library',     icon:'📚', x:75, y:25, roof:'#6B4A2E', tier:2},
    {id:'fire',   name:'Fire House',  icon:'🚒', x:25, y:75, roof:'#8F1D14', tier:2},
    {id:'kara',   name:'Noraebang',   icon:'🎤', x:75, y:75, roof:'#C2426E', tier:2},
    // tier 3 — the outer streets
    {id:'arcade', name:'Arcade',      icon:'🕹️', x:50, y:15, roof:'#4A3E8C', tier:3},
    {id:'flower', name:'Flowers',     icon:'💐', x:15, y:50, roof:'#9B4B8F', tier:3},
    {id:'dentist',name:'Dentist',     icon:'🦷', x:85, y:50, roof:'#3D8C7A', tier:3},
    {id:'toys',   name:'Toy Store',   icon:'🧸', x:50, y:85, roof:'#E0782A', tier:3},
    // tier 4 — the far valley
    {id:'bank',   name:'Bank',        icon:'🏦', x:8,  y:27,  roof:'#4F5B7A', tier:4},
    {id:'hotel',  name:'Hotel',       icon:'🏨', x:92, y:27,  roof:'#A03E6E', tier:4},
    {id:'post',   name:'Post Office', icon:'📮', x:8,  y:86, roof:'#1F6FA8', tier:4},
    {id:'bus',    name:'Bus Depot',   icon:'🚌', x:92, y:86, roof:'#7A5C2E', tier:4}
  ];

  // from / until = which tiers this scenery is visible for
  const TERRAIN = [
    // empty lots, waiting to be built on next tier
    {k:'e',e:'🌳',x:25,y:25,from:1,until:1}, {k:'e',e:'🌳',x:75,y:25,from:1,until:1},
    {k:'e',e:'🌳',x:25,y:75,from:1,until:1}, {k:'e',e:'🌳',x:75,y:75,from:1,until:1},
    {k:'e',e:'🌲',x:50,y:15,from:2,until:2}, {k:'e',e:'🌲',x:15,y:50,from:2,until:2},
    {k:'e',e:'🌲',x:85,y:50,from:2,until:2}, {k:'e',e:'🌲',x:50,y:85,from:2,until:2},
    {k:'e',e:'🌲',x:8, y:27,from:3,until:3}, {k:'e',e:'🌲',x:92,y:27,from:3,until:3},
    {k:'e',e:'🌲',x:8, y:86,from:3,until:3}, {k:'e',e:'🌲',x:92,y:86,from:3,until:3},
    // street life
    {k:'e',e:'🚗',x:50,y:35.5,from:1}, {k:'e',e:'🌷',x:43,y:43,from:1},
    {k:'e',e:'🚲',x:61.5,y:57,from:1}, {k:'e',e:'🐕',x:57,y:61.5,from:2},
    {k:'e',e:'🚕',x:18,y:40,from:2},   {k:'e',e:'🛴',x:79,y:66,from:3},
    // tier 3 — lake and woods
    {k:'lake',x:88,y:70,w:20,h:15,from:3},
    {k:'e',e:'🦆',x:85,y:68,from:3},   {k:'e',e:'🪷',x:92,y:73,from:3},
    {k:'e',e:'🌲',x:11,y:68,from:3},   {k:'e',e:'🌲',x:16,y:72,from:3},
    {k:'e',e:'🌲',x:7, y:74,from:3},
    // tier 4 — mountains north, river south
    {k:'mountains',from:4},
    {k:'e',e:'🦅',x:27,y:15,from:4},   {k:'e',e:'⛺',x:70,y:15.5,from:4},
    {k:'river',from:4},                {k:'bridge',from:4},
    {k:'e',e:'🐟',x:22,y:96,from:4},   {k:'e',e:'🛶',x:74,y:96,from:4},
    {k:'e',e:'🌾',x:35,y:91,from:4},   {k:'e',e:'🌾',x:63,y:91,from:4}
  ];

  const TIERS = [
    {name:'Crispy Village', zoom:1.00, blurb:'a quiet little village'},
    {name:'Crispy Town',    zoom:0.88, blurb:'the corners filled in'},
    {name:'Crispy City',    zoom:0.70, blurb:'a lake and the woods appeared'},
    {name:'Crispy Valley',  zoom:0.625,blurb:'mountains and a river!'}
  ];

  let opts = {};
  let tier = 0;
  let delivered = 0;
  let orders = {};        // buildingId -> {a,b,answer}
  let activeId = null;
  let nodes = {};
  let spawnTimer = null;
  let started = false;

  const $ = id => document.getElementById(id);
  const byId = id => BUILDINGS.find(b => b.id === id) || null;
  const rnd = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
  const live = () => BUILDINGS.filter(b => b.tier <= tier);
  const waitingCount = () => Object.keys(orders).length;
  const maxOrders = () => Math.min(2 + tier, 5);

  /* ---------- building + terrain rendering ---------- */

  function addBuilding(b, animate){
    const el = document.createElement('button');
    el.className = 'tb-bldg' + (animate ? ' is-new' : '');
    el.type = 'button';
    el.style.setProperty('--x', b.x + '%');
    el.style.setProperty('--y', b.y + '%');
    el.style.setProperty('--roof', b.roof);
    el.setAttribute('aria-label', b.name + ' — no order yet');
    el.innerHTML =
      '<span class="tb-bubble" aria-hidden="true">🍗</span>' +
      '<span class="tb-roof" aria-hidden="true"></span>' +
      '<span class="tb-body">' +
        '<span class="tb-icon" aria-hidden="true">' + b.icon + '</span>' +
        '<span class="tb-name">' + b.name + '</span>' +
        '<span class="tb-door" aria-hidden="true"></span>' +
      '</span>';
    el.addEventListener('click', () => tapBuilding(b.id));
    $('townWorld').appendChild(el);
    nodes[b.id] = el;
  }

  function renderTerrain(){
    const layer = $('townTerrain');
    layer.innerHTML = '';
    TERRAIN.forEach(t => {
      if (tier < t.from) return;
      if (t.until != null && tier > t.until) return;
      const el = document.createElement('div');
      if (t.k === 'e'){
        el.className = 'tb-deco';
        el.textContent = t.e;
        el.style.left = t.x + '%';
        el.style.top = t.y + '%';
      } else if (t.k === 'lake'){
        el.className = 'tb-lake';
        el.style.left = t.x + '%'; el.style.top = t.y + '%';
        el.style.width = t.w + '%'; el.style.height = t.h + '%';
      } else if (t.k === 'mountains'){
        el.className = 'tb-mountains';
        el.innerHTML =
          [72,95,64,100,80,58,90,74].map(h => '<div class="tb-mtn" style="height:' + h + '%"></div>').join('');
      } else if (t.k === 'river'){ el.className = 'tb-river'; }
      else if (t.k === 'bridge'){ el.className = 'tb-bridge'; }
      layer.appendChild(el);
    });
  }

  function tierForLevel(level){ return Math.min(4, Math.floor((Math.max(1,level) - 1) / 2) + 1); }

  function applyTier(next, announce){
    const grew = next > tier;
    tier = next;
    const t = TIERS[tier - 1];
    $('townWorld').style.setProperty('--town-zoom', t.zoom);
    $('townWorld').dataset.tier = tier; // bigger labels as the camera zooms out (town.css)
    $('townTierName').textContent = t.name;
    renderTerrain();
    live().forEach(b => { if (!nodes[b.id]) addBuilding(b, grew); });
    if (grew && announce) banner('Welcome to ' + t.name + '!', t.blurb);
  }

  /* ---------- little bits of feedback ---------- */

  function toast(msg){
    const el = $('townToast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2100);
  }

  function banner(title, sub){
    const el = $('townBanner');
    el.innerHTML = '<b>' + title + '</b><span>' + sub + '</span>';
    el.classList.add('show');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function paintStrip(){
    const strip = $('townStrip');
    const n = waitingCount();
    strip.classList.toggle('is-live', n > 0);
    $('townCount').textContent = delivered + ' delivered';
    if (n === 0)      $('townStripText').textContent = 'No orders right now — the phone will ring soon.';
    else if (n === 1) $('townStripText').textContent = '1 order waiting · tap the place that’s calling.';
    else              $('townStripText').textContent = n + ' orders waiting! Pick any one with a bubble.';
    renderWaiting();
  }

  function renderWaiting(){
    const list = $('townWaiting');
    if (!list) return;
    const ids = Object.keys(orders);
    list.innerHTML = '';
    ids.forEach(id => {
      const b = byId(id);
      const btn = document.createElement('button');
      btn.className = 'town-wait-btn';
      btn.type = 'button';
      btn.innerHTML = '<span class="em" aria-hidden="true">' + b.icon + '</span>' +
                      '<span>' + b.name + '<small>is waiting for chicken</small></span>';
      btn.addEventListener('click', () => openTicket(id));
      list.appendChild(btn);
    });
  }

  /* ---------- orders ---------- */

  function spawnOrder(){
    if (waitingCount() >= maxOrders()) return;
    const free = live().filter(b => !orders[b.id]);
    if (!free.length) return;
    const b = free[rnd(0, free.length - 1)];
    const q = opts.makeQuestion();
    orders[b.id] = {a:q.a, b:q.b, answer:q.answer};
    nodes[b.id].classList.add('is-ordering');
    nodes[b.id].setAttribute('aria-label', b.name + ' — order waiting! Tap to take it.');
    toast('📞 ' + b.name + ' is calling!');
    paintStrip();
  }

  function scheduleNext(){
    clearTimeout(spawnTimer);
    spawnTimer = setTimeout(() => { spawnOrder(); scheduleNext(); }, rnd(2600, 5200));
  }

  function tapBuilding(id){
    const b = byId(id), el = nodes[id];
    if (!orders[id]){
      el.classList.remove('is-nope');
      void el.offsetWidth;
      el.classList.add('is-nope');
      toast(b.name + ' isn’t hungry yet 😴');
      return;
    }
    openTicket(id);
  }

  function orderPayload(id){
    const b = byId(id), o = orders[id];
    return {buildingId:id, name:b.name, icon:b.icon, a:o.a, b:o.b, answer:o.answer};
  }

  function openTicket(id){
    if (!orders[id]) return;
    if (activeId && nodes[activeId]) nodes[activeId].classList.remove('is-picked');
    activeId = id;
    nodes[id].classList.add('is-picked');
    if (opts.onOpen) opts.onOpen(orderPayload(id));
  }

  function closeTicket(){
    if (activeId && nodes[activeId]) nodes[activeId].classList.remove('is-picked');
    activeId = null;
    if (opts.onClose) opts.onClose();
    paintStrip();
  }

  function deliver(id){
    const el = nodes[id], b = byId(id), scooter = $('townScooter');
    scooter.style.transition = 'none';
    scooter.style.left = '50%';
    scooter.style.top = '50%';
    scooter.style.opacity = '1';
    void scooter.offsetWidth;
    scooter.style.transition = 'left .8s ease-in-out, top .8s ease-in-out, opacity .2s';
    scooter.style.left = b.x + '%';
    scooter.style.top = b.y + '%';
    setTimeout(() => {
      scooter.style.opacity = '0';
      el.classList.add('is-served');
      setTimeout(() => el.classList.remove('is-served'), 900);
    }, 850);
  }

  /* ---------- public API ---------- */

  function init(options){
    opts = options || {};
    if (started) return;
    started = true;
    applyTier(tierForLevel(opts.level || 1), false);
    paintStrip();
    const closeBtn = $('townTicketClose');
    if (closeBtn) closeBtn.addEventListener('click', closeTicket);
    const host = $('orderTicketHost');
    if (host) host.addEventListener('click', e => { if (e.target === host) closeTicket(); });
    setTimeout(spawnOrder, 1400);
    scheduleNext();
  }

  // called from updateUI() whenever the player's level may have changed
  function setLevel(level){
    if (!started) return;
    const next = tierForLevel(level);
    if (next > tier) applyTier(next, true);
  }

  // the answer was right: fly the scooter over, clear the bubble, close up
  function complete(id){
    if (!id || !orders[id]) { closeTicket(); return; }
    const b = byId(id);
    delete orders[id];
    delivered++;
    nodes[id].classList.remove('is-ordering', 'is-picked');
    nodes[id].setAttribute('aria-label', b.name + ' — no order yet');
    activeId = null;
    if (opts.onClose) opts.onClose();
    deliver(id);
    toast('✅ Delivered to ' + b.name + '!');
    paintStrip();
  }

  // the answer was wrong: same customer, fresh question, ticket stays open
  function reroll(id){
    if (!id || !orders[id]) { closeTicket(); return; }
    const q = opts.makeQuestion();
    orders[id] = {a:q.a, b:q.b, answer:q.answer};
    if (opts.onOpen) opts.onOpen(orderPayload(id));
  }

  function skip(){ closeTicket(); }
  function activeOrder(){ return activeId ? orderPayload(activeId) : null; }

  return {init, setLevel, complete, reroll, skip, close:closeTicket, activeOrder};
})();
window.Town = Town; // a top-level const isn't on window, and app.js checks window.Town before growing the town
