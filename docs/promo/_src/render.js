#!/usr/bin/env node
/* 分享卡渲染 + 版式探针
   node render.js [card-1-entry ...]
   产出 share-cards/<name>.png ，并把每张卡的版式体检打到 stdout / _src/probe.json */
const path = require('path');
const fs = require('fs');
const PW = '/home/xiaodongye/dsh-3090/repo/node_modules/playwright';
const { chromium } = require(PW);

const SRC = __dirname;
const OUT = path.join(SRC, '..', 'share-cards');
const CARDS = [
  { id:'entry',  file:'card-1-entry.html',  w:1080, h:1440, out:'01-入口-四个游戏一图说清' },
  { id:'ending', file:'card-2-ending.html', w:1080, h:1440, out:'02-结局-你的版本她的版本' },
  { id:'quote',  file:'card-3-quote.html',  w:1080, h:1350, out:'03-金句-我画地为牢厉娜' },
  { id:'ledger', file:'card-4-ledger.html', w:1080, h:1350, out:'04-考据-十二条料七条经得起查' },
];

const PROBE = () => {
  const vw = innerWidth, vh = innerHeight;
  const out = { vw, vh, docH: document.documentElement.scrollHeight, items: [], problems: [] };
  const walk = [...document.querySelectorAll('body *')].filter(e => {
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0;
  });
  for (const e of walk) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    const isImg = e.tagName === 'IMG';
    if (!txt && !isImg) continue;
    const fs_ = parseFloat(getComputedStyle(e).fontSize);
    out.items.push({
      tag: e.tagName.toLowerCase(), cls: e.className || '',
      text: (isImg ? '[img]' : txt).slice(0, 40),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      fs: fs_, color: getComputedStyle(e).color,
      overflowX: e.scrollWidth > e.clientWidth + 1,
    });
    // 安全边距：任何文字/图片不得越过 64px 硬边，目标 88px
    if (r.x < 64 || r.y < 64 || r.x + r.width > vw - 64 || r.y + r.height > vh - 64) {
      out.problems.push(`BLEED ${e.tagName}.${e.className} "${txt.slice(0,20)}" @ ${r.x|0},${r.y|0} ${r.width|0}x${r.height|0}`);
    }
    if (txt && fs_ < 11) out.problems.push(`TINY ${fs_}px "${txt.slice(0,20)}"`);
  }
  if (out.docH > vh + 1) out.problems.push(`OVERFLOW doc ${out.docH} > ${vh}`);
  return out;
};

(async () => {
  const want = process.argv.slice(2);
  const list = want.length ? CARDS.filter(c => want.includes(c.id) || want.includes(c.file)) : CARDS;
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const all = {};
  for (const c of list) {
    const file = path.join(SRC, c.file);
    if (!fs.existsSync(file)) { console.log('SKIP (missing)', c.file); continue; }
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // 两帧，确保 SVG 噪声与渐变都已绘制
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const probe = await page.evaluate(PROBE);
    const png = path.join(OUT, c.out + '.png');
    await page.screenshot({ path: png });
    all[c.id] = { png, ...probe, errs };
    const bad = probe.problems.length + errs.length;
    console.log(`${bad ? '✗' : '✓'} ${c.id.padEnd(7)} ${c.w}x${c.h}  items=${probe.items.length}`);
    probe.problems.forEach(p => console.log('   ', p));
    errs.forEach(e => console.log('    ERR', e));
    await page.close();
  }
  fs.writeFileSync(path.join(SRC, 'probe.json'), JSON.stringify(all, null, 1));
  await browser.close();
})();
