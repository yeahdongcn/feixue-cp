
/* ═══════════════════════════════════════════════════════════
   UI 层 · 对话 / 选项 / 磁带 / 菜单 / 战斗 / 结局
   ═══════════════════════════════════════════════════════════ */

const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

let scriptLock = false;
let confirmQ = [];
let dlgActive = false;
let started = false;        // 标题按下「开始」之后才接受输入

const el = {
  dlg:null, dname:null, dtext:null, choices:null, hudEra:null, hudTape:null,
  hudZhi:null, hudQing:null, tapeUI:null, tapeList:null, battle:null, enemyCv:null,
  menu:null, fade:null, title:null, ending:null, hint:null,
};

function cacheEls(){
  el.dlg = $('#dlg'); el.dname = $('#dname'); el.dtext = $('#dtext');
  el.choices = $('#choices');
  el.hudEra = $('#hudEra'); el.hudTape = $('#hudTape');
  el.hudZhi = $('#hudZhi'); el.hudQing = $('#hudQing');
  el.tapeUI = $('#tapeUI'); el.tapeList = $('#tapeList');
  el.battle = $('#battle'); el.enemyCv = $('#enemyCv');
  el.menu = $('#menu'); el.fade = $('#fade');
  el.title = $('#title'); el.ending = $('#ending'); el.hint = $('#hint');
}

function updateHUD(){
  if (!el.hudEra) return;
  el.hudEra.textContent = ERA.year === '????' ? '????' : ERA.year;
  const hp = (typeof ERA_SCRIPT !== 'undefined' && ERA_SCRIPT[S.era]) ? ERA_SCRIPT[S.era].hint : '';
  if (el.hint) el.hint.textContent = (typeof hp === 'function') ? hp() : (hp || '');
  el.hudTape.textContent = '磁带 ' + S.tapes.length + '/6';
  el.hudZhi.style.width = Math.min(100, S.zhi/22*100) + '%';
  el.hudQing.style.width = Math.min(100, S.qing/22*100) + '%';
}

/* ───────── 对话 ───────── */
function dlgOn(name){
  dlgActive = true;
  el.dlg.classList.add('on');
  if (name){ el.dname.textContent = name; el.dname.style.display = 'inline-block'; }
  else { el.dname.style.display = 'none'; }
}
function dlgOff(){
  dlgActive = false;
  el.dlg.classList.remove('on');
  el.choices.classList.remove('on');
  el.choices.innerHTML = '';
}

function waitConfirm(){
  return new Promise(res => confirmQ.push(res));
}

async function say(name, text){
  dlgOn(name);
  el.choices.classList.remove('on');
  let i = 0, typing = true;
  el.dtext.textContent = '';
  const iv = setInterval(() => {
    i += 1;
    el.dtext.textContent = text.slice(0, i);
    if (i >= text.length){ typing = false; clearInterval(iv); }
  }, 22);

  while (true){
    await waitConfirm();
    if (typing){ clearInterval(iv); el.dtext.textContent = text; typing = false; }
    else break;
  }
  el.dlg.classList.remove('on');
  await delay(60);
}

async function choose(opts){
  el.dlg.classList.add('on');
  el.choices.innerHTML = '';
  el.choices.classList.add('on');
  document.body.classList.add('choosing');   // 选择时暂时收起虚拟手柄
  return new Promise(res => {
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<b>' + (i+1) + '</b>' + esc(typeof o === 'string' ? o : o.t);
      b.onclick = () => {
        el.choices.classList.remove('on');
        el.choices.innerHTML = '';
        el.dlg.classList.remove('on');
        document.body.classList.remove('choosing');
        res(i);
      };
      el.choices.appendChild(b);
    });
    choose._pick = i => {
      const b = el.choices.children[i];
      if (b) b.click();
    };
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

/* ───────── 输入路由 ───────── */
function onConfirm(){
  if (!started || titleMode) return;
  if (confirmQ.length){ confirmQ.shift()(); return; }
  if (dlgActive || tapeOpen || menuOpen || battleActive || endingShown) return;
  tryInteract();
}
function onCancel(){
  if (!started || titleMode) return;
  if (dlgActive || scriptLock) return;
  if (battleActive) return;
  toggleMenu();
}
function onTapeKey(){
  if (!started || titleMode) return;
  if (dlgActive || scriptLock || battleActive || menuOpen) return;
  toggleTape();
}

async function tryInteract(){
  if (paused || scriptLock) return;
  const t = nearEntity();
  if (!t) return;
  if (t.kind === 'npc'){
    runScript(() => t.ref.script());
  } else {
    runScript(() => pickObj(t.ref));
  }
}

async function pickObj(o){
  if (o.type === 'tape'){
    await say('', o.text || '一盘磁带。');
    if (o.tape && !S.tapes.includes(o.tape)) unlockTape(o.tape, o.tapeName);
    if (o.flag) S.flags[o.flag] = true;
    if (o.once) o.hidden = true;
    if (o.after) await o.after();
  } else if (o.type === 'note'){
    await say('', o.text || '一张纸。');
  } else if (o.script){
    await o.script();
  }
}

async function runScript(fn){
  if (scriptLock) return;
  scriptLock = true;
  paused = true;
  try { await fn(); }
  catch (e) { console.error(e); }
  finally {
    scriptLock = false; if (!endingShown) paused = false;
    dlgOff();
    NPCS = eraNPCs(); OBJS = eraObjs();
    updateHUD();
  }
}

/* ───────── 磁带 ───────── */
let tapeOpen = false;
const TAPE_ORDER = ['2006','2007','2014','2020','2026','????'];

function tapeName(y){
  return ({ '2006':'2006 · 夏','2007':'2007 · 冬','2014':'2014 · 春','2020':'2020 · 春','2026':'2026 · 秋','????':'？？？？' })[y] || y;
}

function unlockTape(y, nm){
  if (S.tapes.includes(y)) return;
  S.tapes.push(y);
  updateHUD();
  toast('获得磁带 · ' + (nm || tapeName(y)));
  if (!S.flags.tapeTut){
    S.flags.tapeTut = 1;
    setTimeout(()=>{ toast('按 T 可以回到任何一盘磁带的年份'); }, 1600);
  }
}

function toggleTape(){
  if (tapeOpen){ closeTape(); return; }
  if (S.tapes.length <= 1 && !S.flags.tapeTut){ toast('你还没有别的磁带'); return; }
  tapeOpen = true;
  el.tapeUI.classList.add('on');
  renderTapeList();
}
function closeTape(){ tapeOpen = false; el.tapeUI.classList.remove('on'); }

function renderTapeList(){
  el.tapeList.innerHTML = '';
  TAPE_ORDER.forEach((y, i) => {
    const has = S.tapes.includes(y);
    const d = document.createElement('button');
    d.className = 'tape' + (has ? '' : ' locked') + (S.era === y ? ' cur' : '');
    d.innerHTML =
      '<div class="tslot"><div class="tspool"></div><div class="tspool r"></div></div>' +
      '<div class="tlab">' + (has ? esc(tapeName(y)) : '－－－') + '</div>' +
      '<div class="tno">NO.0' + (i+1) + '</div>';
    if (has) d.onclick = () => { closeTape(); jumpTo(y); };
    el.tapeList.appendChild(d);
  });
}

async function jumpTo(y, spawn){
  if (!S.tapes.includes(y)) return;
  await fadeOut();
  S.era = y;
  ERA = ERAS[y];
  P.x = ((spawn && spawn.x) ?? eraSpawn(y).x) * TS;
  P.y = ((spawn && spawn.y) ?? eraSpawn(y).y) * TS;
  P.dir = 0;
  bakeMap();
  initWeather(ERA.weather);
  NPCS = eraNPCs();
  OBJS = eraObjs();
  updateCamera();
  updateHUD();
  await fadeIn();
}

function eraSpawn(y){
  const d = { '2006':{x:20,y:18}, '2007':{x:20,y:18}, '2014':{x:20,y:18},
              '2020':{x:20,y:18}, '2026':{x:20,y:11}, '????':{x:20,y:12} };
  return d[y] || {x:20,y:18};
}

let fading = false;
async function fadeOut(){
  fading = true;
  el.fade.classList.add('on');
  await delay(520);
}
async function fadeIn(){
  el.fade.classList.remove('on');
  await delay(420);
  fading = false;
}

/* ───────── 菜单 ───────── */
let menuOpen = false;
function toggleMenu(){
  menuOpen = !menuOpen;
  el.menu.classList.toggle('on', menuOpen);
  if (menuOpen) renderMenu();
}
function renderMenu(){
  const tapes = TAPE_ORDER.map((y,i) => {
    const has = S.tapes.includes(y);
    return '<div class="mrow' + (has?'':' dim') + '"><span>磁带 0'+(i+1)+'</span><b>' + (has?esc(tapeName(y)):'未获得') + '</b></div>';
  }).join('');
  const its = S.items.length
    ? S.items.map(t=>'<div class="mrow"><b>'+esc(t)+'</b></div>').join('')
    : '<div class="mrow dim"><b>空的</b></div>';
  $('#menuBody').innerHTML =
    '<div class="msec">磁带</div>' + tapes +
    '<div class="msec">碎片</div>' + its +
    '<div class="msec">状态</div>' +
    '<div class="mrow"><span>执念</span><b>' + S.zhi + '</b></div>' +
    '<div class="mrow"><span>清醒</span><b>' + S.qing + '</b></div>';
}

/* ───────── toast ───────── */
let toastT = null;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(()=>t.classList.remove('on'), 2200);
}

/* ═══════════════════════════════════════════════════════════
   战斗
   ═══════════════════════════════════════════════════════════ */
let battleActive = false;
let battleAnimId = 0;

const ENEMIES = {
  whisper: { name:'告密者', hp:26, atk:3, art:'whisper',
    lines:['「我知道是谁说的。」','「你敢不敢赌一次？」','「你心里其实有答案。」','「别装了。」'],
    intro:'一个戴口罩的人挡住了路灯。他的声音是从很多个帖子里拼起来的。' },
  seven: { name:'七年', hp:34, atk:4, art:'seven',
    lines:['「两千五百五十五天。」','「你数的过来吗？」','「这七年，谁赔？」','「忘了它吧。」'],
    intro:'地铁口的风把一张旧日历吹到你脚边。上面的数字一直在跳。' },
  mirror: { name:'你的想象', hp:46, atk:5, art:'mirror',
    lines:['「她们一定曾经——」','「你比谁都清楚。」','「再想一遍，就一遍。」','「你不是在关心她，你是在享受。」'],
    intro:'站台的玻璃上映出一个人。那个人和你穿一样的衣服，说你想说的话。' },
};

function drawEnemy(g, art, t, hurt){
  g.clearRect(0,0,128,128);
  g.imageSmoothingEnabled = false;
  const bob = Math.sin(t/500)*3;
  const shake = hurt ? (Math.random()*5-2.5) : 0;

  if (art === 'whisper'){
    g.save(); g.translate(shake, bob);
    g.fillStyle = 'rgba(20,26,20,.9)';
    g.beginPath(); g.ellipse(64,74,26,34,0,0,Math.PI*2); g.fill();
    g.fillStyle = '#0d120d'; g.beginPath(); g.ellipse(64,52,20,16,0,0,Math.PI*2); g.fill();
    g.fillStyle = '#8ef2c0'; g.fillRect(55,52,5,4); g.fillRect(70,52,5,4);
    g.fillStyle = 'rgba(142,242,192,.25)'; g.fillRect(53,50,9,8); g.fillRect(68,50,9,8);
    // 气泡
    for (let i=0;i<3;i++){
      const bx = 20+i*38, by = 12 + Math.sin(t/300+i)*6;
      g.fillStyle = 'rgba(230,240,255,'+(0.10+i*0.05)+')';
      g.fillRect(bx, by, 26, 14);
      g.fillRect(bx+6, by+14, 4, 3);
    }
    g.restore();
  }
  else if (art === 'seven'){
    g.save(); g.translate(shake, bob);
    g.fillStyle = '#1a1f26'; g.fillRect(34,30,60,68);
    g.fillStyle = '#2b323c'; g.fillRect(37,33,54,62);
    g.fillStyle = '#c9d6e8';
    g.font = 'bold 34px system-ui, sans-serif'; g.textAlign='center';
    g.fillText(String(2007 + (t/900|0)%8), 64, 70);
    g.font = '11px system-ui, sans-serif'; g.fillStyle='#7d8a9c';
    g.fillText('D A Y S', 64, 86);
    g.fillStyle = 'rgba(160,200,255,.10)';
    g.fillRect(37,33,54,4);
    g.restore();
  }
  else if (art === 'mirror'){
    g.save(); g.translate(shake, 0);
    g.fillStyle = 'rgba(170,220,255,.10)'; g.fillRect(26,14,76,96);
    g.strokeStyle = 'rgba(170,220,255,.5)'; g.lineWidth = 2;
    g.strokeRect(26,14,76,96);
    // 里面的人
    const px = 52, py = 34 + Math.sin(t/500)*2;
    g.fillStyle = '#0b1218'; g.fillRect(px+4, py, 16, 5);
    g.fillStyle = '#a8dcff'; g.fillRect(px+4, py+5, 16, 16);
    g.fillStyle = '#0b1218'; g.fillRect(px+2, py+5, 20, 6);
    g.fillStyle = '#7ec8ff'; g.fillRect(px+3, py+21, 18, 26);
    g.fillStyle = '#2a3644'; g.fillRect(px+5, py+47, 6, 14); g.fillRect(px+13, py+47, 6, 14);
    g.fillStyle = 'rgba(126,200,255,.35)'; g.fillRect(28,16,72,2);
    g.restore();
  }
}

async function battle(key, cfg){
  if (battleActive) return true;
  cfg = cfg || {};
  const src = ENEMIES[key];
  const st = { hp: src.hp, max: src.hp, atk: src.atk, guard: 0 };
  battleActive = true;
  el.battle.classList.add('on');
  $('#bEnemyName').textContent = src.name;
  $('#bHpN').textContent = S.hp + '/' + S.maxhp;
  const log = $('#bLog'); log.innerHTML = '';
  blog(src.intro);
  drawEnemy(el.enemyCv.getContext('2d'), src.art, 0, false);
  if (battleAnimId) clearInterval(battleAnimId);
  battleAnimId = setInterval(()=>{
    if (!battleActive) return;
    drawEnemy(el.enemyCv.getContext('2d'), src.art, performance.now(), false);
  }, 90);

  const chat = m => blog(m);
  function blog(m){
    const d = document.createElement('div');
    d.textContent = m;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function bars(){
    $('#bEnemyHp').style.width = Math.max(0, st.hp/st.max*100) + '%';
    $('#bHp').style.width = Math.max(0, S.hp/S.maxhp*100) + '%';
    $('#bHpN').textContent = Math.max(0,S.hp) + '/' + S.maxhp;
  }
  bars();

  const cmd = () => new Promise(res => {
    const box = $('#bCmds'); box.innerHTML = '';
    const list = [['举证','说清楚，把话说死'],['存疑','保留一点余地'],['关掉手机','喘口气'],];
    if (cfg.flee) list.push(['走开','不看了']);
    list.forEach(([t, s], i) => {
      const b = document.createElement('button');
      b.className = 'bcmd';
      b.innerHTML = '<b>'+t+'</b><span>'+s+'</span>';
      b.onclick = () => { box.innerHTML=''; res(i); };
      box.appendChild(b);
    });
  });

  let won = false;
  let turns = 0;
  while (turns++ < 30){
    const c = await cmd();
    if (c === 0){
      const dmg = 6 + (Math.random()*3|0);
      st.hp -= dmg;
      chat('你举证：' + dmg + ' 点。可信度下降。');
    } else if (c === 1){
      const dmg = 2 + (Math.random()*2|0);
      st.hp -= dmg; st.guard = Math.min(3, st.guard+1);
      chat('你说：我不确定。对方的气焰低了一截。');
    } else if (c === 2){
      S.hp = Math.min(S.maxhp, S.hp + 8);
      chat('你关掉手机。世界安静了五秒。心力 +8。');
    } else {
      chat('你走开了。');
      battleActive = false;
      clearInterval(battleAnimId); battleAnimId = 0;
      el.battle.classList.remove('on');
      return false;
    }
    bars();
    if (st.hp <= 0){ won = true; break; }

    await delay(360);
    const atk = Math.max(1, st.atk - st.guard);
    S.hp -= atk;
    bars();
    chat(src.lines[(Math.random()*src.lines.length)|0] + '  （心力 -' + atk + '）');
    if (S.hp <= 0){
      chat('你被说服了。');
      await delay(700);
      battleActive = false;
      clearInterval(battleAnimId); battleAnimId = 0;
      el.battle.classList.remove('on');
      S.zhi += 3; S.hp = 10; updateHUD();
      await delay(500);
      await say('', '你醒过来的时候，天已经亮了。有些话你没能反驳，于是它住进了你心里。');
      return false;
    }
    await delay(260);
  }

  clearInterval(battleAnimId); battleAnimId = 0;
  battleActive = false;
  el.battle.classList.remove('on');
  if (won){
    S.qing += cfg.q || 2;
    S.zhi = Math.max(0, S.zhi - (cfg.zdown || 1));
    updateHUD();
    return true;
  }
  return false;
}
