/* ═══════════════════════════════════════════════════════════
   《不下车》 —— 一盒磁带，六个夏天
   2D 像素 JRPG / 时空跳转
   ═══════════════════════════════════════════════════════════ */

/* ───────── 基础常量 ───────── */
const CW = 320, CH = 180, TS = 16;
const MAPW = 40, MAPH = 24;

const T = { PAVE:0, ROAD:1, WALL:2, FENCE:3, GRASS:4, TREE:5, LAMP:6, PROP:7, DOOR:8, PLAT:9, WATER:10 };
const SOLID = { 2:1, 3:1, 5:1, 6:1, 7:1, 9:0, 10:1 };

/* ───────── 全局状态 ───────── */
const S = {
  era: '2006',
  tapes: ['2006'],
  flags: {},
  zhi: 0,
  qing: 0,
  hp: 32,
  maxhp: 32,
  items: [],
  ended: false,
};

const P = { x: 20*TS, y: 18*TS, dir: 0, fr: 0, t: 0, moving: false, speed: 62 };
const cam = { x: 0, y: 0 };

let ctx = null, canvas = null, atlas = null, atlasEra = null;
let running = false, paused = true;

/* ───────── 工具 ───────── */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const rnd = (a,b) => a + Math.random()*(b-a);
const lerp = (a,b,t) => a + (b-a)*t;
const $ = s => document.querySelector(s);

function tileAt(px,py){
  const tx = Math.floor(px/TS), ty = Math.floor(py/TS);
  if (tx<0||ty<0||tx>=MAPW||ty>=MAPH) return T.WALL;
  return MAP[ty*MAPW+tx];
}
function solidAt(px,py){
  const t = tileAt(px,py);
  return !!SOLID[t] && t !== T.PLAT;
}

/* ───────── 地图 ───────── */
let MAP = new Uint8Array(MAPW*MAPH);

function buildMap(){
  const m = new Uint8Array(MAPW*MAPH).fill(T.PAVE);
  const set = (x,y,v) => { if(x>=0&&y>=0&&x<MAPW&&y<MAPH) m[y*MAPW+x]=v; };
  const rect = (x,y,w,h,v) => { for(let j=0;j<h;j++) for(let i=0;i<w;i++) set(x+i,y+j,v); };

  // 外围
  rect(0,0,MAPW,1,T.WALL);
  rect(0,MAPH-1,MAPW,1,T.WALL);
  rect(0,0,1,MAPH,T.WALL);
  rect(MAPW-1,0,1,MAPH,T.WALL);

  // 广电大楼（左上主体）
  rect(2,1,34,6,T.WALL);
  set(19,7,T.DOOR); set(20,7,T.DOOR);

  // 广场绿化
  set(4,10,T.TREE); set(12,10,T.LAMP); set(24,10,T.TREE); set(32,10,T.TREE);
  set(8,12,T.TREE); set(30,12,T.TREE);
  set(5,9,T.PAVE);

  // 街道隔离栏（留缺口）
  for(let x=2;x<=12;x++) set(x,13,T.FENCE);
  for(let x=26;x<=37;x++) set(x,13,T.FENCE);
  for(let x=3;x<=20;x++) set(x,20,T.FENCE);

  // 报刊亭 / 摊位
  set(5,16,T.PROP); set(16,16,T.PROP); set(30,16,T.PROP);

  // 路面
  rect(2,14,36,1,T.ROAD);
  rect(2,15,36,1,T.ROAD);
  rect(2,16,36,1,T.ROAD);
  rect(2,17,36,1,T.ROAD);
  // 站台（右下）
  rect(21,21,16,2,T.PLAT);

  // 长椅
  set(3,18,T.PROP); set(26,18,T.PROP);

  MAP = m;
}

function isWalk(tx,ty){ return !SOLID[MAP[ty*MAPW+tx]]; }

/* ───────── 时代调色板 ───────── */
const ERAS = {
  '2006': {
    year:'2006', label:'夏 · 长沙',
    pal:{ sky:'#0d1330', pave:'#4a4238', pave2:'#544b3f', road:'#2c2a30', road2:'#34323a',
          wall:'#3a2f2c', wall2:'#4a3d37', win:'#ffd98a', fence:'#5b5a55', grass:'#3a4a2e',
          leaf:'#4e7a3a', leaf2:'#6a9a4a', trunk:'#4a3728', lamp:'#ffe6a0', prop:'#61492f',
          tint:'#ff8a3d', tintA:0.10, fog:'#1a1030', fogA:0.22 },
    weather:'heat', amb:'night', music:'warm',
  },
  '2007': {
    year:'2007', label:'冬 · 雪',
    pal:{ sky:'#1a2333', pave:'#7d8494', pave2:'#8b92a2', road:'#3c414c', road2:'#464b57',
          wall:'#4a4f5c', wall2:'#585e6c', win:'#9fc4e8', fence:'#6d7484', grass:'#5a6472',
          leaf:'#6b7480', leaf2:'#7d8694', trunk:'#3f4652', lamp:'#dce8f5', prop:'#4e5462',
          tint:'#6fa8dc', tintA:0.14, fog:'#16202e', fogA:0.26 },
    weather:'snow', amb:'cold', music:'cold',
  },
  '2014': {
    year:'2014', label:'春 · 北京 五环',
    pal:{ sky:'#26282b', pave:'#4f5155', pave2:'#595b60', road:'#2b2d31', road2:'#33353a',
          wall:'#3b3d42', wall2:'#474950', win:'#c9c2a8', fence:'#5a5d63', grass:'#3f4a3c',
          leaf:'#4a5a44', leaf2:'#5c6e54', trunk:'#3a3730', lamp:'#cfd6dd', prop:'#43454b',
          tint:'#8fa3b0', tintA:0.09, fog:'#20232a', fogA:0.30 },
    weather:'rain', amb:'grey', music:'grey',
  },
  '2020': {
    year:'2020', label:'春 · 录制基地外',
    pal:{ sky:'#150a1c', pave:'#3b3040', pave2:'#463a4c', road:'#241a2b', road2:'#2d2134',
          wall:'#2f1f38', wall2:'#3c2947', win:'#ff7ac2', fence:'#5a4368', grass:'#3a2a44',
          leaf:'#6a3f7a', leaf2:'#8a5299', trunk:'#3a2442', lamp:'#ff9ad5', prop:'#4a3255',
          tint:'#ff5fa2', tintA:0.16, fog:'#1a0a24', fogA:0.28 },
    weather:'dust', amb:'stage', music:'stage',
  },
  '2026': {
    year:'2026', label:'秋 · 站台',
    pal:{ sky:'#071018', pave:'#39434f', pave2:'#434e5c', road:'#20262e', road2:'#282f38',
          wall:'#2a333d', wall2:'#35404c', win:'#a8dcff', fence:'#4b5766', grass:'#2f3b46',
          leaf:'#5c7284', leaf2:'#7d95a8', trunk:'#38424e', lamp:'#cdeeff', prop:'#3a4552',
          tint:'#7ec8ff', tintA:0.10, fog:'#0a1420', fogA:0.30 },
    weather:'snow', amb:'night', music:'snow',
  },
  '????': {
    year:'????', label:'后台',
    pal:{ sky:'#050505', pave:'#1a1a1a', pave2:'#202020', road:'#0e0e0e', road2:'#141414',
          wall:'#141414', wall2:'#1c1c1c', win:'#f0e8d0', fence:'#2a2a2a', grass:'#161616',
          leaf:'#242424', leaf2:'#2e2e2e', trunk:'#181818', lamp:'#efe6cc', prop:'#1e1e1e',
          tint:'#ffffff', tintA:0.02, fog:'#000000', fogA:0.42 },
    weather:'none', amb:'void', music:'void',
  },
};

let ERA = ERAS['2006'];

/* ───────── 烘焙地图 ───────── */
function bakeMap(){
  const e = ERA, p = e.pal;
  const cv = document.createElement('canvas');
  cv.width = MAPW*TS; cv.height = MAPH*TS;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  for (let ty=0; ty<MAPH; ty++){
    for (let tx=0; tx<MAPW; tx++){
      const t = MAP[ty*MAPW+tx];
      const X = tx*TS, Y = ty*TS;
      drawTile(g, t, X, Y, tx, ty, p, e);
    }
  }
  atlas = cv; atlasEra = e.year;
}

function drawTile(g, t, X, Y, tx, ty, p, e){
  const dot = (x,y,w,h,c) => { g.fillStyle=c; g.fillRect(X+x, Y+y, w, h); };
  const noise = (c, n) => {
    g.fillStyle = c;
    let seed = (tx*73856093 ^ ty*19349663) >>> 0;
    for (let i=0;i<n;i++){
      seed = (seed*1664525 + 1013904223) >>> 0;
      const rx = (seed>>>8)%TS, ry = (seed>>>16)%TS;
      g.fillRect(X+rx, Y+ry, 1, 1);
    }
  };

  if (t === T.PAVE || t === T.PLAT){
    dot(0,0,TS,TS, p.pave);
    noise(p.pave2, 14);
    if (t === T.PLAT){
      dot(0,0,TS,2, '#2b3540');
      dot(0,TS-4,TS,4, p.pave2);
      dot(0,TS-6,TS,1, '#c9a227');
    }
  }
  else if (t === T.ROAD){
    dot(0,0,TS,TS, p.road);
    noise(p.road2, 10);
    if (ty === 15 && (tx % 4 < 2)) dot(2,7,12,2, '#c9b06a');
  }
  else if (t === T.WALL){
    dot(0,0,TS,TS, p.wall);
    dot(0,0,TS,3, p.wall2);
    // 窗户
    const wy = (ty%2===0) ? 4 : 8;
    if (tx%2===0){
      const lit = ((tx*13+ty*7) % 5) < (e.year==='2014'?2:3);
      dot(3,wy,5,4, lit ? p.win : '#20242c');
      dot(10,wy,5,4, lit ? p.win : '#20242c');
      if (lit){ g.fillStyle = p.win; g.globalAlpha = 0.10; g.fillRect(X+3,Y+wy,5,4); g.globalAlpha=1; }
    }
    if (ty === 6) dot(0,TS-2,TS,2, p.wall2);
  }
  else if (t === T.DOOR){
    dot(0,0,TS,TS, p.wall);
    dot(2,0,12,TS, '#10141a');
    dot(3,1,10,TS-2, p.win);
    g.globalAlpha = .5; dot(3,1,10,TS-2, '#000'); g.globalAlpha = 1;
    dot(6,0,1,TS, '#0a0d12'); dot(9,0,1,TS, '#0a0d12');
  }
  else if (t === T.FENCE){
    dot(0,TS-8,TS,3, p.fence);
    dot(2,TS-11,2,11, p.fence);
    dot(12,TS-11,2,11, p.fence);
  }
  else if (t === T.GRASS){
    dot(0,0,TS,TS, p.grass);
    noise(p.leaf, 8);
  }
  else if (t === T.TREE){
    dot(0,0,TS,TS, p.pave);
    dot(7,9,3,7, p.trunk);
    if (e.year==='2007' || e.year==='????'){
      // 枯枝
      dot(4,3,9,2, p.leaf); dot(6,1,2,4, p.leaf); dot(10,5,2,4, p.leaf); dot(3,6,3,2, p.leaf);
      dot(9,2,1,1, p.leaf2);
    } else {
      dot(2,1,13,9, p.leaf);
      dot(4,0,9,2, p.leaf2);
      dot(3,3,3,4, p.leaf2);
      dot(11,4,3,3, p.leaf2);
      dot(0,3,2,4, p.leaf);
    }
  }
  else if (t === T.LAMP){
    dot(0,0,TS,TS, p.pave);
    dot(7,2,2,14, '#2b2f36');
    dot(4,1,8,3, p.lamp);
    g.globalAlpha = .28; dot(2,0,12,5, p.lamp); g.globalAlpha = 1;
  }
  else if (t === T.PROP){
    dot(0,0,TS,TS, p.pave);
    if (e.year === '2006'){
      // 报刊亭
      dot(1,6,14,9, p.prop);
      dot(0,4,16,3, '#7a3b2e');
      dot(2,8,4,4, '#d8cfae'); dot(8,8,4,4, '#d8cfae');
    } else if (e.year === '2007'){
      dot(0,0,TS,TS, p.pave);
      dot(2,8,12,6, p.prop);
      dot(1,6,14,3, '#3a4048');
    } else {
      dot(1,7,14,7, p.prop);
      dot(0,5,16,3, p.wall2);
    }
  }
  else if (t === T.WATER){
    dot(0,0,TS,TS, '#14202e');
    noise('#1d3040', 12);
  }
}

/* ───────── 角色绘制 ───────── */
function drawChar(g, px, py, pal, dir, fr, opt){
  opt = opt || {};
  const X = Math.round(px), Y = Math.round(py);
  const R = (dx,dy,w,h,c) => { g.fillStyle = c; g.fillRect(X+dx, Y+dy, w, h); };

  // 影子
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(X+3, Y+14, 10, 2);

  const skin  = pal.skin  || '#e8b98f';
  const skin2 = pal.skin2 || '#c9946d';
  const hair  = pal.hair  || '#241a14';
  const shirt = pal.shirt || '#d94f63';
  const shirt2= pal.shirt2|| '#a83a4c';
  const pants = pal.pants || '#2f3a52';
  const shoe  = pal.shoe  || '#1a1512';
  const long  = !!opt.longHair;
  const hat   = opt.hat;
  const bag   = opt.bag;

  // 腿
  if (fr === 0){ R(5,13,3,3, pants); R(9,13,3,3, pants); R(5,15,3,1, shoe); R(9,15,3,1, shoe); }
  else          { R(4,13,3,3, pants); R(10,13,3,3, pants); R(4,15,3,1, shoe); R(11,15,3,1, shoe); }

  // 身体
  R(4,8,8,6, shirt);
  R(4,8,8,2, shirt2);
  R(3,9,1,4, shirt2);
  R(12,9,1,4, shirt2);

  if (bag) { R(12,9,3,4, '#4a3a2a'); R(12,9,3,1, '#6a5540'); }

  if (dir === 3){
    // 背面
    R(3,1,10,7, hair);
    if (long) R(2,4,12,12, hair);
    R(4,8,8,6, shirt); R(4,8,8,2, shirt2);
    return;
  }

  // 头发 / 头
  R(4,1,8,2, hair);
  R(3,2,10,6, skin);
  R(4,1,8,4, hair);
  if (dir !== 3){
    if (dir === 0){ R(5,4,2,2, '#1b1410'); R(9,4,2,2, '#1b1410'); }
    else if (dir === 1){ R(4,4,2,2, '#1b1410'); }
    else { R(9,4,2,2, '#1b1410'); }
  }
  R(5,6,2,1, skin2); R(9,6,2,1, skin2);
  if (long) R(2,3,2,10, hair), R(12,3,2,10, hair);

  if (hat === 'cap'){ R(3,0,10,3, '#2b3242'); R(2,2,12,1, '#3a4358'); }
  if (hat === 'beanie'){ R(3,0,10,3, '#8a4a5a'); R(3,1,10,2, '#a35c6e'); }
  if (hat === 'headset'){ R(3,3,1,3, '#333'); R(12,3,1,3, '#333'); R(2,2,12,1, '#333'); }
  if (opt.glow){
    g.globalAlpha = .35;
    g.fillStyle = opt.glow;
    g.fillRect(X+2, Y-2, 12, 18);
    g.globalAlpha = 1;
  }
}

/* ───────── 天气粒子 ───────── */
let parts = [];
function initWeather(kind){
  parts = [];
  if (kind === 'none') return;
  const n = kind === 'snow' ? 70 : kind === 'rain' ? 80 : kind === 'heat' ? 40 : 45;
  for (let i=0;i<n;i++) parts.push(newPart(kind, true));
}
function newPart(kind, anywhere){
  const base = { kind, x: rnd(0, CW), y: anywhere ? rnd(0, CH) : -6, life: 1 };
  if (kind === 'snow'){ base.vy = rnd(10,26); base.vx = rnd(-8,4); base.s = Math.random()<.3?2:1; base.c='#eaf6ff'; }
  if (kind === 'rain'){ base.vy = rnd(120,190); base.vx = rnd(-18,-8); base.s = 1; base.c='#9fc4e8'; }
  if (kind === 'heat'){ base.vy = rnd(-14,-6); base.vx = rnd(-4,4); base.s = 1; base.c='#ffd9a0'; base.y = rnd(0,CH); }
  if (kind === 'dust'){ base.vy = rnd(-4,4); base.vx = rnd(-6,6); base.s = 1; base.c='#ffb0e0'; }
  base.a = rnd(.25,.7);
  return base;
}
function stepWeather(dt){
  if (!parts.length) return;
  const kind = ERA.weather;
  for (let i=0;i<parts.length;i++){
    const q = parts[i];
    q.x += q.vx*dt; q.y += q.vy*dt;
    if (q.y > CH+8 || q.y < -12 || q.x < -10 || q.x > CW+10){
      if (kind === 'none') continue;
      const np = newPart(kind, kind==='heat'||kind==='dust');
      np.x = kind==='snow'||kind==='rain' ? rnd(0,CW) : rnd(0,CW);
      np.y = kind==='snow'||kind==='rain' ? -6 : rnd(0,CH);
      parts[i] = np;
    }
  }
}
function drawWeather(g){
  for (const q of parts){
    g.globalAlpha = q.a;
    g.fillStyle = q.c;
    if (q.kind === 'rain'){ g.fillRect(q.x|0, q.y|0, 1, 4); }
    else g.fillRect(q.x|0, q.y|0, q.s, q.s);
  }
  g.globalAlpha = 1;
}

/* ───────── 实体 ───────── */
let NPCS = [];      // 当前时代 NPC
let OBJS = [];      // 当前时代可拾取物

function eraNPCs(){
  const list = (ERA_SCRIPT[S.era] && ERA_SCRIPT[S.era].npcs) || [];
  return list.filter(n => !n.when || n.when());
}
function eraObjs(){
  const list = (ERA_SCRIPT[S.era] && ERA_SCRIPT[S.era].objs) || [];
  return list.filter(o => !o.when || o.when());
}

/* ───────── 相机 / 渲染 ───────── */
function updateCamera(){
  const tx = P.x + 8 - CW/2, ty = P.y + 8 - CH/2;
  cam.x = clamp(tx, 0, MAPW*TS - CW);
  cam.y = clamp(ty, 0, MAPH*TS - CH);
}

function render(dt){
  const g = ctx, p = ERA.pal;
  g.imageSmoothingEnabled = false;

  if (atlasEra !== ERA.year) bakeMap();

  g.clearRect(0,0,CW,CH);
  g.fillStyle = p.sky; g.fillRect(0,0,CW,CH);

  if (atlas){
    g.drawImage(atlas, Math.round(cam.x), Math.round(cam.y), CW, CH, 0, 0, CW, CH);
  }

  // 实体按 y 排序
  const ents = [];
  for (const n of NPCS) ents.push({ y:n.y, kind:'npc', ref:n });
  for (const o of OBJS) ents.push({ y:o.y, kind:'obj', ref:o });
  ents.push({ y:P.y, kind:'player', ref:P });
  ents.sort((a,b)=>a.y-b.y);

  for (const e of ents){
    const sx = e.ref.x - cam.x, sy = e.ref.y - cam.y;
    if (sx < -24 || sy < -24 || sx > CW+24 || sy > CH+24) continue;
    if (e.kind === 'player'){
      drawChar(g, sx, sy, PLAYER_PAL, P.dir, P.fr);
    } else if (e.kind === 'npc'){
      const n = e.ref;
      drawChar(g, sx, sy, n.pal || NPC_PAL, n.dir ?? 0, n.fr ?? 0, n.opt);
      n._sx = sx; n._sy = sy;
    } else {
      drawObj(g, sx, sy, e.ref);
    }
  }

  drawWeather(g);

  // 光照 / 色调
  g.fillStyle = p.tint; g.globalAlpha = p.tintA;
  g.fillRect(0,0,CW,CH); g.globalAlpha = 1;

  // 暗角
  const grd = g.createRadialGradient(CW/2, CH/2, CH*0.35, CW/2, CH/2, CH*0.95);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, p.fog);
  g.globalAlpha = p.fogA * 1.6;
  g.fillStyle = grd; g.fillRect(0,0,CW,CH);
  g.globalAlpha = 1;
}

function drawObj(g, x, y, o){
  const bob = Math.sin(performance.now()/380 + (o.y||0)) * 1.2;
  if (o.type === 'tape'){
    g.fillStyle = 'rgba(255,240,180,.18)';
    g.beginPath(); g.arc(x+8, y+8+bob, 9, 0, Math.PI*2); g.fill();
    g.fillStyle = '#2a2a30'; g.fillRect(x+2, y+5+bob, 12, 8);
    g.fillStyle = '#d9d2c0'; g.fillRect(x+4, y+7+bob, 8, 4);
    g.fillStyle = '#c04a5a'; g.fillRect(x+4, y+7+bob, 8, 1);
    g.fillStyle = '#e8e2d0'; g.fillRect(x+5, y+9+bob, 2, 2); g.fillRect(x+9, y+9+bob, 2, 2);
  } else if (o.type === 'note'){
    g.fillStyle = 'rgba(160,220,255,.18)';
    g.beginPath(); g.arc(x+8, y+8+bob, 8, 0, Math.PI*2); g.fill();
    g.fillStyle = '#e8eef8'; g.fillRect(x+4, y+4+bob, 8, 10);
    g.fillStyle = '#9aa8bc';
    for (let i=0;i<4;i++) g.fillRect(x+5, y+6+bob+i*2, 6, 1);
  }
}

/* ───────── 玩家移动 ───────── */
const keys = {};

function updatePlayer(dt){
  if (paused || scriptLock) { P.moving = false; return; }
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a']) dx -= 1;
  if (keys['ArrowRight']|| keys['d']) dx += 1;
  if (keys['ArrowUp']   || keys['w']) dy -= 1;
  if (keys['ArrowDown'] || keys['s']) dy += 1;

  P.moving = !!(dx || dy);
  if (!P.moving){ P.fr = 0; P.t = 0; return; }

  if (dx && !dy) P.dir = dx < 0 ? 1 : 2;
  else if (dy && !dx) P.dir = dy < 0 ? 3 : 0;
  else if (dy < 0) P.dir = 3;
  else if (dy > 0) P.dir = 0;

  const len = Math.hypot(dx,dy) || 1;
  const sp = P.speed * dt / len;
  const nx = P.x + dx*sp, ny = P.y + dy*sp;

  // 碰撞盒（脚部）
  const bx = 4, by = 9, bw = 8, bh = 7;
  const hits = (x,y) =>
    solidAt(x+bx, y+by) || solidAt(x+bx+bw, y+by) ||
    solidAt(x+bx, y+by+bh) || solidAt(x+bx+bw, y+by+bh);

  if (!hits(nx, P.y)) P.x = nx;
  if (!hits(P.x, ny)) P.y = ny;

  P.t += dt;
  P.fr = (P.t * 6 | 0) % 2;
  P.x = clamp(P.x, TS, MAPW*TS - TS*2);
  P.y = clamp(P.y, TS, MAPH*TS - TS*2);
}

/* ───────── 交互目标 ───────── */
function facingTile(){
  const cx = P.x + 8, cy = P.y + 8;
  const d = [[0,10],[ -10,0],[10,0],[0,-10]][P.dir];
  return { tx: Math.floor((cx+d[0])/TS), ty: Math.floor((cy+d[1])/TS) };
}
function nearEntity(){
  const cx = P.x+8, cy = P.y+8;
  let best = null, bd = 26;
  for (const n of NPCS){
    const d = Math.hypot(n.x+8-cx, n.y+8-cy);
    if (d < bd){ bd = d; best = { kind:'npc', ref:n }; }
  }
  for (const o of OBJS){
    const d = Math.hypot(o.x+8-cx, o.y+8-cy);
    if (d < bd){ bd = d; best = { kind:'obj', ref:o }; }
  }
  return best;
}

/* ───────── 主循环 ───────── */
let lastT = 0;
function loop(t){
  if (!running) return;
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;

  updatePlayer(dt);
  updateCamera();
  stepWeather(dt);

  // NPC 朝向玩家
  for (const n of NPCS){
    if (n.wander){
      n.wt = (n.wt||0) + dt;
      if (n.wt > 2.2){ n.wt = 0; n.dir = (Math.random()*4)|0; }
    }
  }
  render(dt);
  requestAnimationFrame(loop);
}

/* ───────── 输入 ───────── */
const CONFIRM = ['z','Z','Enter',' '];
const CANCEL  = ['x','X','Escape'];

function bindInput(){
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    if (CONFIRM.includes(e.key)) onConfirm();
    if (CANCEL.includes(e.key)) onCancel();
    if (e.key === 't' || e.key === 'T') onTapeKey();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
}
