/* 关卡可解性分析：绳长 vs 圈住 N 样所需的最小周长（凸包） */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const m = html.match(/<script id="levels"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到关卡数据'); process.exit(1); }
const LEVELS = JSON.parse(m[1]);

function hull(pts){
  const p = pts.slice().sort((a,b)=> a.x-b.x || a.y-b.y);
  if (p.length < 3) return p;
  const cross = (o,a,b)=> (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[]; for(const q of p){ while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],q)<=0) lower.pop(); lower.push(q); }
  const upper=[]; for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],q)<=0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
const PAD = 2*Math.PI*30;   // 绕开物件本身所需的余量（等距曲线 P+2πr）
function perim(poly){
  let L=0;
  for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length]; L+=Math.hypot(a.x-b.x,a.y-b.y); }
  return L;
}
function* subsets(arr, k){
  const idx = [...Array(k).keys()];
  while (true){
    yield idx.map(i=>arr[i]);
    let i = k-1;
    while (i>=0 && idx[i] === arr.length-k+i) i--;
    if (i<0) return;
    idx[i]++;
    for (let j=i+1;j<k;j++) idx[j] = idx[j-1]+1;
  }
}

let bad = 0;
const chk = (c,msg)=>{ console.log((c?'  ✓ ':'  ✗ ')+msg); if(!c) bad++; };

LEVELS.forEach((L, i) => {
  console.log(`\n[${L.year}] ${L.title}  绳=${L.rope}  要圈=${L.need}  物件=${L.objs.length}`);

  // 圈住 k 样的最小周长（k = need 与 need+1）
  const minFor = k => {
    let best = Infinity, set = null;
    if (k > L.objs.length) return { best, set };
    for (const s of subsets(L.objs, k)){
      const p = perim(hull(s)) + PAD;
      if (p < best){ best = p; set = s; }
    }
    return { best, set };
  };
  const A = minFor(L.need);
  const B = minFor(L.need+1);
  const best = A.best, bestSet = A.set;
  const all = perim(hull(L.objs)) + PAD;
  console.log(`   最少需要 ${best.toFixed(0)} 圆周  (${bestSet.map(o=>o.name).join('、')})`);
  console.log(`   圈住全部需要 ${all.toFixed(0)} 圆周`);
  if (B.set) console.log(`   再想多圈 1 样，最少要 ${B.best.toFixed(0)} 圆周`);
  console.log(`   余量 ${(L.rope/best).toFixed(2)}×   全部/绳 ${(all/L.rope).toFixed(2)}×`);

  if (i < LEVELS.length-1){
    chk(L.rope >= best*1.12, `可解（余量 ${(L.rope/best).toFixed(2)}× ≥ 1.12）`);
    chk(L.rope < all*0.99, `不能全圈（全部需 ${all.toFixed(0)} > 绳 ${L.rope}）`);
    chk(L.rope <= B.best*0.97, `多圈一样就超（${L.rope} ≤ ${(B.best*0.97).toFixed(0)}）`);
    chk(L.rope >= best*1.15, `不至于白送`);
  }
});

// 末章：绳子只够圈住一个人
const last = LEVELS[LEVELS.length-1];
console.log(`\n[末章] 绳=${last.rope}，圈住一个点的圆半径上限 ≈ ${(last.rope/(2*Math.PI)).toFixed(1)}`);
chk(last.need === 1 && last.objs.length === 1, '末章只有「你自己」，只需圈住 1 样');
chk(last.rope/(2*Math.PI) >= 34, `末章能画出半径 ${(last.rope/(2*Math.PI)).toFixed(0)} 的圈（手指可操作）`);

// 绳长递减
const ropes = LEVELS.map(l=>l.rope);
console.log('\n绳长序列:', ropes.join(' → '));
let mono = true;
for (let i=1;i<ropes.length;i++) if (ropes[i] >= ropes[i-1]) mono = false;
chk(mono, '绳长逐站递减（越走越紧）');


/* ── 版式检查：不同屏幕上物件是否挤在一起、HUD 是否压住棋盘 ── */
console.log('\n— 版式 —');
{
  let ok = true;
  LEVELS.forEach(L => {
    L.objs.forEach(o => {
      if (o.x < 80 || o.x > 920 || o.y < 80 || o.y > 920){ console.log(`  ✗ ${o.name} 出界 (${o.x},${o.y})`); ok = false; }
      if ([...o.name].length > 4){ console.log(`  ✗ ${o.name} 名字超过 4 字`); ok = false; }
    });
    // 同关物件两两最近距离（世界单位）
    let md = Infinity, pair = '';
    for (let i=0;i<L.objs.length;i++) for (let j=i+1;j<L.objs.length;j++){
      const d = Math.hypot(L.objs[i].x-L.objs[j].x, L.objs[i].y-L.objs[j].y);
      if (d < md){ md = d; pair = L.objs[i].name+'/'+L.objs[j].name; }
    }
    console.log(`  ${L.year}  最近两件 ${md.toFixed(0)} 世界单位（${pair}）`);
  });
  chk(ok, '物件都在盘内、名字 ≤ 4 字');

  /* 和 index.html 的 layout() / fitView() 同一套算法：
     纸边 = 整屏内缩 14/20px；安全区让开 HUD 和底部提示条；
     物件包围盒等比放进安全区、居中。这里复算一遍，防止“改宽了圆圈又缩回四分之一”。 */
  const MIN_SPAN = 360, OBJ_R = 28;
  const frameOf = (w,h) => { const n = w <= 560, side = n ? 14 : 20;
    return { x:side, y:n?12:16, w:w-side*2, h:h-(n?24:32) }; };
  const safeOf = (w,h) => { const n = w <= 560, top = h < 520 ? 84 : 108, tb = n ? 110 : 84;
    const inf = Math.max(n?12:30, (n?14:20)+6);
    return { x:inf, y:top, w:w-inf*2, h:Math.max(120, h-top-(tb+46)), tb }; };
  function fitOf(L, w, h){
    let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
    L.objs.forEach(o => { x0=Math.min(x0,o.x); y0=Math.min(y0,o.y); x1=Math.max(x1,o.x); y1=Math.max(y1,o.y); });
    const sf = safeOf(w,h);
    const padX = Math.min(46, Math.max(24, sf.w*.08));
    const padY = Math.max(26, Math.min(38, sf.h*.07));
    const bw = Math.max(x1-x0, MIN_SPAN), bh = Math.max(y1-y0, MIN_SPAN);
    const s = Math.min((sf.w-padX*2)/bw, (sf.h-padY*2)/bh);
    const cx = (x0+x1)/2, cy = (y0+y1)/2;
    const sx = sf.x + sf.w/2 - cx*s, sy = sf.y + sf.h/2 - cy*s;
    let md = Infinity;
    for (let i=0;i<L.objs.length;i++) for (let j=i+1;j<L.objs.length;j++)
      md = Math.min(md, Math.hypot(L.objs[i].x-L.objs[j].x, L.objs[i].y-L.objs[j].y)*s);
    const maxR = sf.w < 360 ? 24 : OBJ_R;   // 和 index.html 同步：窄屏退回 24
    return { s, sf, md, ox:sx, oy:sy, objR: Math.max(15, Math.min(maxR, md*0.42)),
             box: { x0:x0*s+sx, y0:y0*s+sy, x1:x1*s+sx, y1:y1*s+sy } };
  }

  const viewports = [
    [390,844,'iPhone 竖',true], [320,568,'小屏竖',true], [768,1024,'iPad 竖',true],
    [1280,800,'桌面',true], [1920,1080,'大桌面',true], [844,390,'横屏',false],
  ];
  for (const [w,h,name,fills] of viewports){
    const fr = frameOf(w,h), safe = safeOf(w,h);
    const toastTop = h - (w <= 560 ? 112 : 84) - 24;   // toast 的上沿
    let minS = Infinity, maxS = 0, worstGap = Infinity, bad2 = [];
    LEVELS.forEach(L => {
      const f = fitOf(L,w,h);
      minS = Math.min(minS, f.s); maxS = Math.max(maxS, f.s);
      if (f.md < worstGap) worstGap = f.md;
      // ① 物件圈要在纸边以内（名字另判，见下）
      const m = f.objR + 4;
      if (f.box.x0-m < fr.x || f.box.x1+m > fr.x+fr.w ||
          f.box.y0-m < fr.y || f.box.y1+m > fr.y+fr.h) bad2.push(`${L.year} 出纸边`);
      // ② 物件不许伸进底部提示条
      if (f.box.y1 + m > toastTop) bad2.push(`${L.year} 压提示条`);
      // ②b 每个名字至少有一个方向放得下（和 index.html planLabels 的候选集一致）
      for (const o of L.objs){
        const X = o.x*f.s + f.ox, Y = o.y*f.s + f.oy;
        const w2 = [...o.name].length*13.4 + 4, h2 = 16, pad = f.objR + 17;
        const fits = [[0,1],[0,-1],[1,0],[-1,0]].some(([ux,uy]) => {
          let bx = X - w2/2;
          if (ux > 0) bx = X + pad; else if (ux < 0) bx = X - pad - w2;
          const by = Y + uy*pad + 3 - h2/2;
          return bx > fr.x+4 && bx+w2 < fr.x+fr.w-4 && by > fr.y+4 && by+h2 < fr.y+fr.h-4;
        });
        if (!fits) bad2.push(`${L.year} ${o.name} 名字无处可放`);
      }
      // ③ 两个物件圈不许叠在一起
      if (L.objs.length > 1 && f.md < 2*f.objR - 2) bad2.push(`${L.year} 圈叠一起`);
    });
    // ④ 至少一个方向把安全区填掉 7 成半（“别再只占四分之一”的回归线）
    //    末章只有一个点，包围盒是 0，不比它
    const cover = Math.min(...LEVELS.filter(L => L.objs.length > 1).map(L => {
      const f = fitOf(L,w,h);
      return Math.max((f.box.x1-f.box.x0)/safe.w, (f.box.y1-f.box.y0)/safe.h);
    }));
    console.log(`  ${name} ${w}×${h}: 缩放 ${minS.toFixed(2)}–${maxS.toFixed(2)}，物件最近 ${worstGap.toFixed(0)}px，圈半径 ${Math.max(15,Math.min(w<=360?24:28,worstGap*0.42)).toFixed(0)}px，覆盖 ${(cover*100).toFixed(0)}%`);
    chk(bad2.length === 0, `${name} 物件/名字不出纸、不压提示条、圈不叠${bad2.length?'（'+bad2.join('，')+'）':''}`);
    chk(worstGap >= 30, `${name} 物件最近 ≥30px`);
    if (fills) chk(cover >= 0.75, `${name} 画面撑满安全区 ≥75%`);
    else chk(minS >= 0.2, `${name} 缩放没有被压没`);
  }
}

console.log(bad===0 ? '\n=== LEVELS PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
