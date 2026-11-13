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

  const viewports = [[390,844,'iPhone 竖'],[768,1024,'iPad 竖'],[1440,900,'笔记本'],[1920,1080,'桌面']];
  for (const [w,h,name] of viewports){
    const s = Math.min(w*0.94, h*0.78) / 1000;
    const ox = (w - 1000*s)/2, oy = (h - 1000*s)*0.52;
    // HUD 区域（左侧 18px / 右侧 18px，顶部 60px）
    const hudBottom = 72;
    const overlap = oy < hudBottom;
    // 物件在屏幕上的最小间距
    let minPx = Infinity;
    LEVELS.forEach(L => {
      for (let i=0;i<L.objs.length;i++) for (let j=i+1;j<L.objs.length;j++){
        const d = Math.hypot(L.objs[i].x-L.objs[j].x, L.objs[i].y-L.objs[j].y) * s;
        if (d < minPx) minPx = d;
      }
    });
    const line = `  ${name} ${w}×${h}: 缩放 ${s.toFixed(2)}，物件最近 ${minPx.toFixed(0)}px，棋盘顶部 y=${oy.toFixed(0)}${overlap?' ⚠ 压 HUD':''}`;
    console.log(line);
    chk(minPx >= 40, `${name} 标签不打架（≥40px）`);
  }
}

console.log(bad===0 ? '\n=== LEVELS PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
