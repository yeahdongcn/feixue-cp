/* 玩法测试：用真实输入函数模拟画圈，验证封口/判定/绳长耗尽 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const levelsJson = html.match(/<script id="levels"[^>]*>([\s\S]*?)<\/script>/)[1];
const gameSrc = html.match(/<script>\n'use strict';([\s\S]*?)<\/script>/)[1];
const LEVELS = JSON.parse(levelsJson);

/* ── DOM 桩 ── */
function makeCtx2d(){
  const grad = { addColorStop(){} };
  const base = {
    createRadialGradient:()=>grad, createLinearGradient:()=>grad,
    createPattern:()=>({}), createImageData:(w,h)=>({ data:new Uint8ClampedArray(w*h*4) }),
    putImageData(){}, getImageData:(x,y,w,h)=>({ data:new Uint8ClampedArray(w*h*4) }),
    measureText:()=>({ width:40 }), setTransform(){}, save(){}, restore(){},
  };
  return new Proxy(base, {
    get:(t,k)=> k in t ? t[k] : (()=>{}),
    set:(t,k,v)=>{ t[k]=v; return true; },
  });
}
function El(id){
  const e = {
    id, textContent:'', innerHTML:'', style:{ setProperty(){}, getPropertyValue(){return ''} },
    _cls:new Set(), _ev:{},
    classList:{ add:(...c)=>c.forEach(x=>e._cls.add(x)), remove:(...c)=>c.forEach(x=>e._cls.delete(x)),
      contains:c=>e._cls.has(c), toggle:(c,v)=>{const on=v===undefined?!e._cls.has(c):v; on?e._cls.add(c):e._cls.delete(c);} },
    addEventListener:(t,f)=>{ (e._ev[t]=e._ev[t]||[]).push(f); },
    dispatch:(t,ev)=>{ (e._ev[t]||[]).forEach(f=>f(ev||{})); },
    getContext:()=>makeCtx2d(), setPointerCapture(){}, appendChild(){}, click(){ e.dispatch('click'); },
    width:0, height:0,
  };
  return e;
}
const els = {};
const document = {
  getElementById(id){ return els[id] || (els[id] = El(id)); },
  createElement(t){ return El('created-'+t); },
  addEventListener(){}, body:El('body'), documentElement:El('html'),
};
els.levels = El('levels'); els.levels.textContent = levelsJson;

const rafQueue = [];
const sandbox = {
  document, console, Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp,
  Float32Array, Uint8ClampedArray, Uint8Array, isNaN, parseFloat, parseInt, Infinity, NaN,
  requestAnimationFrame:(f)=>{ rafQueue.push(f); return 1; },
  setTimeout:(f,ms)=>{ sandbox.__timers.push({f,ms}); return sandbox.__timers.length; },
  clearTimeout(){}, navigator:{ clipboard:{ writeText:async()=>{} } },
  innerWidth:1200, innerHeight:800, devicePixelRatio:1,
};
sandbox.__timers = [];
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
sandbox.addEventListener = ()=>{};
const ctx = vm.createContext(sandbox);

vm.runInContext(gameSrc, ctx, { filename:'game.js' });

const G = vm.runInContext('G', ctx);
const run = (code) => vm.runInContext(code, ctx);

let bad = 0;
const chk = (c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) bad++; };

/* ── 几何：凸包 + 带圆角的等距外扩 ── */
function hull(pts){
  const p = pts.slice().sort((a,b)=> a.x-b.x || a.y-b.y);
  if (p.length < 3) return p;
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[]; for(const q of p){ while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0) lo.pop(); lo.push(q); }
  const up=[]; for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(up.length>=2&&cross(up[up.length-2],up[up.length-1],q)<=0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
/* 把对象当成半径 r 的圆，求并集的凸包边界（圆角等距外扩） */
function loopAround(objs, r){
  const H = hull(objs);
  if (H.length < 3){
    const c = objs.reduce((a,o)=>({x:a.x+o.x/objs.length, y:a.y+o.y/objs.length}), {x:0,y:0});
    const R = r + Math.max(...objs.map(o=>Math.hypot(o.x-c.x,o.y-c.y)));
    const out=[]; for(let i=0;i<72;i++){ const a=i/72*Math.PI*2; out.push({x:c.x+Math.cos(a)*R, y:c.y+Math.sin(a)*R}); }
    return out;
  }
  const cen = H.reduce((a,o)=>({x:a.x+o.x/H.length, y:a.y+o.y/H.length}), {x:0,y:0});
  const nrm = (a,b)=>{
    let nx = b.y-a.y, ny = -(b.x-a.x);
    const L = Math.hypot(nx,ny); nx/=L; ny/=L;
    const mx = (a.x+b.x)/2 - cen.x, my = (a.y+b.y)/2 - cen.y;
    if (nx*mx + ny*my < 0){ nx=-nx; ny=-ny; }
    return {x:nx, y:ny};
  };
  const out=[];
  for (let i=0;i<H.length;i++){
    const prev = H[(i-1+H.length)%H.length], v = H[i], next = H[(i+1)%H.length];
    const n1 = nrm(prev, v), n2 = nrm(v, next);
    let a1 = Math.atan2(n1.y, n1.x), a2 = Math.atan2(n2.y, n2.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI*2;
    while (d < -Math.PI) d += Math.PI*2;
    const steps = 8;
    for (let k=0;k<=steps;k++){
      const a = a1 + d*k/steps;
      out.push({ x:v.x+Math.cos(a)*r, y:v.y+Math.sin(a)*r });
    }
  }
  return out;
}
function loopLen(p){ let L=0; for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length]; L+=Math.hypot(a.x-b.x,a.y-b.y);} return L; }

/* ── 模拟一次画圈 ── */
function stroke(worldPts){
  const view = run('view');
  const toScr = p => ({ x: p.x*view.s + view.ox, y: p.y*view.s + view.oy });
  const s0 = toScr(worldPts[0]);
  run('G.toastT = 0');
  vm.runInContext(`startStroke(${s0.x}, ${s0.y})`, ctx);
  for (let i=1;i<=worldPts.length;i++){
    const p = toScr(worldPts[i % worldPts.length]);
    vm.runInContext(`moveStroke(${p.x}, ${p.y})`, ctx);
    if (G.state === 'sealed') break;
  }
  vm.runInContext('endStroke()', ctx);
}

function reset(){
  run('G.state = "play"; G.kept = []; G.left = []; G.path = []; G.drawing = false; G.toastT = 0');
}

console.log('— 每关都能用最省的圈通过 —');
LEVELS.forEach((L, i) => {
  reset();
  run(`loadLevel(${i})`);
  run('G.state = "play"');

  // 找 need 个物件里周长最小的组合
  let best = Infinity, bestSet = null;
  const combos = [];
  (function pick(start, cur){
    if (cur.length === L.need){ combos.push(cur.slice()); return; }
    for (let k=start;k<L.objs.length;k++){ cur.push(L.objs[k]); pick(k+1, cur); cur.pop(); }
  })(0, []);
  for (const c of combos){
    const P = loopLen(loopAround(c, 30));
    if (P < best){ best = P; bestSet = c; }
  }

  const loop = loopAround(bestSet, 30);
  stroke(loop);
  const ok = G.state === 'sealed' && G.inside.length >= L.need;
  console.log(`  [${L.year}] 需要 ${best.toFixed(0)} / 绳 ${L.rope} → 圈住 ${G.inside.length} 样, 状态 ${G.state}` +
    `  len=${Math.round(G.len)} rope=${Math.round(G.rope)} pts=${G.path.length} toast="${els.toast.textContent}"`);
  if (!ok){ console.log('  ✗ 这一关画得出来却过不了'); bad++; }
});

console.log('\n— 少圈一样必须失败 —');
{
  reset();
  run('loadLevel(0)'); run('G.state = "play"');
  const L = LEVELS[0];
  stroke(loopAround([L.objs[0], L.objs[1]], 30));   // 只有 2 样，要 3 样
  chk(G.state === 'play' && G.inside.length < L.need, `圈住 ${G.inside.length ?? 0} 样 → 拒绝（state=${G.state}）`);
}

console.log('\n— 绳子会耗尽 —');
{
  reset();
  run('loadLevel(0)'); run('G.state = "play"');
  const view = run('view');
  const toScr = p => ({ x:p.x*view.s+view.ox, y:p.y*view.s+view.oy });
  run('G.toastT = 0');
  const s0 = toScr({x:100,y:100});
  vm.runInContext(`startStroke(${s0.x}, ${s0.y})`, ctx);
  // 一条 3000 单位长的蛇形线
  for (let i=0;i<300;i++){
    const p = toScr({ x:100 + (i%2? 820:0), y:120 + i*2 });
    vm.runInContext(`moveStroke(${p.x}, ${p.y})`, ctx);
    if (G.rope === 0) break;
  }
  chk(G.rope === 0, `绳长耗尽（剩余 ${Math.round(G.rope)}）`);
}

console.log('\n— 六关串起来 —');
{
  reset();
  run('G.kept = []; G.left = []');
  LEVELS.forEach((L,i)=>{
    reset(); run('G.kept = window.__kept || []; G.left = window.__left || []');
  });
  // 直接调用 seal 验证记录累加
  reset();
  run('G.kept = []; G.left = []');
  run('loadLevel(0)'); run('G.state = "play"');
  const L0 = LEVELS[0];
  stroke(loopAround([L0.objs[0],L0.objs[1],L0.objs[2]], 30));
  const kept = G.kept.length, left = G.left.length;
  console.log(`  第一站：圈住 ${kept}，放手 ${left}`);
  chk(kept === 3 && left === 2, '记录正确累加');
}

console.log('\n— 整局跑通（真实主循环 + 真实章节卡）—');
{
  reset();
  run('G.kept = []; G.left = []; G.idx = 0');
  run('loadLevel(0)'); run('showCard(0)');
  let t = 0;
  const tickTo = (ms) => { const end = t + ms; while (t < end){ t += 16; vm.runInContext(`loop(${t})`, ctx); } };
  const flush = () => { const q = sandbox.__timers.splice(0); q.forEach(x => x.f()); };

  let chapters = 0;
  for (let i = 0; i < LEVELS.length; i++){
    if (G.state !== 'card') break;
    els.card.dispatch('click');
    if (G.state !== 'play') break;
    const L = LEVELS[i];
    // 找最小周长的 need 组合
    let best = Infinity, bs = null;
    const combos = [];
    (function pick(st, cur){
      if (cur.length === L.need){ combos.push(cur.slice()); return; }
      for (let k = st; k < L.objs.length; k++){ cur.push(L.objs[k]); pick(k+1, cur); cur.pop(); }
    })(0, []);
    for (const c of combos){ const P = loopLen(loopAround(c, 30)); if (P < best){ best = P; bs = c; } }
    stroke(loopAround(bs, 30));
    if (G.state !== 'sealed'){ console.log(`  第 ${i+1} 站没封上：${els.toast.textContent}`); break; }
    chapters++;
    tickTo(2200);      // 等封口动画 → 章节卡
    flush();           // 触发 nextChapter
  }
  console.log(`  通关章节数 ${chapters}/${LEVELS.length}，状态 ${G.state}`);
  chk(chapters === LEVELS.length, '六站全部走完');

  tickTo(1000); flush();
  console.log(`  结局页 on=${els.end._cls.has('on')}  圈住 ${G.kept.length} 放手 ${G.left.length}`);
  chk(els.end._cls.has('on') && G.state === 'end', '结局页出现');
  chk(G.kept.length === 14 && G.left.length === 12, `圈住/放手 记账正确（${G.kept.length}/${G.left.length}）`);
  chk(els.eBig.innerHTML.includes('14'), '结局文案带数字');
  chk(els.eStat.textContent.includes('称号'), '称号已生成');
  chk(els.eKept.textContent === '14' && els.eLeft.textContent === '12', '结算卡分数正确（14 / 12）');
  chk((els.eYears.innerHTML.match(/class="cell/g) || []).length === 6, '结算卡有六格年份');
  chk(LEVELS.every(L => els.eYears.innerHTML.includes(L.year)), '六站年份都在结算卡上');
  chk(els.eBig.innerHTML.includes('最后一圈只够圈住自己') && els.eBig.innerHTML.includes('你会先放下哪一样'),
      '可以直接复制的一句话在卡上');
  chk(els.end._cls.has('on') && document.body._cls.has('end-open'), '结算时 HUD 让位');

  // 再走一遍
  els.btnAgain.dispatch('click');
  tickTo(100); flush();
  chk(G.state === 'card' && G.kept.length === 0, '「再走一遍」重置');
}

console.log(bad===0 ? '\n=== PLAY PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
