/* ═══════════════════════════════════════════════════════════
   《不下车》 —— 一盒磁带，六个夏天
   2D 像素 JRPG / 时空跳转
   ═══════════════════════════════════════════════════════════ */

/* ───────── 基础常量 ───────── */
const CW = 320, CH = 180, TS = 16;
const MAPW = 40, MAPH = 24;

const T = { PAVE:0, ROAD:1, WALL:2, FENCE:3, GRASS:4, TREE:5, LAMP:6, PROP:7, DOOR:8, PLAT:9, WATER:10,
            BENCH:11, BIN:12, POSTER:13, MACHINE:14 };
const SOLID = { 2:1, 3:1, 5:1, 6:1, 7:1, 9:0, 10:1, 11:1, 12:1, 13:1, 14:1 };

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
let bgCanvas = null, bgCtx = null;   // 屏幕外的柔光层（黑边不再是死黑）
let LAMPS = [];                       // 路灯坐标，用来打光池
let running = false, paused = true, titleMode = true, rafId = 0;

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

  // 广场家具：把 7–12 行那片大空地填出「人待过」的痕迹
  // （2026 开场镜头正好看 11–30 列，所以这些都摆在会被看见的位置）
  rect(14,9,2,1,T.BENCH); rect(26,9,2,1,T.BENCH);
  set(13,9,T.BIN); set(28,8,T.MACHINE);
  set(24,8,T.POSTER);
  set(11,8,T.LAMP);

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
  LAMPS = [];
  for (let i=0;i<MAP.length;i++) if (MAP[i] === T.LAMP)
    LAMPS.push({ x:(i%MAPW)*TS, y:((i/MAPW)|0)*TS });
}

function isWalk(tx,ty){ return !SOLID[MAP[ty*MAPW+tx]]; }

/* ───────── 时代调色板 ───────── */
const ERAS = {
  '2006': {
    year:'2006', label:'夏 · 长沙',
    pal:{ sky:'#0d1330', pave:'#4a4238', pave2:'#544b3f', road:'#2c2a30', road2:'#34323a',
          wall:'#3a2f2c', wall2:'#4a3d37', win:'#ffd98a', fence:'#5b5a55', grass:'#3a4a2e',
          leaf:'#4e7a3a', leaf2:'#6a9a4a', trunk:'#4a3728', lamp:'#ffe6a0', prop:'#61492f',
          snowAmt:0, snow:'#e8f2ff', snow2:'#b9c9db', paveLine:'rgba(0,0,0,.20)', paveHi:'rgba(255,226,180,.045)', curb:'#6d6355', entr:'#ffcf8a',
          tint:'#ff8a3d', tintA:0.10, fog:'#1a1030', fogA:0.22 },
    weather:'heat', amb:'night', music:'warm',
  },
  '2007': {
    year:'2007', label:'冬 · 雪',
    pal:{ sky:'#1a2333', pave:'#7d8494', pave2:'#8b92a2', road:'#3c414c', road2:'#464b57',
          wall:'#4a4f5c', wall2:'#585e6c', win:'#9fc4e8', fence:'#6d7484', grass:'#5a6472',
          leaf:'#6b7480', leaf2:'#7d8694', trunk:'#3f4652', lamp:'#dce8f5', prop:'#4e5462',
          snowAmt:0.85, snow:'#eaf4ff', snow2:'#c3d2e2', paveLine:'rgba(0,0,0,.14)', paveHi:'rgba(255,255,255,.07)', curb:'#9aa1b0', entr:'#dbe9ff',
          tint:'#6fa8dc', tintA:0.14, fog:'#16202e', fogA:0.26 },
    weather:'snow', amb:'cold', music:'cold',
  },
  '2014': {
    year:'2014', label:'春 · 北京 五环',
    pal:{ sky:'#26282b', pave:'#4f5155', pave2:'#595b60', road:'#2b2d31', road2:'#33353a',
          wall:'#3b3d42', wall2:'#474950', win:'#c9c2a8', fence:'#5a5d63', grass:'#3f4a3c',
          leaf:'#4a5a44', leaf2:'#5c6e54', trunk:'#3a3730', lamp:'#cfd6dd', prop:'#43454b',
          snowAmt:0.06, snow:'#d7dee4', snow2:'#b0b8bf', paveLine:'rgba(0,0,0,.26)', paveHi:'rgba(255,255,255,.04)', curb:'#6a6d72', entr:'#c9c2a8',
          tint:'#8fa3b0', tintA:0.09, fog:'#20232a', fogA:0.30 },
    weather:'rain', amb:'grey', music:'grey',
  },
  '2020': {
    year:'2020', label:'春 · 录制基地外',
    pal:{ sky:'#150a1c', pave:'#3b3040', pave2:'#463a4c', road:'#241a2b', road2:'#2d2134',
          wall:'#2f1f38', wall2:'#3c2947', win:'#ff7ac2', fence:'#5a4368', grass:'#3a2a44',
          leaf:'#6a3f7a', leaf2:'#8a5299', trunk:'#3a2442', lamp:'#ff9ad5', prop:'#4a3255',
          snowAmt:0, snow:'#ffd9f0', snow2:'#c98fb8', paveLine:'rgba(0,0,0,.22)', paveHi:'rgba(255,160,220,.05)', curb:'#5a4368', entr:'#ff9ad5',
          tint:'#ff5fa2', tintA:0.16, fog:'#1a0a24', fogA:0.28 },
    weather:'dust', amb:'stage', music:'stage',
  },
  '2026': {
    year:'2026', label:'秋 · 站台',
    pal:{ sky:'#071018', pave:'#39434f', pave2:'#434e5c', road:'#20262e', road2:'#282f38',
          wall:'#2a333d', wall2:'#35404c', win:'#a8dcff', fence:'#4b5766', grass:'#2f3b46',
          leaf:'#5c7284', leaf2:'#7d95a8', trunk:'#38424e', lamp:'#cdeeff', prop:'#3a4552',
          snowAmt:0.62, snow:'#e2eefb', snow2:'#b6c8da', paveLine:'rgba(0,0,0,.22)', paveHi:'rgba(200,230,255,.06)', curb:'#546374', entr:'#ffcf8a',
          tint:'#7ec8ff', tintA:0.10, fog:'#0a1420', fogA:0.30 },
    weather:'snow', amb:'night', music:'snow',
  },
  '????': {
    year:'????', label:'后台',
    pal:{ sky:'#050505', pave:'#1a1a1a', pave2:'#202020', road:'#0e0e0e', road2:'#141414',
          wall:'#141414', wall2:'#1c1c1c', win:'#f0e8d0', fence:'#2a2a2a', grass:'#161616',
          leaf:'#242424', leaf2:'#2e2e2e', trunk:'#181818', lamp:'#efe6cc', prop:'#1e1e1e',
          snowAmt:0, snow:'#e8e2d2', snow2:'#b9b3a5', paveLine:'rgba(0,0,0,.34)', paveHi:'rgba(255,255,255,.02)', curb:'#2c2c2c', entr:'#efe6cc',
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
  bakeFacade(g, p, e);
  atlas = cv; atlasEra = e.year;
}

/* 每格的确定性随机：烘焙一次就不动了，不会每帧闪 */
function th(tx, ty, salt){
  let h = (tx*374761393 + ty*668265263 + (salt||0)*2246822519) >>> 0;
  h = ((h ^ (h>>>13)) * 1274126177) >>> 0;
  return ((h ^ (h>>>16)) >>> 0) / 4294967295;
}
function tileOf(tx, ty){
  if (tx<0||ty<0||tx>=MAPW||ty>=MAPH) return T.WALL;
  return MAP[ty*MAPW+tx];
}
const GROUNDY = t => t===T.PAVE||t===T.PLAT||t===T.ROAD||t===T.GRASS;

function drawTile(g, t, X, Y, tx, ty, p, e){
  const dot = (x,y,w,h,c) => { g.fillStyle=c; g.fillRect(X+x, Y+y, w, h); };
  const noise = (c, n, salt) => {
    g.fillStyle = c;
    let seed = ((tx*73856093 ^ ty*19349663 ^ (salt||0)*2654435761) >>> 0);
    for (let i=0;i<n;i++){
      seed = (seed*1664525 + 1013904223) >>> 0;
      const rx = (seed>>>8)%TS, ry = (seed>>>16)%TS;
      g.fillRect(X+rx, Y+ry, 1, 1);
    }
  };
  const sn  = p.snow  || '#e2eefb';
  const sn2 = p.snow2 || '#b6c8da';
  const amt = p.snowAmt || 0;
  const up = tileOf(tx, ty-1), dn = tileOf(tx, ty+1);
  const lf = tileOf(tx-1, ty), rt = tileOf(tx+1, ty);
  const solidish = c => c===T.WALL||c===T.DOOR||c===T.FENCE||c===T.PROP||c===T.BENCH||
                        c===T.POSTER||c===T.MACHINE||c===T.BIN||c===T.TREE||c===T.LAMP;

  /* 地面板材：上左一道亮边、下右一道暗缝 → 一眼能看出是「铺出来的地」 */
  const slabs = (base, line, hi, grain) => {
    dot(0,0,TS,TS, base);
    if (grain) noise(grain, 7, 1);
    dot(0,0,TS,1, hi);  dot(0,0,1,TS, hi);
    dot(0,TS-1,TS,1, line); dot(TS-1,0,1,TS, line);
  };

  /* 雪：靠墙 / 靠路缘堆得更厚，是「有上下关系」的地面线索 */
  const drift = (x,y,w,hh) => {
    dot(x, y, w, hh, sn);
    dot(x+1, y-1, w-2, 1, sn);
    dot(x+1, y+hh, w-2, 1, sn2);
  };

  if (t === T.PAVE){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    if (amt > 0.2){
      // 场地中零散的雪堆
      const n = amt > 0.7 ? 2 : 1;
      for (let i=0;i<n;i++){
        const h1 = th(tx,ty,i*7+2), h2 = th(tx,ty,i*7+5), h3 = th(tx,ty,i*7+9);
        if (h1 > 0.52) drift(1 + (h2*9|0), 3 + (h3*10|0), 3 + (h1*4|0), 1 + (h3*2|0));
      }
    }
    // 靠墙 / 靠路边压一条雪线：把「北」和「南」画出来
    if (amt > 0.2 && solidish(up)){ dot(0,0,TS,2, sn); dot(0,2,TS,1, sn2); }
    if (amt > 0.2 && (dn === T.ROAD)){ dot(0,TS-2,TS,2, sn2); }
    // 脚印：少数格子里留几对
    if (th(tx,ty,11) > 0.74 && amt < 0.5){
      const fx = 3 + (th(tx,ty,12)*8|0), fy = 4 + (th(tx,ty,13)*8|0);
      dot(fx, fy, 2, 1, 'rgba(0,0,0,.26)');
      dot(fx+3, fy+3, 2, 1, 'rgba(0,0,0,.20)');
    }
    // 极淡的冰面反光（夜里的光会落在这些点上）
    if (th(tx,ty,21) > 0.86) dot(2 + (th(tx,ty,22)*11|0), 2 + (th(tx,ty,23)*11|0), 2, 1, 'rgba(200,230,255,.10)');
  }
  else if (t === T.PLAT){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    // 站台边：靠轨道一侧是白色安全线 + 黄色盲道 + 一道落下去的阴影
    if (dn !== T.PLAT){
      dot(0,0,TS,3, '#d8b24a');
      dot(1,0,1,2,'#f0cf7a'); dot(5,0,1,2,'#f0cf7a'); dot(9,0,1,2,'#f0cf7a'); dot(13,0,1,2,'#f0cf7a');
      dot(0,5,TS,1,'#dfe9f5');
      dot(0,6,TS,3,'rgba(0,0,0,.42)');
      dot(0,9,TS,2,'rgba(0,0,0,.22)');
    }
    if (up !== T.PLAT) { dot(0,0,TS,2, p.curb); dot(0,2,TS,2,'rgba(0,0,0,.25)'); }
    if (amt > 0.2) { dot(0,TS-3,TS,3, sn); dot(2,TS-4,5,1, sn); dot(9,TS-4,5,1, sn); }
    if (amt > 0.2 && th(tx,ty,31) > .5) drift(2+(th(tx,ty,32)*9|0), 7+(th(tx,ty,33)*6|0), 5, 2);
  }
  else if (t === T.ROAD){
    dot(0,0,TS,TS, p.road);
    noise(p.road2, 6, 2);
    // 车辙：横穿整条马路，所以按行画、跨格连成一条
    if (ty === 15 || ty === 16) dot(0, 5, TS, 3, 'rgba(0,0,0,.14)');
    if (ty === 17) dot(0, 11, TS, 2, 'rgba(0,0,0,.10)');
    // 中线（被雪盖掉一半，才像是深夜的街）
    if (ty === 15 && (tx % 4 < 2)){
      dot(2,7,12,2, '#b9a464');
      dot(2,7,5,1, sn2);
    }
    // 北侧路缘：上一格不是马路 → 抬起来的牙子 + 雪堆
    if (up !== T.ROAD){
      dot(0,0,TS,2, p.curb);
      dot(0,0,TS,1, 'rgba(255,255,255,.16)');
      dot(0,2,TS,1, 'rgba(0,0,0,.38)');
      if (amt > 0.2) { dot(0,0,TS,3, sn); dot(2,0,5,1, sn); dot(9,0,4,1, sn); }
    }
    if (dn !== T.ROAD && ty > 15) { dot(0,0,TS,2, p.curb); if (amt>0.2) dot(0,0,TS,2, sn2); }
    if (amt > 0.2 && th(tx,ty,41) > 0.66) drift(2+(th(tx,ty,42)*10|0), 6+(th(tx,ty,43)*7|0), 4, 1);
    // 井盖 / 反光
    if (ty === 14 && tx%7===3){ g.strokeStyle='rgba(0,0,0,.35)'; g.strokeRect(X+5.5,Y+9.5,5,5); dot(6,10,4,4,'rgba(0,0,0,.18)'); }
  }
  else if (t === T.WALL){
    // 广电大楼：竖缝 + 成对的窗（窗口有框、有窗台，才不会被看成 UI 方块）
    dot(0,0,TS,TS, p.wall);
    noise(p.wall2, 5, 3);
    dot(TS-1,0,1,TS, 'rgba(0,0,0,.20)');
    if (ty === 6){
      // 楼脚：檐口 + 檐下阴影，楼才像「站」在地上
      dot(0,0,TS,1, 'rgba(255,255,255,.07)');
      dot(0,1,TS,2, p.wall2);
      dot(0,3,TS,1, 'rgba(0,0,0,.42)');
      dot(0,4,TS,12, 'rgba(0,0,0,.22)');
      if (tx%4===0) dot(0,0,2,TS, 'rgba(255,255,255,.05)');
    } else {
      const wy = (ty%2===0) ? 4 : 9;
      if (tx%2===0){
        const lit = ((tx*13+ty*7) % 5) < (e.year==='2014'?2:3);
        const glass = lit ? p.win : '#1c222a';
        for (const wx of [3, 10]){
          dot(wx-1, wy-1, 7, 7, '#141a22');           // 窗框
          dot(wx, wy, 5, 5, glass);                   // 玻璃
          dot(wx, wy, 5, 1, 'rgba(255,255,255,.16)'); // 反光
          dot(wx, wy+5, 5, 1, p.wall2);               // 窗台
        }
        if (lit){
          g.globalAlpha = .12; dot(3,wy,12,6, p.win); g.globalAlpha = 1;
        }
      }
    }
  }
  else if (t === T.DOOR){
    // 被 bakeFacade 的雨棚盖住，这里只留一个暗的门洞底
    dot(0,0,TS,TS, '#0e141c');
    dot(2,0,12,TS, '#1a232e');
  }
  else if (t === T.FENCE){
    // 之前这里没画地面，栏杆中间会漏出天空色、像地面破了个洞
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(0,14,TS,2, 'rgba(0,0,0,.30)');
    dot(2,5,2,11, p.fence); dot(12,5,2,11, p.fence);
    dot(2,5,1,11, 'rgba(255,255,255,.14)'); dot(12,5,1,11, 'rgba(255,255,255,.14)');
    dot(0,6,TS,2, p.fence);  dot(0,11,TS,2, p.fence);
    dot(0,6,TS,1, 'rgba(255,255,255,.18)'); dot(0,11,TS,1, 'rgba(255,255,255,.20)');
    dot(2,3,2,2, p.fence); dot(12,3,2,2, p.fence);
    if (amt > 0.2){ dot(0,5,TS,1, sn); dot(2,2,2,1, sn); dot(12,2,2,1, sn); dot(0,10,TS,1, sn2); }
  }
  else if (t === T.GRASS){
    dot(0,0,TS,TS, p.grass);
    noise(p.leaf, 8);
  }
  else if (t === T.TREE){
    const bare = e.year==='2007' || e.year==='????' || e.year==='2026';
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    // 树池 + 落地阴影
    dot(3,12,10,4, '#1a2028'); dot(4,12,8,2, '#0f1419');
    dot(4,15,9,1, 'rgba(0,0,0,.35)');
    dot(7,7,3,7, p.trunk); dot(7,7,1,7, 'rgba(255,255,255,.08)');
    if (bare){
      // 光秃的枝：雪落在枝上，比一团亮色块好认
      dot(3,4,10,2, p.leaf); dot(6,2,2,5, p.leaf);
      dot(4,6,3,2, p.leaf); dot(10,5,2,4, p.leaf); dot(2,5,2,3, p.leaf);
      dot(9,2,1,1, p.leaf2);
      if (amt > 0.2){ dot(3,3,10,1, sn); dot(6,1,3,1, sn); dot(10,4,3,1, sn); }
      else { dot(3,4,10,1, p.leaf2); }
    } else {
      dot(2,1,13,9, p.leaf);
      dot(4,0,9,2, p.leaf2);
      dot(3,3,3,4, p.leaf2);
      dot(11,4,3,3, p.leaf2);
      dot(0,3,2,4, p.leaf);
      dot(4,1,7,1, 'rgba(255,255,255,.10)');
    }
  }
  else if (t === T.LAMP){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(6,13,5,4, '#1b222b'); dot(6,13,5,1, 'rgba(255,255,255,.10)');
    dot(4,15,9,1, 'rgba(0,0,0,.35)');
    dot(7,3,2,10, '#2b333c'); dot(7,3,1,10, 'rgba(255,255,255,.10)');
    dot(4,1,9,2, p.lamp);
    dot(4,1,9,1, '#ffffff');
    dot(3,0,11,1, 'rgba(255,255,255,.25)');
    g.globalAlpha = .22; dot(2,1,13,6, p.lamp); g.globalAlpha = 1;
  }
  else if (t === T.PROP){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    if (e.year === '2006'){
      dot(1,6,14,9, p.prop);
      dot(0,4,16,3, '#7a3b2e');
      dot(2,8,4,4, '#d8cfae'); dot(8,8,4,4, '#d8cfae');
      dot(3,9,2,2, '#b8a882'); dot(9,9,2,2, '#b8a882');
    } else if (e.year === '2007'){
      dot(2,8,12,6, p.prop); dot(1,6,14,3, '#3a4048');
      dot(2,6,12,1, sn);
    } else {
      dot(1,7,14,7, p.prop); dot(0,5,16,3, p.wall2);
      dot(1,5,14,1, 'rgba(255,255,255,.12)');
    }
  }
  else if (t === T.BENCH){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(0,14,TS,1, 'rgba(0,0,0,.32)');
    dot(0,4,TS,2, '#6a5442'); dot(0,6,TS,1, '#4a3a2c');   // 靠背
    dot(0,8,TS,3, '#7b6350'); dot(0,8,TS,1, '#8f755e');   // 椅面
    dot(2,11,2,4, '#232a33'); dot(12,11,2,4, '#232a33');   // 腿
    if (amt > 0.2){ dot(0,4,TS,1, sn); dot(0,8,TS,1, sn2); dot(3,7,4,1, sn); }
  }
  else if (t === T.BIN){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(4,6,8,9, '#2f3a45'); dot(4,6,8,1, '#455563'); dot(3,5,10,2, '#1e262e');
    dot(5,9,6,1, 'rgba(0,0,0,.4)'); dot(5,11,6,1, 'rgba(0,0,0,.4)');
    dot(4,15,8,1, 'rgba(0,0,0,.35)');
    if (amt > 0.2) dot(3,5,10,1, sn);
  }
  else if (t === T.POSTER){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(5,14,6,1, 'rgba(0,0,0,.35)');
    dot(7,9,2,6, '#2b333c');
    dot(1,2,14,9, '#20272f'); dot(1,2,14,1, '#3a4550');       // 灯箱框
    dot(2,3,12,7, '#f2e2c0');                                   // 发光的海报面
    dot(3,4,4,1, '#b8a888'); dot(3,6,7,1, '#c9b494'); dot(3,8,5,1, '#b8a888');
    dot(2,3,12,1, '#fff4d8');
    g.globalAlpha = .16; dot(-1,1,18,12, '#ffe6b0'); g.globalAlpha = 1;
    if (amt > 0.2) dot(1,1,14,1, sn);
  }
  else if (t === T.MACHINE){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2);
    dot(2,14,12,1, 'rgba(0,0,0,.35)');
    dot(2,2,12,13, '#1d242d'); dot(2,2,12,1, '#39434f');
    dot(3,3,10,6, '#8fc7e8'); dot(3,3,10,1, '#d8f0ff');        // 亮着的屏幕/灯箱
    dot(4,10,3,2, '#2a323b'); dot(9,10,3,2, '#2a323b');
    dot(5,12,6,2, '#11161c');
    g.globalAlpha = .14; dot(1,1,14,8, '#cfeeff'); g.globalAlpha = 1;
    if (amt > 0.2) dot(2,2,12,1, sn);
  }
  else if (t === T.WATER){
    dot(0,0,TS,TS, '#14202e');
    noise('#1d3040', 12);
  }
}

/* ───────── 站房立面：一个真的「入口」，也是画面里唯一的暖光主光源 ─────────
   世界坐标固定 288..352 × 106..146：正好落在开场镜头的中上方。
   上面 10 px 会被 HUD 压住，所以招牌和门洞都排在 HUD 下面。 */
function bakeFacade(g, p, e){
  const X = 288, Y = 106, W = 64;
  const warm = p.entr || '#ffcf8a';
  const dark = e.year === '????';
  const lit  = dark ? .35 : 1;

  // 雨棚：一块压在门洞上方的混凝土板 + 板下一道暖光
  g.fillStyle = '#121922'; g.fillRect(X-3, Y, W+6, 9);
  g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(X-3, Y, W+6, 1);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(X-3, Y+9, W+6, 2);
  g.globalAlpha = .30 * lit; g.fillStyle = warm; g.fillRect(X-2, Y+6, W+4, 2); g.globalAlpha = 1;

  // 灯箱招牌：长条形暖光，字不用看清，认得出是「站」
  g.globalAlpha = .18 * lit; g.fillStyle = warm; g.fillRect(X+6, Y+2, W-12, 12); g.globalAlpha = 1;
  g.fillStyle = dark ? '#2a251d' : '#f7e4bb'; g.fillRect(X+8, Y+3, W-16, 6);
  g.fillStyle = 'rgba(120,90,50,.75)';
  for (let i=0;i<3;i++) g.fillRect(X+13+i*13, Y+5, 7, 2);

  // 门洞：内侧一块暖色，玻璃门 + 竖框
  g.fillStyle = '#10161e'; g.fillRect(X+4, Y+11, W-8, 24);
  g.fillStyle = warm; g.globalAlpha = .55*lit; g.fillRect(X+6, Y+13, W-12, 20); g.globalAlpha = 1;
  g.fillStyle = dark ? '#2b2b2b' : '#3b4a58';
  g.fillRect(X+4, Y+11, W-8, 2);
  for (let i=0;i<3;i++) g.fillRect(X+12+i*16, Y+13, 2, 20);
  g.fillStyle = 'rgba(10,14,20,.55)'; g.fillRect(X+20, Y+13, 24, 20);
  g.fillStyle = 'rgba(255,240,205,.22)'; g.fillRect(X+21, Y+14, 22, 8);

  // 台阶 / 门前的雪被踩化成一摊湿地
  g.fillStyle = '#20272f'; g.fillRect(X+2, Y+35, W-4, 3);
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(X+2, Y+35, W-4, 1);
  g.globalAlpha = .26*lit; g.fillStyle = warm; g.fillRect(X+6, Y+38, W-12, 3); g.globalAlpha = 1;
}

/* ───────── 角色绘制 ─────────
   16×16 的小脸画不出五官，能认出「这是谁」的只有四件事：
   发量的形状、衣服的颜色和长度、手里拿着什么、身高差 1–2 px。
   所以一个人不是一张精灵图，而是由 opt 里这几件事拼出来的。 */
function drawChar(g, px, py, pal, dir, fr, opt){
  opt = opt || {};
  const X = Math.round(px), Y = Math.round(py);
  const R = (dx,dy,w,h,c) => { g.fillStyle = c; g.fillRect(X+dx, Y+dy, w, h); };
  const now = performance.now();

  const skin  = pal.skin  || '#e8b98f';
  const skin2 = pal.skin2 || '#c9946d';
  const hair  = pal.hair  || '#241a14';
  const hair2 = pal.hair2 || 'rgba(255,255,255,.10)';
  const shirt = pal.shirt || '#d94f63';
  const shirt2= pal.shirt2|| '#a83a4c';
  const pants = pal.pants || '#2f3a52';
  const shoe  = pal.shoe  || '#1a1512';

  const hs   = opt.hair || (opt.longHair ? 'long' : 'short');
  const lng  = hs === 'long';
  const pony = hs === 'ponytail';
  const mess = hs === 'messy';
  const tall = opt.build === 'tall' ? 1 : (opt.build === 'small' ? -1 : 0);

  const T0 = 1 - tall;            // 发顶
  const HD = 3 - tall;            // 皮肤头顶
  const BD = 8 - tall;            // 肩线
  const bw = opt.bulky ? 10 : 8;  // 肩宽
  const bx = 8 - (bw >> 1);
  const coat = opt.longCoat;      // 长外套，盖到膝盖
  const scarf = opt.scarf;
  const swing = fr ? 1 : 0;
  const sway = Math.sin(now / 190);

  /* ① 影子：两层，让脚真的落在地上 */
  R(3, 15, 10, 2, 'rgba(2,5,10,.42)');
  R(5, 17, 6, 1, 'rgba(2,5,10,.22)');

  /* ② 身后的东西：长发、包、吉他 */
  if (lng){
    R(1, HD-1, 14, 4, hair);              // 头顶的发块
    R(0, HD+2, 3, 9+tall, hair);          // 左侧垂发
    R(13, HD+2, 3, 9+tall, hair);         // 右侧垂发
    R(0, HD+2, 1, 9+tall, hair2);
  }
  if (pony){ R(6, HD+4, 4, 5, hair); R(6, HD+8, 3, 3, hair); }
  if (opt.bag){ R(13, BD+1, 3, 5, '#3d3126'); R(13, BD+1, 3, 1, '#584634'); }

  /* ③ 腿 / 鞋 */
  if (!swing){
    R(5, 13, 3, 3, pants); R(9, 13, 3, 3, pants);
    R(5, 15, 3, 1, shoe);  R(9, 15, 3, 1, shoe);
  } else {
    R(4, 13, 3, 3, pants); R(10, 13, 3, 3, pants);
    R(4, 15, 3, 1, shoe);  R(11, 15, 3, 1, shoe);
  }
  if (coat){ R(bx, 12, bw, 4, shirt2); R(bx+1, 13, bw-2, 3, shirt); }
  else     { R(5, 13, 2, 2, shirt2); R(9, 13, 2, 2, shirt2); }

  /* ④ 身体 */
  R(bx, BD, bw, 6, shirt);
  R(bx, BD, bw, 2, shirt2);                       // 肩上的暗部
  R(bx, BD, 1, 5, shirt2); R(bx+bw-1, BD, 1, 5, shirt2);
  R(bx+1, BD+3, bw-2, 1, 'rgba(255,255,255,.07)'); // 胸口的一点反光
  // 手臂
  if (swing){ R(bx-1, BD+2, 1, 3, shirt); R(bx+bw, BD+1, 1, 3, shirt); }
  else      { R(bx-1, BD+2, 1, 4, shirt); R(bx+bw, BD+2, 1, 4, shirt); }

  /* ⑤ 围巾：玩家的招牌（冻红的脖子上绕一圈，尾巴往后飘） */
  if (scarf){
    const tail = Math.round(sway);
    R(3, BD-1, 10, 2, scarf);
    R(3, BD+1, 10, 1, 'rgba(0,0,0,.22)');
    R(bx-2+tail, BD+1, 2, 4, scarf);
    R(bx-2+tail, BD+1, 2, 1, 'rgba(255,255,255,.25)');
    R(bx-3+tail, BD+4, 2, 2, scarf);
  }

  /* ⑥ 头 + 头发 */
  R(4, HD, 8, 6, skin);
  R(4, HD+5, 8, 1, skin2);
  if (dir !== 3){
    R(4, HD-1, 8, 3, hair);                     // 刘海
    R(3, HD, 2, 4, hair);  R(11, HD, 2, 4, hair); // 鬓角
    if (mess){
      R(4, HD-1, 3, 1, hair); R(9, HD-2, 3, 2, hair); R(5, HD+1, 1, 1, hair);
      R(10, HD+2, 1, 1, hair);
    }
    if (lng || pony){
      R(3, HD+1, 1, 5, hair); R(12, HD+1, 1, 5, hair);  // 脸两侧垂下的发
    }
    if (hs === 'bob'){ R(3, HD+1, 1, 3, hair); R(12, HD+1, 1, 3, hair); }
    // 眼睛
    const ex = dir === 1 ? 5 : dir === 2 ? 7 : 6;
    R(ex, HD+2, 2, 2, '#1b1410');
    if (dir === 0) R(ex+3, HD+2, 2, 2, '#1b1410');
    R(ex, HD+2, 1, 1, 'rgba(255,255,255,.55)');
    if (dir === 0) R(ex+3, HD+2, 1, 1, 'rgba(255,255,255,.55)');
    R(ex, HD+4, 2, 1, skin2);
    if (dir === 0) R(ex+3, HD+4, 2, 1, skin2);
  } else {
    // 背面：整颗头都是头发，长发的轮廓这时候最明显
    R(3, HD-1, 10, 7, hair);
    R(3, HD, 10, 1, hair2);
    if (lng) R(2, HD+4, 12, 8+tall, hair);
    if (scarf) R(3, BD-1, 10, 2, scarf);
  }

  /* ⑦ 帽 / 口罩 / 道具 */
  if (opt.hat === 'cap'){ R(3, T0-1, 10, 3, '#2b3242'); R(2, T0+2, 12, 1, '#3a4358'); R(3, T0-1, 10, 1, 'rgba(255,255,255,.10)'); }
  if (opt.hat === 'beanie'){ R(3, T0-1, 10, 3, '#7d4a58'); R(3, T0+2, 10, 1, '#96596a'); R(3, T0-2, 10, 1, '#a35c6e'); }
  if (opt.hat === 'headset'){ R(3, HD+1, 1, 3, '#2b2b2b'); R(12, HD+1, 1, 3, '#2b2b2b'); R(2, HD-1, 12, 1, '#2b2b2b'); }
  if (opt.mask && dir !== 3){ R(5, HD+3, 6, 2, '#c9d3de'); R(5, HD+3, 6, 1, '#e6eef6'); }

  if (opt.prop === 'camera' && dir !== 3){
    // 站姐：胸前一台相机，是她在人群里最好认的东西
    R(4, BD+2, 7, 4, '#15181d'); R(4, BD+2, 7, 1, '#2f363f');
    R(5, BD+3, 3, 2, '#0a0c0f'); R(8, BD+2, 2, 1, '#0a0c0f');
    R(6, BD+3, 2, 2, '#9fc6e0'); R(6, BD+3, 1, 1, '#e6f4ff');
    R(4, BD+1, 7, 1, 'rgba(0,0,0,.55)');
  }
  if (opt.prop === 'board' && dir !== 3){
    R(2, BD-4, 12, 5, '#e8e2d0'); R(2, BD-4, 12, 1, '#fff8e0');
    R(3, BD-3, 3, 2, '#c0455a'); R(7, BD-3, 3, 2, '#3d6fa8');
    R(7, BD-1, 3, 1, '#1a1a1a'); R(10, BD-1, 2, 1, '#1a1a1a');
    R(4, BD+1, 1, 4, '#6a5540'); R(11, BD+1, 1, 4, '#6a5540');
  }
  if (opt.prop === 'guitar' && dir !== 3){
    R(1, BD+1, 5, 5, '#a07a44'); R(2, BD+2, 2, 2, '#2b1d10');
    R(2, BD-2, 1, 4, '#4a3728'); R(1, BD-2, 2, 2, '#2b1d10');
    R(4, BD+5, 8, 2, '#8a6a3a');
  }
  if (opt.prop === 'case' && dir !== 3){
    R(1, BD+4, 4, 3, '#2b2f36'); R(1, BD+4, 4, 1, '#454b54'); R(2, BD+3, 1, 1, '#454b54');
  }
  if (opt.prop === 'phone' && dir !== 3){
    R(11, BD+2, 2, 3, '#0b0f14'); R(11, BD+2, 2, 2, '#bfe3ff');
    g.globalAlpha = .30; R(10, BD+1, 4, 5, '#bfe3ff'); g.globalAlpha = 1;
  }

  if (opt.glow){
    g.globalAlpha = .34;
    g.fillStyle = opt.glow;
    g.fillRect(X+1, Y-2, 14, 19);
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

  // 路灯的光池：每个时代一个暖/冷光源焦点
  for (const L of LAMPS){
    const lx = L.x - cam.x + 8, ly = L.y - cam.y + 5;
    if (lx < -50 || ly < -50 || lx > CW+50 || ly > CH+50) continue;
    const lg = g.createRadialGradient(lx, ly, 1, lx, ly, 38);
    lg.addColorStop(0, rgba(p.lamp, .42));
    lg.addColorStop(.35, rgba(p.lamp, .14));
    lg.addColorStop(1, rgba(p.lamp, 0));
    g.fillStyle = lg; g.fillRect(lx-38, ly-38, 76, 76);
  }

  drawWeather(g);

  // 光照 / 色调
  g.fillStyle = p.tint; g.globalAlpha = p.tintA;
  g.fillRect(0,0,CW,CH); g.globalAlpha = 1;

  // 暗角
  const grd = g.createRadialGradient(CW/2, CH/2, CH*0.35, CW/2, CH/2, CH*0.95);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, p.fog);
  g.globalAlpha = p.fogA * (titleMode ? 1.0 : 1.6);
  g.fillStyle = grd; g.fillRect(0,0,CW,CH);
  g.globalAlpha = 1;

  // 标题镜头的暖光池（标题文字背后的焦点光源）
  if (titleMode){
    // 抬一点曝光：标题不能压在一整块死黑上
    g.fillStyle = '#182640'; g.globalAlpha = .30;
    g.fillRect(0,0,CW,CH); g.globalAlpha = 1;
    const gx = CW*0.5, gy = CH*0.40;
    const tg = g.createRadialGradient(gx, gy, 2, gx, gy, 104);
    tg.addColorStop(0, 'rgba(255,228,176,.26)');
    tg.addColorStop(.45, 'rgba(255,196,128,.10)');
    tg.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = tg; g.fillRect(0,0,CW,CH);
  }

  // 背景层是全屏 CSS 模糊，没必要 60fps 重画：~12fps 就够，省移动端 GPU
  const nowMs = performance.now();
  if (nowMs - lastBgPaint > 80){ lastBgPaint = nowMs; paintBackdrop(); }
}

/* 把主画面 cover 裁切后画进小号背景层，由 CSS 模糊铺满屏幕 */
let lastBgPaint = 0;
function paintBackdrop(){
  if (!bgCtx || !bgCanvas) return;
  const bw = bgCanvas.width, bh = bgCanvas.height;
  const s = Math.max(bw/CW, bh/CH);
  const dw = CW*s, dh = CH*s;
  bgCtx.drawImage(canvas, (bw-dw)/2, (bh-dh)/2, dw, dh);
}

function rgba(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n>>16&255) + ',' + (n>>8&255) + ',' + (n&255) + ',' + a + ')';
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

  if (titleMode){
    // 标题画面：镜头极缓地漂移，人物不动，雪一直下
    updateCamera();
    cam.x = clamp(cam.x + Math.sin(t/11000)*10, 0, MAPW*TS - CW);
    cam.y = clamp(cam.y + Math.cos(t/15000)*4, 0, MAPH*TS - CH);
  } else {
    updatePlayer(dt);
    updateCamera();
  }
  stepWeather(dt);

  // NPC 朝向玩家
  for (const n of NPCS){
    if (n.wander){
      n.wt = (n.wt||0) + dt;
      if (n.wt > 2.2){ n.wt = 0; n.dir = (Math.random()*4)|0; }
    }
  }
  render(dt);
  rafId = requestAnimationFrame(loop);
}

/* 只允许有一条渲染循环：重开/重进时代都不会叠帧 */
function startLoop(){
  if (rafId) cancelAnimationFrame(rafId);
  lastT = performance.now();
  running = true;
  rafId = requestAnimationFrame(loop);
}
function stopLoop(){
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
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
