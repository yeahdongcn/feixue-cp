#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   共用截图夹具 —— 三个游戏都用它
   node tools/shoot.js <game> <scene> [--w 1280] [--h 800] [--out dir]

   同时产出两类证据：
     <scene>.png   截图（交给有视觉的评审）
     <scene>.json  版式探针：每个可见元素的 box / 字号 / 颜色 / 对比度 / 溢出
   ══════════════════════════════════════════════════════════════ */
const path = require('path');
const fs = require('fs');
const PW = '/home/xiaodongye/dsh-3090/repo/node_modules/playwright';
const { chromium } = require(PW);

const GAMES = {
  v1: 'file:///home/xiaodongye/games/buxiache-rpg/index.html',
  v2: 'file:///home/xiaodongye/games/buxiache-3d/dist/index.html',
  v3: 'file:///home/xiaodongye/games/buxiache-draw/index.html',
};

function args(){
  const a = process.argv.slice(2);
  const out = { game:a[0], scene:a[1]||'all', w:1280, h:800, dir:'/home/xiaodongye/shots/auto' };
  for (let i=2;i<a.length;i++){
    if (a[i]==='--w') out.w = +a[++i];
    if (a[i]==='--h') out.h = +a[++i];
    if (a[i]==='--out') out.dir = a[++i];
  }
  return out;
}

/* 注入页面的探针：把所有可见元素量一遍 */
const PROBE = () => {
  const cvs = [...document.querySelectorAll('canvas')];
  const els = [...document.querySelectorAll('body *')].filter(e=>{
    const s = getComputedStyle(e);
    if (s.display==='none' || s.visibility==='hidden' || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const lum = c => { const [r,g,b] = c.map(v=>{ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = s => { const m = (s||'').match(/[\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const ratio = (a,b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); };

  const items = els.map(e=>{
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const own = [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    return {
      tag: e.tagName.toLowerCase(),
      id: e.id || undefined,
      cls: (e.className && e.className.baseVal !== undefined) ? e.className.baseVal : (e.className||undefined),
      text: own ? own.slice(0,80) : undefined,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      font: s.fontSize + '/' + s.lineHeight + ' ' + s.fontFamily.split(',')[0].replace(/"/g,''),
      color: s.color,
      bg: s.backgroundColor,
      z: s.zIndex,
      overflow: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
    };
  });

  const vw = innerWidth, vh = innerHeight;
  const problems = [];
  for (const it of items){
    const [x,y,w,h] = it.box;
    if (it.text && (x < -2 || y < -2 || x+w > vw+2 || y+h > vh+2))
      problems.push({ kind:'出屏', id:it.id||it.cls||it.tag, text:it.text, box:it.box });
    if (it.overflow) problems.push({ kind:'文字溢出', id:it.id||it.cls||it.tag, text:it.text });
    if (it.text){
      const fg = parse(it.color), bgc = parse(it.bg);
      if (fg && bgc && bgc.length===3 && it.bg !== 'rgba(0, 0, 0, 0)'){
        const cr = ratio(fg, bgc);
        if (cr < 3) problems.push({ kind:'对比度低', id:it.id||it.cls||it.tag, text:it.text, ratio:+cr.toFixed(2), fg:it.color, bg:it.bg });
      }
      const fsz = parseFloat(it.font);
      if (fsz && fsz < 11) problems.push({ kind:'字号过小', id:it.id||it.cls||it.tag, text:it.text, font:it.font });
    }
  }
  return { viewport:[vw,vh], canvases: cvs.map(c=>({ box:[c.getBoundingClientRect().width, c.getBoundingClientRect().height] })),
           count: items.length, items, problems };
};

async function main(){
  const o = args();
  if (!GAMES[o.game]){ console.error('用法: node tools/shoot.js <v1|v2|v3> <scene> [--w] [--h] [--out]'); process.exit(2); }
  fs.mkdirSync(o.dir, { recursive:true });

  const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader','--hide-scrollbars'] });
  const page = await browser.newPage({ viewport:{ width:o.w, height:o.h }, deviceScaleFactor:1 });
  const logs = [];
  page.on('console', m => { if (m.type()==='error') logs.push('CONSOLE: '+m.text()); });
  page.on('pageerror', e => logs.push('PAGEERROR: '+e.message));

  const shot = async (name) => {
    const p = path.join(o.dir, name + '.png');
    await page.screenshot({ path:p });
    const probe = await page.evaluate(PROBE);
    probe.errors = logs.slice();
    fs.writeFileSync(path.join(o.dir, name + '.json'), JSON.stringify(probe, null, 1));
    console.log(`${name}.png  ${o.w}x${o.h}  元素${probe.count}  问题${probe.problems.length}  报错${logs.length}`);
    probe.problems.slice(0,8).forEach(x => console.log('   ·', x.kind, x.id, x.text ? `"${x.text.slice(0,26)}"` : '', x.ratio?`对比度${x.ratio}`:''));
    logs.forEach(l => console.log('   !', l.slice(0,160)));
    logs.length = 0;
  };

  const url = GAMES[o.game];
  await page.goto(url, { waitUntil:'load' });
  await page.waitForTimeout(900);

  const S = require(path.join(__dirname, 'scenes', o.game + '.js'));
  await S(page, shot, o);

  await browser.close();
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
