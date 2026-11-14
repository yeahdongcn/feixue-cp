#!/usr/bin/env node
/*
 * 截图夹具（v2）
 *   node tools/shoot.js v2 all --w 1280 --h 800 --out /home/xiaodongye/shots/rw-v2
 * 每张图旁边写一份同名 .json：视口、console 报错、画面内可见元素清单。
 */
const path = require('path');
const fs = require('fs');
const PW = '/home/xiaodongye/dsh-3090/repo/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const FILE = 'file://' + path.join(ROOT, 'dist/index.html');

const SCENES = [
  { id: '01_title',   shot: false, wait: 1400 },
  { id: '02_run_start', d: 4 },
  { id: '03_d60',     d: 60 },
  { id: '04_d250',    d: 250 },
  { id: '05_d450',    d: 450 },
  { id: '06_d650',    d: 650 },
  { id: '07_d850',    d: 850 },
  { id: '08_d1030',   d: 1030 },
  { id: '09_d1130',   d: 1130 },
  { id: '10_d480',    d: 480 },
];

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

(async () => {
  const w = +(arg('w', 1280));
  const h = +(arg('h', 800));
  const out = arg('out', '/home/xiaodongye/shots/rw-v2');
  const only = arg('scenes', '');
  const mobile = w < 500;
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const scenes = SCENES.filter(s => !only || only.split(',').includes(s.id.slice(0, 2)));

  for (const sc of scenes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [], warnings = [];
    page.on('console', m => {
      if (m.type() === 'error') errors.push(m.text());
      if (m.type() === 'warning') warnings.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    const url = FILE + (sc.shot === false ? '' : '?shot=1&d=' + (sc.d || 0));
    await page.goto(url);
    if (sc.shot === false) {
      await page.waitForTimeout(sc.wait || 1200);
    } else {
      await page.waitForFunction('window.__shotDone === true', null, { timeout: 12000 }).catch(() => {
        errors.push('shotDone timeout');
      });
      await page.waitForTimeout(260);
    }

    const audit = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const items = [];
      const problems = [];
      document.querySelectorAll('body *').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.02) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const text = (el.childElementCount === 0 ? el.textContent : '').trim().replace(/\s+/g, ' ');
        const tag = el.tagName.toLowerCase();
        if (r.right < -2 || r.left > vw + 2 || r.bottom < -2 || r.top > vh + 2) {
          problems.push({ kind: 'offscreen', sel: tag + (el.id ? '#' + el.id : '.' + (el.className || '')),
            box: [~~r.left, ~~r.top, ~~r.width, ~~r.height], text: text.slice(0, 40) });
        }
        if (text || el.id === 'hudMult') {
          items.push({ sel: tag + (el.id ? '#' + el.id : ''), box: [~~r.left, ~~r.top, ~~r.width, ~~r.height],
            text: text.slice(0, 60), color: cs.color, fs: cs.fontSize });
        }
      });
      return { viewport: [innerWidth, innerHeight], items, problems,
        canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]) };
    });

    const name = sc.id + (mobile ? '_m' : '');
    await page.screenshot({ path: path.join(out, name + '.png') });
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({
      scene: sc.id, viewport: [w, h], errors, warnings, ...audit,
    }, null, 1));
    console.log(`${name}: ${errors.length} err / ${audit.problems.length} layout problems`);
    if (errors.length) console.log('  ' + errors.slice(0, 4).join('\n  '));
    await page.close();
  }
  await browser.close();
})();
