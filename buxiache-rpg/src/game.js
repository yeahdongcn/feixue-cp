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
let POSTER_LIGHTS = [];               // 灯箱 / 售票机在雪地上留的那一小片光
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
  rect(22,12,2,1,T.BENCH);            // 近景长椅：给画面一层前景
  rect(11,12,2,1,T.BENCH);            // 左下：补一块空白
  set(13,9,T.BIN); set(28,8,T.MACHINE);
  set(24,8,T.POSTER);
  set(11,8,T.LAMP); set(26,10,T.LAMP);

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
  POSTER_LIGHTS = [];
  for (let i=0;i<MAP.length;i++){
    const tx = i%MAPW, ty = (i/MAPW)|0;
    if (MAP[i] === T.LAMP) LAMPS.push({ x:tx*TS, y:ty*TS });
    if (MAP[i] === T.POSTER) POSTER_LIGHTS.push({ x:tx*TS+8, y:ty*TS+3, c:'#f7e4bb' });
    if (MAP[i] === T.MACHINE) POSTER_LIGHTS.push({ x:tx*TS+8, y:ty*TS+3, c:'#8fc7e8' });
  }
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
    pal:{ sky:'#071018', pave:'#4c5a6b', pave2:'#5a6879', road:'#2e363f', road2:'#39424d',
          wall:'#2a333d', wall2:'#35404c', win:'#a8dcff', fence:'#4b5766', grass:'#2f3b46',
          leaf:'#33524a', leaf2:'#3f6459', trunk:'#2f3a42', lamp:'#cdeeff', prop:'#3a4552',
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
  bakeAO(g);
  atlas = cv; atlasEra = e.year;
}

/* 楼脚往地上压一道影：把「墙」和「地」钉在一起，
   没有这道影，地面再怎么铺也像悬在墙上的贴图。 */
function bakeAO(g){
  for (let ty=1; ty<MAPH; ty++){
    for (let tx=0; tx<MAPW; tx++){
      const t = MAP[ty*MAPW+tx];
      if (t !== T.WALL && t !== T.DOOR) continue;
      if (MAP[(ty+1)*MAPW+tx] === T.WALL || MAP[(ty+1)*MAPW+tx] === T.DOOR) continue;
      const X = tx*TS, Y = (ty+1)*TS;
      const grd = g.createLinearGradient(0, Y, 0, Y+28);
      grd.addColorStop(0, 'rgba(2,5,10,.44)');
      grd.addColorStop(.40, 'rgba(2,5,10,.16)');
      grd.addColorStop(1, 'rgba(2,5,10,0)');
      g.fillStyle = grd; g.fillRect(X, Y, TS, 28);
    }
  }
}

/* 每格的确定性随机：烘焙一次就不动了，不会每帧闪 */
function th(tx, ty, salt){
  // 必须用 Math.imul：h*1274126177 会超过 2^53，低位被浮点精度吃掉，
  // 结果就是「随机数」带周期，雪点排成格子。
  let h = Math.imul(tx, 374761393) + Math.imul(ty, 668265263) + Math.imul(salt||0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
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
    for (let i=0;i<n;i++){
      const rx = (th(tx*7+i, ty, 100+(salt||0)+i) * TS) | 0;
      const ry = (th(tx, ty*7+i, 200+(salt||0)+i) * TS) | 0;
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
  // 铺过石板的地方：楼前那两排 + 从站房门一直通到镜头前的那条路
  const pavedHere = ty <= 8 || t === T.PLAT || t === T.ROAD;

  /* 地面板材：错缝铺的石头（奇偶行竖缝错开半块）+ 每块自己的深浅。
     一块一块的小色差比亮线更能让人读出「这是地」，也才不像方格纸。 */
  const slabs = (base, line, hi, grain, seams) => {
    dot(0,0,TS,TS, base);
    // 石板自己的深浅（按 32×32 一块，硬边在这里是对的：石板本来就是一块一块的）
    if (seams){
      const tone = th(tx >> 1, ty >> 1, 1);
      if (tone > 0.62) dot(0,0,TS,TS, 'rgba(255,255,255,.016)');
      else if (tone < 0.32) dot(0,0,TS,TS, 'rgba(0,0,0,.038)');
    }
    if (grain) noise(grain, seams ? 4 : 9, 1);
    // 只有「铺过的地方」才有石缝：楼前的石板地 + 一条通到镜头前的路。
    // 整片雪地上如果还画满网格，那块地一定会被读成一堵瓷砖墙。
    if (seams){
      if (ty & 1){ dot(0, TS-1, TS, 1, line); dot(0, TS-2, TS, 1, hi); }
      if (tx & 1 && th(tx,ty,7) > .3) dot(TS-1, 0, 1, TS, line);
    } else {
      // 雪面：只有压出来的痕，没有线
      if (th(tx,ty,13) > .82) dot(2+(th(tx,ty,14)*10|0), 3+(th(tx,ty,15)*10|0), 3, 1, 'rgba(255,255,255,.06)');
    }
  };

  /* 一层薄雪：两行，下面一行收窄。
     不要做成「下宽上窄的白色小帐篷」——在 4 倍缩放下那会像撒了一地蘑菇。 */
  const snowA = a => {
    const n = parseInt(sn.slice(1), 16);
    return 'rgba(' + (n>>16&255) + ',' + (n>>8&255) + ',' + (n&255) + ',' + a + ')';
  };
  const patch = (x, y, w, a) => {
    if (w < 3) return;
    dot(x+1, y, Math.max(1, w-2), 1, snowA(a*0.55));
    dot(x, y+1, w, 1, snowA(a));
    dot(x+1, y+2, Math.max(1, w-2), 1, snowA(a*0.45));
  };
  const drift = (x, y, w, a) => {
    patch(x, y, w, a);
    if (w > 5){
      dot(x+2, y+1, Math.max(1, w-4), 1, snowA(Math.min(1, a*1.35)));
      dot(x+3, y-1, Math.max(1, w-6), 1, snowA(a*0.7));
    }
  };

  if (t === T.PAVE){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    if (amt > 0.15){
      // 沿楼脚堆起来的雪：只对「墙 / 门」触发。
      // 对所有实心物都触发的话，每张长椅、每棵树下面都会摊一块白药片。
      if (up === T.WALL || up === T.DOOR){
        const c3 = th(tx,ty,70);
        if (c3 > 0.20) drift(c3 > .62 ? 0 : 6, 1, 7 + (c3*6|0), 0.56);
      } else if (solidish(up)){
        // 物脚：压一道接触影，比铺一块浅色雪更像「东西压在地上」
        dot(2, 2, 12, 2, 'rgba(8,12,18,.16)');
        dot(4, 4, 8, 1, 'rgba(8,12,18,.10)');
      }
      // 霜点：任何「按格铺一块颜色」都会在 16px 上露出硬边，
      // 整片地就会被读成一张方格纸。地面的明暗交给光池和空气透视。
      noise('rgba(235,245,255,.11)', 2, 9);
      if (th(tx,ty,33) > .72) noise('rgba(255,255,255,.50)', 1, 37);
      // 地面不铺「按格的颜色」：16/32px 的硬边在 4 倍下就是一张方格纸。
      // 明暗交给光池（平滑渐变）和空气透视，它们都没有边。
    }
    // 人踩出来的雪路：只有脚印，不铺色块（色块才有直边）
    if (amt > 0.15){
      // 脚印 = 暗芯 + 下沿一道亮边。只有暗点会被读成污渍，只有亮边会被读成刮痕；
      // 两像素叠在一起才是「雪被踩下去了」。原来的 .30 纯暗点在这片雪上根本看不见。
      const step = (px, py) => {
        dot(px, py, 2, 1, 'rgba(14,21,30,.46)');
        dot(px, py+1, 2, 1, 'rgba(226,240,255,.15)');
      };
      if (tx >= 19 && tx <= 21 && ty >= 8){
        const ph = ((ty & 1) ? 0 : 1);
        step(5 + ph*3, 4 + (th(tx,ty,90)*3|0));
        step(8 + ph*3, 10 + (th(tx,ty,91)*3|0));
      }
      // 斜着穿过去的一条 + 靠长椅的一条，位置固定，不走随机
      if (((tx*2 + ty*3) % 17) === 3 && ty >= 9){
        step(3 + (ty%3)*3, 5 + (tx%2)*5);
        step(9, 11);
      }
      if (tx >= 13 && tx <= 16 && ty >= 9 && ty <= 11 && ((ty+tx) & 1)){
        step(6, 7);
      }
    }
    // 极淡的冰面反光（夜里的光会落在这些点上）
    if (th(tx,ty,21) > 0.88) dot(2 + (th(tx,ty,22)*11|0), 2 + (th(tx,ty,23)*11|0), 2, 1, 'rgba(210,235,255,.14)');
  }
  else if (t === T.PLAT){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    // 站台边：靠轨道一侧是白色安全线 + 黄色盲道 + 一道落下去的阴影
    if (dn !== T.PLAT){
      dot(0,0,TS,3, '#d8b24a');
      dot(1,0,1,2,'#f0cf7a'); dot(5,0,1,2,'#f0cf7a'); dot(9,0,1,2,'#f0cf7a'); dot(13,0,1,2,'#f0cf7a');
      dot(0,5,TS,1,'#dfe9f5');
      dot(0,6,TS,3,'rgba(0,0,0,.42)');
      dot(0,9,TS,2,'rgba(0,0,0,.22)');
    }
    if (up !== T.PLAT) { dot(0,0,TS,2, p.curb); dot(0,2,TS,2,'rgba(0,0,0,.25)'); if (amt>0.15 && th(tx,ty,35)>.5) patch(2,1,7,0.40); }
    if (amt > 0.2) { patch(0, TS-2, 7, 0.40); patch(10, TS-3, 6, 0.32); }
    if (amt > 0.2 && th(tx,ty,31) > .55) patch(2+(th(tx,ty,32)*9|0), 8+(th(tx,ty,33)*5|0), 4 + (th(tx,ty,34)*3|0), 0.36);
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
      dot(0,0,TS,1, 'rgba(255,255,255,.09)');
      dot(0,2,TS,1, 'rgba(0,0,0,.44)');
      if (amt > 0.15){
        const a = th(tx,ty,80), b = th(tx,ty,81);
        if (a > 0.46) patch((b*10|0), 1, 4 + (a*5|0), 0.42);
        if (a > 0.82) drift(10, 0, 6, 0.46);
      }
    }
    if (dn !== T.ROAD && ty > 15){ dot(0,0,TS,2, p.curb); if (amt>0.15 && th(tx,ty,83)>.55) patch(3,1,6,0.34); }
    if (amt > 0.15 && th(tx,ty,41) > 0.74) patch(2+(th(tx,ty,42)*10|0), 8+(th(tx,ty,43)*6|0), 4 + (th(tx,ty,44)*3|0), 0.32);
    // 井盖：只是一块略微不同的沥青，不做描边（描边会被读成 UI 方块）
    if (ty === 14 && tx%7===3){ dot(4,8,8,1,'rgba(0,0,0,.10)'); dot(5,9,6,4,'rgba(0,0,0,.13)'); dot(4,13,8,1,'rgba(255,255,255,.04)'); }
  }
  else if (t === T.WALL){
    // 广电大楼：竖缝 + 成对的窗（窗口有框、有窗台，才不会被看成 UI 方块）
    dot(0,0,TS,TS, p.wall);
    noise(p.wall2, 5, 3);
    dot(TS-1,0,1,TS, 'rgba(0,0,0,.20)');
    if (ty === 6){
      // 楼脚：檐口 + 一排售票厅的暖光窗带 + 墙裙，楼才像「站」在地上
      const dark = e.year === '????';
      dot(0,0,TS,1, 'rgba(255,255,255,.08)');
      dot(0,1,TS,2, p.wall2);
      dot(0,3,TS,1, 'rgba(0,0,0,.38)');
      dot(0,4,TS,1, '#111820');
      // 楼基：一扇深色的大门洞 + 只亮一格的边窗。
      // 一整排暖色方块在 4 倍下会读成一排砖，暖光只留给入口那一处。
      dot(0,3,TS,9, '#131a22');
      dot(2,4,6,7, '#0d1319');                        // 暗窗
      dot(2,4,6,1, 'rgba(120,160,190,.16)');          // 玻璃的一点反光
      dot(9,4,6,7, '#182029');
      dot(9,4,6,1, 'rgba(150,180,205,.12)');
      dot(7,3,2,9, '#1a222c');                        // 中梃
      dot(0,12,TS,2, p.wall2);                        // 窗台
      dot(0,14,TS,2, 'rgba(0,0,0,.26)');
    } else {
      const wy = (ty%2===0) ? 3 : 9;
      if (tx%2===0){
        const lit = ((tx*13+ty*7) % 7) < (e.year==='2014'?3:4);
        const glass = lit ? p.win : '#1c222a';
        for (const wx of [2, 9]){
          dot(wx-1, wy-1, 8, 9, '#11171f');           // 窗框
          dot(wx, wy, 6, 7, glass);                   // 玻璃
          dot(wx, wy, 6, 1, '#11171f');               // 上亮子
          dot(wx+2, wy, 1, 7, 'rgba(0,0,0,.22)');     // 中梃
          dot(wx, wy, 6, 1, lit ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.10)');
          dot(wx-1, wy+8, 8, 1, p.wall2);             // 窗台
        }
        if (lit){
          g.globalAlpha = .14; dot(2,wy-1,15,9, p.win); g.globalAlpha = 1;
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
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(0,14,TS,2, 'rgba(0,0,0,.30)');
    dot(2,5,2,11, p.fence); dot(12,5,2,11, p.fence);
    dot(2,5,1,11, 'rgba(255,255,255,.14)'); dot(12,5,1,11, 'rgba(255,255,255,.14)');
    dot(0,6,TS,2, p.fence);  dot(0,11,TS,2, p.fence);
    dot(0,6,TS,1, 'rgba(255,255,255,.18)'); dot(0,11,TS,1, 'rgba(255,255,255,.20)');
    dot(2,3,2,2, p.fence); dot(12,3,2,2, p.fence);
    if (amt > 0.2){
      // 栏杆上的雪：只在杆子上加一层柔白，不做成一串虚线
      dot(0,5,TS,1, 'rgba(214,230,246,.26)');
      dot(0,4,TS,1, 'rgba(214,230,246,.12)');
      dot(2,2,2,1, 'rgba(226,238,251,.45)'); dot(12,2,2,1, 'rgba(226,238,251,.45)');
      dot(0,11,TS,1, 'rgba(170,190,210,.22)');
    }
  }
  else if (t === T.GRASS){
    dot(0,0,TS,TS, p.grass);
    noise(p.leaf, 8);
  }
  else if (t === T.TREE){
    const pine = e.year==='2007' || e.year==='2026';
    const bare = e.year==='????';
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    // 树池 + 落地阴影
    dot(4,12,8,3, '#2b3441'); dot(4,12,8,1, '#1d2530');
    if (amt > 0.2) dot(4,12,8,1, snowA(.35));
    dot(4,15,8,1, 'rgba(0,0,0,.28)');
    if (pine){
      // 雪松。一格 16px 的树冠只有 12px 高——比 16px 的人还矮，读出来是一丛灌木。
      // 上面一格是空地时，树冠就往上一格长：从 26px 高，人才是站在树下。
      // 雪只落在每一层的顶棱上、断成两段；原来还有落在树冠外面的白点
      // （dot(3,10,2) / dot(11,10,2)），4 倍下是几道「悬空的刮痕」。
      dot(7,13,2,3, p.trunk);
      if (GROUNDY(up)){
        dot(2,9,12,4, p.leaf);              // 下冠  y 9–12
        dot(3,4,10,5, p.leaf);              // 中下   y 4–8
        dot(4,-1,8,5, p.leaf);              // 中上   y -1–3
        dot(5,-7,6,6, p.leaf);              // 上     y -7–-2
        dot(6,-13,4,6, p.leaf);             // 顶     y -13–-8
        // 每层露在上一层外面的那一圈，右侧压暗：层与层才分得开，不然是一个三角
        dot(13,9,1,4, 'rgba(0,0,0,.15)'); dot(12,4,1,5, 'rgba(0,0,0,.14)');
        dot(11,-1,1,5, 'rgba(0,0,0,.13)'); dot(10,-7,1,6, 'rgba(0,0,0,.12)');
        dot(6,-13,1,6, 'rgba(0,0,0,.10)');
        if (amt > 0.2){
          dot(2,9,4,1, snowA(.92));  dot(8,9,4,1, snowA(.55));
          dot(3,4,4,1, snowA(.92));  dot(8,4,3,1, snowA(.52));
          dot(4,-1,3,1, snowA(.90)); dot(8,-1,2,1, snowA(.48));
          dot(5,-7,3,1, snowA(.90));
          dot(6,-13,3,1, snowA(.94));
        }
      } else {
        dot(4,9,8,3, p.leaf);  dot(5,12,6,1, p.leaf);
        dot(5,6,6,3, p.leaf);
        dot(6,3,4,3, p.leaf);
        dot(7,1,2,2, p.leaf);
        dot(5,10,6,1, p.leaf2); dot(6,7,4,1, p.leaf2);
        dot(10,9,2,3, 'rgba(0,0,0,.13)'); dot(9,6,2,3, 'rgba(0,0,0,.12)');
        if (amt > 0.2){
          dot(5,9,3,1, snowA(.92));  dot(9,9,1,1, snowA(.45));
          dot(6,6,2,1, snowA(.92));  dot(9,6,1,1, snowA(.42));
          dot(6,3,2,1, snowA(.90));
          dot(7,1,2,1, snowA(.94));
        }
      }
    } else if (bare){
      // ????：光秃的枝
      dot(7,7,3,7, p.trunk); dot(7,7,1,7, 'rgba(255,255,255,.08)');
      dot(3,4,10,2, p.leaf); dot(6,2,2,5, p.leaf);
      dot(4,6,3,2, p.leaf); dot(10,5,2,4, p.leaf); dot(2,5,2,3, p.leaf);
      dot(9,2,1,1, p.leaf2);
    } else {
      // 有叶子的树：夏天、春天、舞台外
      dot(7,7,3,7, p.trunk); dot(7,7,1,7, 'rgba(255,255,255,.08)');
      dot(2,1,13,9, p.leaf);
      dot(4,0,9,2, p.leaf2);
      dot(3,3,3,4, p.leaf2);
      dot(11,4,3,3, p.leaf2);
      dot(0,3,2,4, p.leaf);
      dot(4,1,7,1, 'rgba(255,255,255,.10)');
    }
  }
  else if (t === T.LAMP){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(6,13,5,4, '#1b222b'); dot(6,13,5,1, 'rgba(255,255,255,.10)');
    dot(4,15,9,1, 'rgba(0,0,0,.35)');
    dot(7,3,2,10, '#2b333c'); dot(7,3,1,10, 'rgba(255,255,255,.10)');
    dot(4,1,9,2, p.lamp);
    dot(4,1,9,1, '#ffffff');
    dot(3,0,11,1, 'rgba(255,255,255,.25)');
    // 灯罩的溢光交给 drawLights 的径向渐变（见 groundPool）；
    // 这里原来是一块 13×6 的半透明色块，4 倍放大后是一盏「发光的方盒子」，
    // 「像素灯」和「贴图坏了」的区别只在这条边上。
  }
  else if (t === T.PROP){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    if (e.year === '2006'){
      dot(1,6,14,9, p.prop);
      dot(0,4,16,3, '#7a3b2e');
      dot(2,8,4,4, '#d8cfae'); dot(8,8,4,4, '#d8cfae');
      dot(3,9,2,2, '#b8a882'); dot(9,9,2,2, '#b8a882');
    } else if (e.year === '2007'){
      dot(2,8,12,6, p.prop); dot(1,6,14,3, '#3a4048');
      dot(2,6,12,1, snowA(.55));
    } else {
      dot(1,7,14,7, p.prop); dot(0,5,16,3, p.wall2);
      dot(1,5,14,1, 'rgba(255,255,255,.12)');
    }
  }
  else if (t === T.BENCH){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(0,13,TS,3, 'rgba(6,10,16,.26)');
    dot(0,14,TS,2, 'rgba(6,10,16,.20)');
    dot(0,4,TS,2, '#6a5442'); dot(0,6,TS,1, '#4a3a2c');   // 靠背
    dot(0,7,TS,1, '#2e241b');                              // 靠背和椅面之间的那道缝（原来这条是空的，4 倍下椅面像浮在靠背上）
    dot(0,8,TS,3, '#7b6350'); dot(0,8,TS,1, '#8f755e');   // 椅面
    dot(2,11,2,4, '#232a33'); dot(12,11,2,4, '#232a33');   // 腿
    if (amt > 0.2){ dot(0,4,TS,1, snowA(.55)); dot(0,8,TS,1, snowA(.35)); }
  }
  else if (t === T.BIN){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(4,6,8,9, '#2f3a45'); dot(4,6,8,1, '#455563'); dot(3,5,10,2, '#1e262e');
    dot(5,9,6,1, 'rgba(0,0,0,.4)'); dot(5,11,6,1, 'rgba(0,0,0,.4)');
    dot(4,15,8,1, 'rgba(0,0,0,.35)');
    if (amt > 0.2) dot(3,5,10,1, snowA(.5));
  }
  else if (t === T.POSTER){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(5,14,6,1, 'rgba(0,0,0,.35)');
    dot(7,9,2,6, '#2b333c');
    dot(1,2,14,9, '#20272f'); dot(1,2,14,1, '#3a4550');       // 灯箱框
    dot(2,3,12,7, '#f2e2c0');                                   // 发光的海报面
    dot(3,4,4,1, '#b8a888'); dot(3,6,7,1, '#c9b494'); dot(3,8,5,1, '#b8a888');
    dot(2,3,12,1, '#fff4d8');
    g.globalAlpha = .16; dot(-1,1,18,12, '#ffe6b0'); g.globalAlpha = 1;
    if (amt > 0.2) dot(1,1,14,1, snowA(.5));
  }
  else if (t === T.MACHINE){
    slabs(p.pave, p.paveLine || 'rgba(0,0,0,.22)', p.paveHi || 'rgba(255,255,255,.05)', p.pave2, pavedHere);
    dot(2,14,12,1, 'rgba(0,0,0,.35)');
    dot(2,2,12,13, '#1d242d'); dot(2,2,12,1, '#39434f');
    dot(3,3,10,6, '#8fc7e8'); dot(3,3,10,1, '#d8f0ff');        // 亮着的屏幕/灯箱
    dot(4,10,3,2, '#2a323b'); dot(9,10,3,2, '#2a323b');
    dot(5,12,6,2, '#11161c');
    g.globalAlpha = .14; dot(1,1,14,8, '#cfeeff'); g.globalAlpha = 1;
    if (amt > 0.2) dot(2,2,12,1, snowA(.5));
  }
  else if (t === T.WATER){
    dot(0,0,TS,TS, '#14202e');
    noise('#1d3040', 12);
  }
}

/* ───────── 站房立面：画面里唯一的暖光主光源 ─────────
   世界坐标固定 288..352 × 106..146，开场镜头正好把它放在中上方。
   最上面 10 px 会被 HUD 压住，所以招牌和门洞都排在 HUD 下面。 */
function bakeFacade(g, p, e){
  const X = 288, Y = 106, W = 64;
  const warm = p.entr || '#ffcf8a';
  const dark = e.year === '????';
  const lit  = dark ? .42 : 1;
  const R = (x,y,w,h,c) => { g.fillStyle = c; g.fillRect(x,y,w,h); };

  // ── 雨棚：混凝土板 + 板下被灯照到的一条暖边 ──
  R(X-4, Y, W+8, 8, '#0f161e');
  R(X-4, Y, W+8, 1, 'rgba(255,255,255,.13)');
  g.globalAlpha = .40*lit; R(X-3, Y+6, W+6, 2, warm); g.globalAlpha = 1;
  R(X-4, Y+8, W+8, 2, 'rgba(0,0,0,.52)');

  // ── 灯箱招牌：先铺辉光，再画灯面，最后是三道看不清的字 ──
  // 辉光只往上下化，左右不出招牌外框：两块半透明色块叠出来的直角边，
  // 在 4 倍下就是招牌外面套了一个「更亮的方盒子」。
  const sg = g.createLinearGradient(0, Y - 3, 0, Y + 17);
  sg.addColorStop(0, rgba(warm, 0));
  sg.addColorStop(.34, rgba(warm, .26 * lit));
  sg.addColorStop(.55, rgba(warm, .30 * lit));
  sg.addColorStop(1, rgba(warm, 0));
  g.fillStyle = sg; g.fillRect(X, Y - 3, W, 20);
  R(X+7, Y+2, W-14, 8, '#0d141c');
  R(X+8, Y+3, W-16, 6, dark ? '#3a342a' : '#fff3d4');
  // 三道看不清的字：要居中。原来左起 13 / 24 / 35，右边空出 13px，
  // 整块招牌读起来是「字打在左边、右边糊了一块」
  R(X+17, Y+5, 8, 2, dark ? '#6a5f48' : '#8a5a30');
  R(X+28, Y+5, 8, 2, dark ? '#6a5f48' : '#8a5a30');
  R(X+39, Y+5, 8, 2, dark ? '#6a5f48' : '#8a5a30');
  g.globalAlpha = .65*lit; R(X+8, Y+3, W-16, 1, '#ffffff'); g.globalAlpha = 1;

  // ── 门洞：玻璃后面是一个真的「大厅」——顶灯、亮地板、暗色的门框
  R(X+3, Y+13, W-6, 22, '#080d13');
  R(X+5, Y+15, W-10, 18, '#16222e');
  // 大厅的地面被里面的灯照亮
  g.globalAlpha = .85*lit; R(X+5, Y+26, W-10, 7, warm); g.globalAlpha = 1;
  g.globalAlpha = .40*lit; R(X+5, Y+23, W-10, 3, '#ffe3ad'); g.globalAlpha = 1;
  // 顶灯：两道横条，分在门的两侧（门在正中，顶灯就不能压在门上）
  g.globalAlpha = .9*lit; R(X+8, Y+16, 9, 1, '#fff6dd'); R(X+47, Y+16, 9, 1, '#fff6dd'); g.globalAlpha = 1;
  // 玻璃上的冷反光（和里面的暖光对着，玻璃才像玻璃）
  g.globalAlpha = .22; R(X+7, Y+15, 4, 18, '#dff0ff'); R(X+53, Y+15, 3, 18, '#dff0ff'); g.globalAlpha = 1;
  // 门框：竖梃和横梁 —— 只留两根，中间那格让给门
  g.fillStyle = '#1b2530';
  g.fillRect(X+13, Y+14, 2, 20); g.fillRect(X+45, Y+14, 2, 20);
  R(X+3, Y+13, W-6, 2, '#2b3742');
  R(X+3, Y+33, W-6, 2, '#1b2530');
  // ── 正中的那扇门 ──
  // 原来一面墙全是四格玻璃，整栋楼读成「一排橱窗」，玩家找不到「那扇门」。
  // 门要能被认出来，靠三件事：比玻璃深一档的门洞、一条门缝漏出来的光、一道推杠。
  R(X+20, Y+12, 24, 21, '#0a1017');                    // 门洞（比玻璃更深的暗）
  R(X+22, Y+14, 20, 19, '#1b2836');                    // 两扇门板
  R(X+23, Y+15, 8, 17, '#2b3d4d'); R(X+33, Y+15, 8, 17, '#2b3d4d');
  R(X+23, Y+15, 8, 1, 'rgba(255,255,255,.13)'); R(X+33, Y+15, 8, 1, 'rgba(255,255,255,.13)');
  g.globalAlpha = .9*lit; R(X+31, Y+14, 2, 19, '#ffd79a'); g.globalAlpha = 1;  // 门缝里的光
  R(X+24, Y+26, 5, 1, '#b9c8d6'); R(X+35, Y+26, 5, 1, '#b9c8d6');             // 推杠
  R(X+20, Y+12, 24, 1, '#33414f');                     // 门楣
  R(X+20, Y+12, 1, 21, '#33414f'); R(X+43, Y+12, 1, 21, '#33414f');
  // 门槛下漏出来的一条光
  g.globalAlpha = .5*lit; R(X+8, Y+34, W-16, 2, '#ffedc4'); g.globalAlpha = 1;

  // ── 台阶 + 门口被踩化的那摊湿地 ──
  R(X+2, Y+35, W-4, 3, '#1b232c');
  R(X+2, Y+35, W-4, 1, 'rgba(255,255,255,.18)');
  g.globalAlpha = .32*lit; R(X+5, Y+38, W-10, 4, warm); g.globalAlpha = 1;
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
  R(4, 15, 8, 1, 'rgba(2,5,10,.28)');
  R(2, 16, 12, 1, 'rgba(2,5,10,.17)');
  R(5, 17, 6, 1, 'rgba(2,5,10,.09)');
  /* ①' 深色剪影：16px 的人在中间调的地面上很容易糊掉，先垫一层描边，
     后面画上去的部分会盖住中间，只在轮廓上留 1px 暗边 */
  R(3, BD-2, 10, 8, 'rgba(6,9,14,.5)');
  R(5, 13, 6, 4, 'rgba(6,9,14,.5)');

  /* ② 身后的东西：长发、包、吉他 */
  if (lng){
    R(2, HD-1, 12, 3, hair);              // 头顶的发块（收窄，不然像头套）
    R(1, HD+1, 2, 8+tall, hair);          // 左侧垂发：到肩，不到腰
    R(13, HD+1, 2, 8+tall, hair);
    R(1, HD+1, 1, 8+tall, hair2);
  }
  if (pony){ R(6, HD+4, 4, 5, hair); R(6, HD+8, 3, 3, hair); }
  if (opt.bag){ R(13, BD+1, 3, 5, '#3d3126'); R(13, BD+1, 3, 1, '#584634'); }

  /* ③ 腿 / 鞋 */
  if (!swing){
    R(5, 13, 2, 3, pants); R(9, 13, 2, 3, pants);
    R(4, 15, 3, 1, shoe);  R(9, 15, 3, 1, shoe);
  } else {
    R(5, 13, 2, 3, pants); R(9, 13, 2, 3, pants);
    R(4, 15, 3, 1, shoe);  R(10, 15, 3, 1, shoe);
  }
  if (coat){ R(bx, 12, bw, 4, shirt2); R(bx+1, 13, bw-2, 3, shirt); }
  else     { R(5, 13, 2, 2, shirt2); R(9, 13, 2, 2, shirt2); }

  /* ④ 身体 */
  R(bx, BD, bw, 6, shirt);
  R(bx, BD, bw, 2, shirt2);                       // 肩上的暗部
  R(bx, BD, 1, 5, shirt2); R(bx+bw-1, BD, 1, 5, shirt2);
  R(bx+1, BD+4, 2, 1, 'rgba(255,255,255,.08)');   // 胸口的一点反光
  // 手臂
  if (swing){ R(bx-1, BD+2, 1, 3, shirt2); R(bx+bw, BD+1, 1, 3, shirt2); }
  else      { R(bx-1, BD+2, 1, 4, shirt2); R(bx+bw, BD+2, 1, 4, shirt2); }

  /* ⑤ 围巾：玩家的招牌（脖子上绕一圈，一小截垂在胸前，一截在身后飘）
     注意脸的下沿就是 BD 行（HD+5）：围巾一旦画到 BD-1 就把嘴盖住了，
     4 倍下是一道横贯口鼻的红块。所以围巾压在肩线 BD+1 上，嘴留给脸。 */
  if (scarf){
    const tail = Math.round(sway * 0.9);
    R(4, BD, 8, 1, 'rgba(0,0,0,.24)');            // 下巴投在围巾上的影
    R(4, BD+1, 8, 2, scarf);                      // 脖子上绕一圈
    R(4, BD+1, 8, 1, 'rgba(255,255,255,.22)');
    R(4, BD+2, 8, 1, 'rgba(0,0,0,.20)');
    R(9, BD+3, 1, 2, scarf);                      // 垂在胸前的短尾
    R(9, BD+4, 1, 1, 'rgba(0,0,0,.20)');
    // 左肩垂下来的一截：接在围巾上，不能飘断
    R(3, BD+1, 2, 1, scarf);
    R(2, BD+2, 2, 2, scarf);
    R(2, BD+4, 1, 1 + (tail > 0 ? 1 : 0), scarf);
  }

  /* ⑥ 头 + 头发 */
  R(4, HD, 8, 6, skin);
  R(4, HD+5, 8, 1, skin2);
  if (dir !== 3){
    /* 头发是唯一在 16px 下还读得出来的「脸型」，所以先定发型再补五官 */
    if (lng){
      // 长直发：头顶圆一点，两绺垂到肩，末端收一格
      R(3, HD-2, 10, 2, hair);
      R(2, HD-1, 12, 2, hair);
      R(2, HD+1, 2, 7+tall, hair);  R(12, HD+1, 2, 7+tall, hair);
      R(2, HD+7+tall, 1, 2, hair);  R(13, HD+7+tall, 1, 2, hair);
      R(4, HD-2, 8, 1, hair2);        // 头顶的柔光
    } else if (pony){
      R(3, HD-2, 10, 3, hair); R(3, HD, 1, 4, hair); R(12, HD, 1, 4, hair);
      R(5, HD+3, 4, 5, hair); R(5, HD+7, 3, 2, hair);
    } else {
      // 短发 / 乱发：额前几撮，形状不对称
      R(3, HD-2, 10, 3, hair);
      R(3, HD, 1, 3, hair); R(12, HD, 1, 3, hair);
      if (mess){
        R(4, HD-3, 4, 1, hair); R(9, HD-3, 2, 1, hair);
        R(3, HD-3, 2, 2, hair); R(11, HD-1, 1, 2, hair);
        R(6, HD+1, 1, 2, hair);        // 一撮掉在额头上
      } else {
        R(4, HD-1, 8, 1, hair);
      }
    }
    // 眼睛：2×2 的暗块 + 下面 1px 的皮肤暗部（1px 的竖条在 4 倍下像一道缝）
    const ey = HD + 2;
    if (dir === 0){
      R(5, ey, 2, 2, '#181210'); R(9, ey, 2, 2, '#181210');
      R(5, ey+2, 2, 1, skin2); R(9, ey+2, 2, 1, skin2);
    } else if (dir === 1){
      R(4, ey, 2, 2, '#181210'); R(4, ey+2, 2, 1, skin2);
    } else {
      R(10, ey, 2, 2, '#181210'); R(10, ey+2, 2, 1, skin2);
    }
    R(7, HD+4, 1, 1, '#8d4f48');               // 嘴（1px 就够，2px 像涂了口红）
    R(8, HD+4, 1, 1, skin2);
  } else {
    // 背面：整颗头都是头发，长发的轮廓这时候最明显
    R(2, HD-1, 12, 7, hair);
    R(2, HD-1, 12, 2, hair2);          // 头顶的柔光
    R(4, HD+2, 8, 1, 'rgba(0,0,0,.20)');
    R(4, HD+5, 8, 1, 'rgba(0,0,0,.14)');
    R(7, HD+1, 1, 6, 'rgba(0,0,0,.18)'); // 一道发缝，别让背面糊成一块
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
    R(3, BD-1, 1, 4, '#2b2f36'); R(12, BD-1, 1, 4, '#2b2f36');   // 背带
    R(5, BD+2, 6, 3, '#15181d'); R(5, BD+2, 6, 1, '#343b45');
    R(6, BD+3, 2, 1, '#9fc6e0');                                  // 镜头
    R(8, BD+2, 1, 1, '#3a424d');                                  // 快门/顶盖
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
    // 一圈真的径向光晕。原来是一个 .34 不透明的 14×19 实心方块，
    // ???? 那一场的「灰」站在雪里像贴了一张发光的卡片
    const gg = g.createRadialGradient(X+8, Y+8, 1, X+8, Y+8, 14);
    gg.addColorStop(0, rgba(opt.glow, .30));
    gg.addColorStop(.5, rgba(opt.glow, .12));
    gg.addColorStop(1, rgba(opt.glow, 0));
    g.fillStyle = gg;
    g.fillRect(X-6, Y-6, 28, 32);
  }
}

/* ───────── 天气粒子 ─────────
   雪分远近两层：近的更大、更快、更亮，远的小而淡。
   只有一层雪的时候，画面没有纵深，雪就会读成「屏幕上的噪点」。 */
let parts = [];
function initWeather(kind){
  parts = [];
  if (kind === 'none') return;
  const n = kind === 'snow' ? 118 : kind === 'rain' ? 90 : kind === 'heat' ? 44 : 50;
  for (let i=0;i<n;i++) parts.push(newPart(kind, true));
}
function newPart(kind, anywhere){
  const base = { kind, x: rnd(0, CW), y: anywhere ? rnd(0, CH) : -6, z: Math.random() };
  const near = base.z > 0.72;
  if (kind === 'snow'){
    base.vy = near ? rnd(26, 46) : rnd(8, 18);
    base.vx = near ? rnd(-16, 4) : rnd(-6, 3);
    base.s  = base.z > 0.94 ? 2 : 1;     // 只有极近的几片是 2px，其余 1px
    base.c  = near ? '#ffffff' : '#cfe3f5';
    base.a  = near ? rnd(.38, .66) : rnd(.12, .28);
  }
  if (kind === 'rain'){ base.vy = rnd(120,190); base.vx = rnd(-18,-8); base.s = 1; base.c='#9fc4e8'; base.a = rnd(.20,.55); }
  if (kind === 'heat'){ base.vy = rnd(-14,-6); base.vx = rnd(-4,4); base.s = 1; base.c='#ffd9a0'; base.a = rnd(.18,.5); base.y = rnd(0,CH); }
  if (kind === 'dust'){ base.vy = rnd(-4,4); base.vx = rnd(-6,6); base.s = 1; base.c='#ffb0e0'; base.a = rnd(.18,.5); }
  if (base.a === undefined) base.a = rnd(.25,.7);
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
      np.x = rnd(0,CW);
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
    else if (q.s > 1){ g.fillRect(q.x|0, q.y|0, 2, 2); }
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
  drawGround(g, p);

  // 实体按 y 排序
  const ents = [];
  for (const n of NPCS) ents.push({ y:n.y, kind:'npc', ref:n });
  for (const o of OBJS) ents.push({ y:o.y, kind:'obj', ref:o });
  ents.push({ y:P.y, kind:'player', ref:P });
  ents.sort((a,b)=>a.y-b.y);

  for (const e of ents){
    const sx = e.ref.x - cam.x, sy = e.ref.y - cam.y;
    if (sx < -40 || sy < -40 || sx > CW+40 || sy > CH+40) continue;
    e.ref._sx = sx; e.ref._sy = sy;
    if (e.kind === 'player'){
      drawChar(g, sx, sy, PLAYER_PAL, P.dir, P.fr, PLAYER_OPT);
    } else if (e.kind === 'npc'){
      const n = e.ref;
      drawChar(g, sx, sy, n.pal || NPC_PAL, n.dir ?? 0, n.fr ?? 0, n.opt);
    } else {
      drawObj(g, sx, sy, e.ref);
    }
  }

  drawLights(g, p);
  drawWeather(g);

  /* 空气透视：越靠上（越远）越沉、越靠下（越近）越亮。
     没有这条渐变，一整片地面就会读成一堵墙。 */
  const depth = g.createLinearGradient(0, 0, 0, CH);
  depth.addColorStop(0, rgba(p.fog, .40));
  depth.addColorStop(.42, rgba(p.fog, .16));
  depth.addColorStop(.78, 'rgba(0,0,0,0)');
  depth.addColorStop(1, 'rgba(255,255,255,.03)');
  g.fillStyle = depth; g.fillRect(0,0,CW,CH);

  // 光照 / 色调
  g.fillStyle = p.tint; g.globalAlpha = p.tintA;
  g.fillRect(0,0,CW,CH); g.globalAlpha = 1;

  // 暗角
  const grd = g.createRadialGradient(CW/2, CH/2, CH*0.55, CW/2, CH/2, CH*1.06);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, p.fog);
  g.globalAlpha = p.fogA * (titleMode ? 0.75 : 0.95);
  g.fillStyle = grd; g.fillRect(0,0,CW,CH);
  g.globalAlpha = 1;

  // 标题镜头的暖光池（标题文字背后的焦点光源）
  if (titleMode){
    // 抬一点曝光：标题不能压在一整块死黑上
    g.fillStyle = '#182640'; g.globalAlpha = .26;
    g.fillRect(0,0,CW,CH); g.globalAlpha = 1;
    const gx = CW*0.5, gy = CH*0.40;
    const tg = g.createRadialGradient(gx, gy, 2, gx, gy, 104);
    tg.addColorStop(0, 'rgba(255,228,176,.26)');
    tg.addColorStop(.45, 'rgba(255,196,128,.10)');
    tg.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = tg; g.fillRect(0,0,CW,CH);
  }

  updateFocus();

  // 背景层是全屏 CSS 模糊，没必要 60fps 重画：~12fps 就够，省移动端 GPU
  const nowMs = performance.now();
  if (nowMs - lastBgPaint > 80){ lastBgPaint = nowMs; paintBackdrop(); }
}

/* ───────── 光 ─────────
   光源不是「加一层亮」，而是要有落点：灯在雪地上打一个压扁的光池，
   灯罩往下漏一道锥形，站房门口再泼一片暖色。 */
function groundPool(g, x, y, rx, ry, color, a){
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const lg = g.createRadialGradient(0, 0, 1, 0, 0, rx);
  lg.addColorStop(0, rgba(color, a));
  lg.addColorStop(.28, rgba(color, a * .62));
  lg.addColorStop(.58, rgba(color, a * .24));
  lg.addColorStop(.82, rgba(color, a * .05));
  lg.addColorStop(1, rgba(color, 0));
  g.fillStyle = lg;
  g.fillRect(-rx, -rx, rx*2, rx*2);
  g.restore();
}

/* 地面上的雪：全部用平滑渐变画。
   一块地如果只有均匀底色，在 4 倍缩放下会读成雾；只有按格铺色又会有硬边。
   软的雪垄 + 楼脚的暗压 + 人行道边缘的过渡，这三样都没有边。 */
function drawGround(g, p){
  const warm = p.entr || '#ffcf8a';

  // 楼脚往地上压一道（比烘焙的 16px 一遍更连续）
  const top = 112 - cam.y;
  if (top < CH + 60){
    const ag = g.createLinearGradient(0, top, 0, top + 34);
    ag.addColorStop(0, 'rgba(4,9,16,.30)');
    ag.addColorStop(.55, 'rgba(4,9,16,.10)');
    ag.addColorStop(1, 'rgba(4,9,16,0)');
    g.fillStyle = ag; g.fillRect(0, top, CW, 34);
  }
  // 人行道的下沿化开：不然它跟广场之间是一条硬直线
  const apr = 128 - cam.y;
  if (apr > -20 && apr < CH + 20){
    const bg = g.createLinearGradient(0, apr, 0, apr + 16);
    bg.addColorStop(0, 'rgba(120,140,160,.10)');
    bg.addColorStop(1, 'rgba(120,140,160,0)');
    g.fillStyle = bg; g.fillRect(0, apr, CW, 16);
  }
  // 几道积起来的雪垄：椭圆软斑，边缘完全化开
  const drifts = [
    [40, 172, 74, 16, .11], [150, 205, 60, 13, .09], [246, 166, 52, 12, .10],
    [96, 128, 46, 11, .08],  [206, 190, 40, 10, .07],
    [12, 214, 40, 12, .08],  [268, 214, 44, 12, .09],
  ];
  for (const [dx, dy, rx, ry, a] of drifts){
    const x = dx - cam.x, y = dy - cam.y;
    if (x < -rx - 10 || x > CW + rx + 10 || y < -ry - 10 || y > CH + ry + 10) continue;
    groundPool(g, x, y, rx, ry, '#e8f2ff', a);
  }
}

function drawLights(g, p){
  const warm = p.entr || '#ffcf8a';
  const lamp = p.lamp;

  // 路灯：雪地光池 + 向下的光锥
  for (const L of LAMPS){
    const lx = L.x - cam.x + 8, ly = L.y - cam.y + 1;
    if (lx < -70 || ly < -80 || lx > CW+70 || ly > CH+70) continue;
    groundPool(g, lx, ly + 15, 34, 13, lamp, .40);
    // 光锥：320×180 下画不出真正的体积光，硬边的梯形会变成一块白色方块，
    // 所以只留一条很淡的、向地面衰减的光
    const cg = g.createLinearGradient(lx, ly, lx, ly + 17);
    cg.addColorStop(0, rgba(lamp, .13));
    cg.addColorStop(.55, rgba(lamp, .05));
    cg.addColorStop(1, rgba(lamp, 0));
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(lx - 3, ly + 1); g.lineTo(lx + 3, ly + 1);
    g.lineTo(lx + 13, ly + 17); g.lineTo(lx - 13, ly + 17);
    g.closePath(); g.fill();
    // 灯罩本身的一点溢光：外圈几乎看不见，只负责「灯在发光」这件事。
    // 半径给到 19 会变成一团雾——16px 的灯头上挂一个 40px 的圆盘，
    // 4 倍下就是一片贴在地面上的白雾，而不是灯。
    groundPool(g, lx, ly + 1, 13, 13, lamp, .13);
    groundPool(g, lx, ly + 1, 8, 8, lamp, .50);
  }

  // 站房入口：画面里唯一的暖光主光源
  const ex = 320 - cam.x, ey = 140 - cam.y;
  if (ex > -90 && ex < CW + 90){
    groundPool(g, ex, ey + 60, 230, 104, warm, .13);   // 大范围的光衰减
    groundPool(g, ex, ey + 26, 96, 40, warm, .17);
    groundPool(g, ex, ey + 16, 62, 21, warm, .34);
    groundPool(g, ex, ey + 6, 26, 17, warm, .28);
    const dg = g.createLinearGradient(0, ey - 20, 0, ey + 8);
    dg.addColorStop(0, rgba(warm, .22));
    dg.addColorStop(1, rgba(warm, 0));
    g.fillStyle = dg;
    g.beginPath();
    g.moveTo(ex - 26, ey - 20); g.lineTo(ex + 26, ey - 20);
    g.lineTo(ex + 44, ey + 10); g.lineTo(ex - 44, ey + 10);
    g.closePath(); g.fill();
  }

  // 灯箱 / 售票机这类自发光的小东西，在雪地上留一小片冷光
  if (POSTER_LIGHTS) for (const q of POSTER_LIGHTS){
    const lx = q.x - cam.x, ly = q.y - cam.y;
    if (lx < -40 || lx > CW+40) continue;
    groundPool(g, lx, ly + 14, 24, 9, q.c, .16);
  }
}

/* ───────── 头顶聚焦名牌（HTML 层）─────────
   世界画面里不放字（6px 的中文在 320×180 上会糊成一团），
   所以「离谁最近、能按什么」交给一层 DOM 标签，位置由世界坐标换算。 */
let focusNow = null, focusEl = null;
function updateFocus(){
  if (!focusEl) focusEl = document.getElementById('focus');
  if (!focusEl) return;
  const near = (started && !titleMode && !paused && typeof nearEntity === 'function') ? nearEntity() : null;
  if (!near){
    if (focusNow){ focusEl.classList.remove('on'); focusNow = null; }
    return;
  }
  const ref = near.ref;
  const sx = ref._sx, sy = ref._sy;
  if (sx === undefined || sy === undefined){ return; }
  const scr = document.getElementById('screen');
  const k = scr ? scr.clientWidth / CW : 1;
  const label = (typeof nearLabel === 'function') ? nearLabel(near) : '';
  if (!label){ return; }
  if (focusNow !== label + '|' + Math.round(sx) + '|' + Math.round(sy)){
    focusNow = label + '|' + Math.round(sx) + '|' + Math.round(sy);
    const t = focusEl.querySelector('b');
    if (t) t.textContent = label;
    focusEl.style.left = ((sx + 8) * k) + 'px';
    focusEl.style.top = ((sy - 2) * k) + 'px';
  }
  focusEl.classList.add('on');
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
  const t = performance.now();
  if (o.type === 'tape'){
    /* 雪里的一盘磁带：黑壳、两条白轴、压出来的一小片雪坑。
       原来那圈大白光晕太像「渲染坏了」，现在只留一点会呼吸的反光。 */
    g.fillStyle = 'rgba(226,238,251,.30)';
    g.fillRect(x+2, y+13, 12, 2);
    g.fillStyle = 'rgba(226,238,251,.16)';
    g.fillRect(x+1, y+15, 14, 1);
    g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(x+3, y+15, 10, 1);
    g.fillStyle = '#171a20'; g.fillRect(x+2, y+8, 12, 6);
    g.fillStyle = '#2d323b'; g.fillRect(x+2, y+8, 12, 1);
    g.fillStyle = '#0d1014'; g.fillRect(x+2, y+14, 12, 1);
    g.fillStyle = '#d9d2c0'; g.fillRect(x+4, y+10, 8, 3);
    g.fillStyle = '#c04a5a'; g.fillRect(x+4, y+10, 8, 1);
    g.fillStyle = '#f7f4ea'; g.fillRect(x+5, y+11, 2, 2); g.fillRect(x+9, y+11, 2, 2);
    g.fillStyle = '#0b0e12'; g.fillRect(x+5, y+11, 1, 1); g.fillRect(x+10, y+11, 1, 1);
    g.globalAlpha = .10 + Math.sin(t/340) * .07; g.fillStyle = '#ffeec6';
    g.fillRect(x+1, y+7, 14, 8);
    g.globalAlpha = 1;
    g.fillStyle = '#fff6d8';
    g.globalAlpha = .55 + Math.sin(t/300) * .35;
    g.fillRect(x+13, y+8, 1, 1);
    g.globalAlpha = 1;
  }
  else if (o.type === 'note'){
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x+4, y+14, 9, 2);
    g.fillStyle = '#e8eef8'; g.fillRect(x+4, y+6, 8, 9);
    g.fillStyle = '#c2ccd9'; g.fillRect(x+4, y+6, 8, 1);
    g.fillStyle = '#9aa8bc';
    for (let i=0;i<4;i++) g.fillRect(x+5, y+8+i*2, 6, 1);
  }
  else if (o.type === 'station'){
    /* 站台尽头停着的保姆车。原来这里什么都没画，玩家其实找不到这个交互点。 */
    const vx = x - 20, vy = y - 10, w = 52, h = 25;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(vx+2, vy+h-1, w-4, 4);
    g.fillStyle = '#1a2029'; g.fillRect(vx, vy+7, w, h-9);         // 车身
    g.fillStyle = '#242c37'; g.fillRect(vx, vy+7, w, 2);
    g.fillStyle = '#12171e'; g.fillRect(vx+3, vy+10, w-6, 8);       // 侧窗
    g.fillStyle = 'rgba(255,214,150,.55)'; g.fillRect(vx+5, vy+11, 12, 6);
    g.fillStyle = 'rgba(255,214,150,.20)'; g.fillRect(vx+18, vy+11, w-24, 6);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(vx+3, vy+8, w-6, 1);
    for (const wx of [vx+11, vx+w-13]){
      g.fillStyle = '#0a0d11'; g.fillRect(wx, vy+h-6, 8, 6);
      g.fillStyle = '#2b333c'; g.fillRect(wx+2, vy+h-5, 3, 3);
    }
    g.fillStyle = '#e8eef8'; g.fillRect(vx+2, vy+5, w-4, 2);        // 车顶的雪
    g.fillStyle = '#b6c8da'; g.fillRect(vx+6, vy+6, w-14, 1);
    g.fillStyle = 'rgba(255,120,120,.45)'; g.fillRect(vx+w-4, vy+h-9, 2, 2);
    g.globalAlpha = .18; g.fillStyle = '#ffd696'; g.fillRect(vx-4, vy+9, w+8, 12); g.globalAlpha = 1;
  }
  else if (o.type === 'door'){
    const glow = .18 + Math.sin(t/900) * .06;
    g.globalAlpha = glow; g.fillStyle = '#efe6cc';
    g.fillRect(x-14, y-32, 44, 44);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(239,230,204,.20)';
    g.fillRect(x+1, y-18, 14, 30);
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

/* 头顶名牌上写什么：NPC 写名字，物件写它是什么 */
function nearLabel(near){
  if (!near) return '';
  const touch = document.body && document.body.classList && document.body.classList.contains('touch');
  const key = touch ? '点' : 'Z';
  if (near.kind === 'npc') return (near.ref.name || '？') + ' · ' + key;
  const o = near.ref;
  return (o.label || (o.type === 'tape' ? '磁带' : '东西')) + ' · ' + key;
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
