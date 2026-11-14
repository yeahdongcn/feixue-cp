
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
  hudSub:null, hudSlots:null, tapeUI:null, tapeList:null, battle:null, enemyCv:null,
  menu:null, fade:null, title:null, ending:null, hint:null,
};

function cacheEls(){
  el.dlg = $('#dlg'); el.dname = $('#dname'); el.dtext = $('#dtext');
  el.choices = $('#choices');
  el.hudEra = $('#hudEra'); el.hudTape = $('#hudTape');
  el.hudSub = $('#hudSub'); el.hudSlots = $('#hudSlots');
  el.tapeUI = $('#tapeUI'); el.tapeList = $('#tapeList');
  el.battle = $('#battle'); el.enemyCv = $('#enemyCv');
  el.menu = $('#menu'); el.fade = $('#fade');
  el.title = $('#title'); el.ending = $('#ending'); el.hint = $('#hint');
}

function updateHUD(){
  if (!el.hudEra) return;
  el.hudEra.textContent = ERA.year === '????' ? '????' : ERA.year;
  if (el.hudSub) el.hudSub.textContent = ERA.label || '';
  const hp = (typeof ERA_SCRIPT !== 'undefined' && ERA_SCRIPT[S.era]) ? ERA_SCRIPT[S.era].hint : '';
  if (el.hint) el.hint.textContent = (typeof hp === 'function') ? hp() : (hp || '');
  if (el.hudTape) el.hudTape.textContent = S.tapes.length + '/6';
  renderTapeSlots();
  // 音乐跟着时代走：每次 HUD 刷新都同步一次（scene 内部幂等，切换时 1.5s 交叉淡入）
  if (typeof MUSIC !== 'undefined'){
    MUSIC.scene(ERA.year);
    MUSIC.labels(ERA.year, ERA.label);
  }
}

/* 顶栏那 6 个槽位 = 磁带盒里的 6 格 = 六盘磁带。
   拿到 = 金色、两轴发亮；当前所在的年份多一圈冷色描边。 */
function renderTapeSlots(){
  if (!el.hudSlots) return;
  if (!el.hudSlots.children || el.hudSlots.children.length !== 6){
    el.hudSlots.innerHTML = '';
    for (let i=0;i<6;i++){
      const d = document.createElement('div');
      d.className = 'hslot';
      el.hudSlots.appendChild(d);
    }
  }
  TAPE_ORDER.forEach((y, i) => {
    const n = el.hudSlots.children[i];
    if (!n) return;
    const has = S.tapes.indexOf(y) >= 0;
    n.className = 'hslot' + (has ? ' on' : '') + (S.era === y ? ' cur' : '');
  });
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
  const qname = el.dname ? el.dname.textContent : '';
  const qtext = el.dtext ? el.dtext.textContent : '';
  el.choices.innerHTML = '';
  // 把「谁在问、问什么」搬到选项上方：原来问题在下面、选项在上面，读起来是反的
  if (qtext){
    const ask = document.createElement('div');
    ask.className = 'ask';
    ask.innerHTML = (qname ? '<b>' + esc(qname) + '</b>' : '') + '<span>' + esc(qtext) + '</span>';
    el.choices.appendChild(ask);
  }
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
      const b = el.choices.querySelectorAll('.opt')[i];
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
      '<div class="tslot">' +
        '<i class="tshell">' + (has ? 'A · ' + y : 'A · －－') + '</i>' +
        '<div class="tspool"></div><div class="tspool r"></div>' +
      '</div>' +
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
  /* 出生点决定第一眼看到什么。原来四个时代都落在 y=18 的马路上，
     镜头又被地图下边界钉住——开场是一整屏空马路，看不到楼、也看不到人。
     往北挪到广场边（y=12）：广电楼、路灯、NPC 和马路各占一条，第一眼就有信息。 */
  const d = { '2006':{x:20,y:12}, '2007':{x:20,y:12}, '2014':{x:20,y:12},
              '2020':{x:20,y:12}, '2026':{x:20,y:10}, '????':{x:20,y:12} };
  return d[y] || {x:20,y:12};
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
  const bob = Math.sin(t/500)*2;
  const shake = hurt ? (Math.random()*5-2.5) : 0;

  if (art === 'whisper'){
    /* 告密者：一件没有脸的大衣，帽檐下面有两颗绿点。
       它说的话比它本人多——四周飘着被涂黑的句子。 */
    g.save(); g.translate(shake, bob);
    // 地面上的影
    g.fillStyle = 'rgba(4,8,8,.55)'; g.beginPath(); g.ellipse(64,119,30,7,0,0,Math.PI*2); g.fill();
    // 背后那些「帖子」：一叠半透明的纸条
    for (let i=0;i<5;i++){
      const bx = 6 + (i*27)%118, by = 10 + (i*31)%58;
      g.save(); g.translate(bx, by); g.rotate((i%2?1:-1)*0.06);
      g.fillStyle = 'rgba(16,24,20,.72)'; g.fillRect(0,0,38,20);
      g.strokeStyle = 'rgba(142,242,192,.16)'; g.lineWidth = 1; g.strokeRect(.5,.5,37,19);
      g.fillStyle = 'rgba(142,242,192,.22)';
      for (let k=0;k<3;k++) g.fillRect(4, 5+k*4, 20+(i*5+k*7)%12, 1);
      g.restore();
    }
    // 大衣：从帽子到脚，占满画布
    g.fillStyle = '#0b120d'; g.beginPath();
    g.moveTo(40,56); g.lineTo(88,56); g.lineTo(104,118); g.lineTo(24,118); g.closePath(); g.fill();
    g.fillStyle = '#101a13'; g.beginPath();
    g.moveTo(44,58); g.lineTo(84,58); g.lineTo(96,116); g.lineTo(32,116); g.closePath(); g.fill();
    // 领子
    g.fillStyle = '#17231a';
    g.beginPath(); g.moveTo(52,54); g.lineTo(64,74); g.lineTo(76,54); g.closePath(); g.fill();
    // 头 / 毛线帽 / 口罩
    g.fillStyle = '#0a0f0b'; g.beginPath(); g.ellipse(64,42,21,17,0,0,Math.PI*2); g.fill();
    g.fillStyle = '#1b2a20'; g.fillRect(44,22,40,14);
    g.fillStyle = '#24382a'; g.fillRect(44,22,40,2);
    g.fillStyle = '#d8e2da'; g.fillRect(53,44,22,9);       // 口罩
    g.fillStyle = '#b7c4bb'; g.fillRect(53,44,22,1);
    g.fillStyle = '#8ef2c0'; g.fillRect(51,37,5,3); g.fillRect(72,37,5,3);
    g.fillStyle = 'rgba(142,242,192,.22)'; g.fillRect(48,35,11,7); g.fillRect(69,35,11,7);
    // 伸出来的手 / 指
    g.fillStyle = '#c9d3cb'; g.fillRect(30,82,5,15); g.fillRect(92,80,5,17);
    g.fillStyle = '#0b120d'; g.fillRect(30,95,5,4); g.fillRect(92,95,5,4);
    g.restore();
    // 飘在画面里的「他说过的话」，用裁剪框住
    g.save();
    g.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = 'rgba(142,242,192,.55)'; g.textAlign = 'center';
    g.fillText('我 知 道 是 谁', 64, 9);
    g.restore();
  }
  else if (art === 'seven'){
    /* 七年：一本被翻烂的台历。页脚的数字一直在跳，最后停在 2555。
       2007 末到 2014，正好两千五百五十五天。 */
    g.save(); g.translate(shake, bob);
    g.fillStyle = 'rgba(5,7,10,.55)'; g.beginPath(); g.ellipse(64,120,34,6,0,0,Math.PI*2); g.fill();
    // 后面几页
    for (let i=4;i>=1;i--){
      g.save(); g.translate(-i*2 + 2, i*2); g.rotate(-i*0.012);
      g.fillStyle = 'rgba(190,190,178,'+(0.10+i*0.03)+')'; g.fillRect(17,9,94,100);
      g.restore();
    }
    // 台历主体
    g.fillStyle = '#10161d'; g.fillRect(18,8,94,106);
    g.fillStyle = '#2b333c'; g.fillRect(18,8,94,2);
    g.fillStyle = '#0a0d12'; g.fillRect(28,114,12,4); g.fillRect(90,114,12,4);
    // 纸页
    g.fillStyle = '#ded6c2'; g.fillRect(23,11,84,82);
    g.fillStyle = '#b9b29e'; g.fillRect(23,11,84,1);
    g.fillStyle = '#a8452f'; g.fillRect(23,12,84,10);
    g.fillStyle = '#f0e7d2'; g.font = 'bold 8px system-ui,sans-serif'; g.textAlign = 'left';
    g.fillText('2 0 0 7 — 2 0 1 4', 26, 20);
    const year = String(2007 + ((t/1600|0) % 8));
    g.fillStyle = '#1a1a18'; g.font = 'bold 29px system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText(year, 65, 55);
    g.fillStyle = '#8a8578'; g.font = '8px system-ui,sans-serif';
    g.fillText('D A Y S', 65, 69);
    g.fillStyle = '#1a1a18'; g.font = 'bold 17px system-ui,sans-serif';
    g.fillText('2555 天', 65, 87);
    // 下方暗部只放装订条
    g.fillStyle = '#161d25'; g.fillRect(23,93,84,21);
    g.fillStyle = '#39424d'; g.fillRect(23,93,84,1);
    g.fillStyle = '#2b333c'; g.fillRect(30,99,70,2); g.fillRect(30,104,70,1);
    g.fillStyle = '#4a5460'; g.fillRect(46,109,38,2);
    g.restore();
  }
  else if (art === 'mirror'){
    /* 你的想象：一面占满画布的镜子。里面是一个没有脸的剪影，
       和你穿一样的衣服、一样的红围巾，一只手按在玻璃上。
       裂纹从掌心炸开。被看见的不是她，是你自己。 */
    g.save(); g.translate(shake, 0);
    g.fillStyle = 'rgba(4,8,14,.55)'; g.beginPath(); g.ellipse(64,121,38,6,0,0,Math.PI*2); g.fill();
    // 外框
    g.fillStyle = '#232b36'; g.fillRect(6,4,116,116);
    g.fillStyle = '#3b4657'; g.fillRect(6,4,116,2); g.fillRect(6,4,2,116);
    g.fillStyle = '#10161e'; g.fillRect(9,7,110,110);
    // 玻璃：左上角有一块反光，越往下越暗
    const gr = g.createLinearGradient(10,8,110,116);
    gr.addColorStop(0,'#39566d'); gr.addColorStop(.34,'#22384b');
    gr.addColorStop(.72,'#142433'); gr.addColorStop(1,'#0b141d');
    g.fillStyle = gr; g.fillRect(10,8,108,108);
    const hi = g.createRadialGradient(38,30,2,38,30,64);
    hi.addColorStop(0,'rgba(200,235,255,.22)'); hi.addColorStop(1,'rgba(200,235,255,0)');
    g.fillStyle = hi; g.fillRect(10,8,108,108);
    // 斜向反光
    g.globalAlpha = .09; g.fillStyle = '#eaf7ff';
    g.beginPath(); g.moveTo(18,8); g.lineTo(60,8); g.lineTo(20,116); g.lineTo(10,116); g.closePath(); g.fill();
    g.globalAlpha = 1;

    // 剪影：头、肩、大衣、腿。没有五官——镜子里的人不该看得太清。
    const py = 26 + Math.sin(t/520)*1.4;
    g.fillStyle = 'rgba(7,12,18,.92)';
    g.beginPath(); g.ellipse(64, py+18, 17, 20, 0, 0, Math.PI*2); g.fill();       // 头
    g.fillRect(48, py+2, 4, 8); g.fillRect(61, py, 5, 7); g.fillRect(72, py+3, 3, 7); // 几缕头发
    g.fillStyle = 'rgba(7,12,18,.94)';
    g.beginPath();
    g.moveTo(50,py+34); g.lineTo(78,py+34); g.lineTo(92,py+96); g.lineTo(36,py+96);
    g.closePath(); g.fill();                                                       // 大衣
    g.fillRect(44, py+33, 40, 14);                                                 // 肩
    // 腿 / 鞋
    g.fillStyle = 'rgba(5,9,14,.95)';
    g.fillRect(50, py+94, 11, 20); g.fillRect(68, py+94, 11, 20);
    g.fillRect(47, py+112, 17, 4); g.fillRect(64, py+112, 17, 4);
    // 左侧的冷色轮廓光：玻璃的反光落在人身上
    g.strokeStyle = 'rgba(120,200,240,.17)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(50,py+35); g.lineTo(48,py+58); g.lineTo(39,py+96);
    g.stroke();
    g.beginPath(); g.arc(64,py+18,18,Math.PI*0.86,Math.PI*1.36); g.stroke();
    // 红围巾：画面里唯一的暖色
    g.fillStyle = '#c8465c';
    g.fillRect(46, py+30, 36, 6);
    g.fillStyle = '#e0697e';
    g.fillRect(46, py+30, 36, 2);
    g.fillStyle = '#a8394c';
    g.fillRect(47, py+39, 7, 24);
    g.fillRect(50, py+60, 4, 6);
    // 按在玻璃上的手（剪影 + 一点轮廓）
    g.fillStyle = 'rgba(10,16,22,.92)';
    g.fillRect(84, py+52, 13, 24);
    g.fillRect(86, py+48, 3, 6); g.fillRect(90, py+47, 3, 7); g.fillRect(94, py+49, 3, 6);
    g.strokeStyle = 'rgba(120,200,240,.22)'; g.lineWidth = 1;
    g.strokeRect(84.5, py+52.5, 12, 23);

    // 裂纹：从掌心（90,py+76）炸开，越往外越淡
    const cx = 90, cy = py + 76;
    g.lineCap = 'round';
    const rays = [[18,-52],[34,-30],[40,15],[20,42],[-14,30],[-30,-8],[-12,-46],[4,-58]];
    for (const [dx,dy] of rays){
      g.strokeStyle = 'rgba(215,242,255,.42)'; g.lineWidth = .9;
      g.beginPath(); g.moveTo(cx,cy);
      const mx = cx + dx*.55 + (dx>0?3:-3), my = cy + dy*.55;
      g.lineTo(mx, my);
      g.lineTo(cx+dx, cy+dy);
      g.stroke();
      g.strokeStyle = 'rgba(215,242,255,.20)'; g.lineWidth = .7;
      g.beginPath(); g.moveTo(mx,my); g.lineTo(mx+dy*.16, my-dx*.16); g.stroke();
    }
    g.fillStyle = 'rgba(235,250,255,.30)';
    g.beginPath(); g.arc(cx,cy,2.2,0,Math.PI*2); g.fill();
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
  if ($('#bEnemyHpN')) $('#bEnemyHpN').textContent = st.hp + '/' + st.max;

  let pickCmd = null;
  const onKey = e => {
    if (!pickCmd || e.repeat) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4){ e.preventDefault(); pickCmd(n - 1); }
  };
  try { window.addEventListener('keydown', onKey); } catch(e){}
  const cleanup = () => {
    pickCmd = null;
    try { if (typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey); } catch(e){}
    if (battleAnimId){ clearInterval(battleAnimId); battleAnimId = 0; }
    battleActive = false;
    el.battle.classList.remove('on');
  };

  const log = $('#bLog'); log.innerHTML = '';
  // 战斗背景里飘着对方说过的话：不是装饰，是「这些话你没法反驳」
  const vb = $('#bVoices');
  if (vb){
    const pos = [[5,16],[52,9],[2,44],[50,39],[12,64],[44,62],[26,3],[2,28]];
    vb.innerHTML = src.lines.map((ln, i) => {
      const [x, y] = pos[i % pos.length];
      const side = x > 40 ? ('right:' + (96 - x) + '%;text-align:right;') : ('left:' + x + '%;');
      return '<span style="' + side + 'top:' + y + '%;animation-delay:' + (i * .7) + 's">' +
        esc(ln) + '</span>';
    }).join('');
  }
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
    if ($('#bEnemyHpN')) $('#bEnemyHpN').textContent = Math.max(0, st.hp) + '/' + st.max;
  }
  bars();

  const cmd = () => new Promise(res => {
    const box = $('#bCmds'); box.innerHTML = '';
    const list = [['举证','说清楚，把话说死'],['存疑','保留一点余地'],['关掉手机','喘口气'],];
    if (cfg.flee) list.push(['走开','不看了']);
    list.forEach(([t, s], i) => {
      const b = document.createElement('button');
      b.className = 'bcmd';
      b.innerHTML = '<span class="bkey">' + (i+1) + '</span><b>'+t+'</b><span>'+s+'</span>';
      b.onclick = () => { box.innerHTML=''; pickCmd = null; res(i); };
      box.appendChild(b);
    });
    pickCmd = i => {
      const b = box.querySelectorAll('.bcmd')[i];
      if (b) b.click();
    };
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
      cleanup();
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
      cleanup();
      S.zhi += 3; S.hp = 10; updateHUD();
      await delay(500);
      await say('', '你醒过来的时候，天已经亮了。有些话你没能反驳，于是它住进了你心里。');
      return false;
    }
    await delay(260);
  }

  cleanup();
  if (won){
    S.qing += cfg.q || 2;
    S.zhi = Math.max(0, S.zhi - (cfg.zdown || 1));
    updateHUD();
    return true;
  }
  return false;
}
