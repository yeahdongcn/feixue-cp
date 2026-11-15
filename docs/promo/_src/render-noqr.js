#!/usr/bin/env node
/* 无码版分享卡：去掉二维码、去掉明文 URL、去掉「扫码」字样。
   小红书这类平台对图内二维码和外链都限流，这套是专门给它们的。
   node render-noqr.js    → ../share-cards/no-qr/*.png */
const path = require('path');
const fs = require('fs');
const PW = '/home/xiaodongye/dsh-3090/repo/node_modules/playwright';
const { chromium } = require(PW);

const SRC = __dirname;
const OUT = path.join(SRC, '..', 'share-cards', 'no-qr');
const CARDS = [
  { id: 'entry',  file: 'card-1-entry.html',  w: 1080, h: 1440, out: '01-entry' },
  { id: 'ending', file: 'card-2-ending.html', w: 1080, h: 1440, out: '02-ending' },
  { id: 'quote',  file: 'card-3-quote.html',  w: 1080, h: 1350, out: '03-quote' },
  { id: 'ledger', file: 'card-4-ledger.html', w: 1080, h: 1350, out: '04-ledger' },
];

/* 把会触发限流的东西全部摘掉：
   - .qr（二维码 + 「扫码」）
   - .url / .url-sm（明文外链）
   - footer 收成单列，避免右侧留一块空白 */
const STRIP = () => {
  const removed = [];
  document.querySelectorAll('.qr').forEach(e => { e.style.display = 'none'; removed.push('.qr'); });
  document.querySelectorAll('.url, .url-sm').forEach(e => {
    e.textContent = '不 下 车';
    e.classList.add('wordmark');
    removed.push('.url');
  });
  document.querySelectorAll('footer').forEach(f => { f.style.gridTemplateColumns = '1fr'; });
  // 「扫码」字样兜底
  document.querySelectorAll('footer span, footer p').forEach(e => {
    if (/扫\s*码/.test(e.textContent)) e.remove();
  });
  return removed;
};

(async () => {
  const { chromium: cr } = require(PW);
  const browser = await cr.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(OUT, { recursive: true });

  for (const c of CARDS) {
    const file = path.join(SRC, c.file);
    if (!fs.existsSync(file)) { console.log('SKIP', c.file); continue; }
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const removed = await page.evaluate(STRIP);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    // 体检：确认画面里真的没有二维码和外链了
    const left = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return {
        hasQR: !!document.querySelector('.qr img:not([style*="none"])') &&
               [...document.querySelectorAll('.qr')].some(e => getComputedStyle(e).display !== 'none'),
        hasUrl: /https?:\/\/|github\.io|yeahdongcn|\b\.com\b/.test(t),
        hasScan: /扫\s*码/.test(t),
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });

    const png = path.join(OUT, c.out + '.png');
    await page.screenshot({ path: png });
    const bad = left.hasQR || left.hasUrl || left.hasScan || left.overflowX || errs.length;
    console.log(`${bad ? '✗' : '✓'} ${c.id.padEnd(7)} ${c.w}x${c.h} 去掉了 ${removed.length} 处` +
      (left.hasUrl ? ' [仍有外链]' : '') + (left.hasScan ? ' [仍有扫码]' : '') +
      (left.overflowX ? ' [横向溢出]' : '') + (errs.length ? ' [ERR]' : ''));
    await page.close();
  }
  await browser.close();
})();
