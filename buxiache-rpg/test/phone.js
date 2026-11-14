/* 手机竖屏验收：真的点得到吗？
   node test/phone.js   —— 需要 playwright（和 tools/shoot.js 同一个）
   检查：虚拟手柄是否出现 / 每个按钮的命中区（≥44px、在屏内、elementFromPoint 能点中）/
        点屏幕能不能推进对话 / 方向键能不能真的走路 / 磁带盒能不能点开并跳年 /
        手柄会不会压住对话框 / 有没有横向滚动 / console 是否零报错。 */
const PW = '/home/xiaodongye/dsh-3090/repo/node_modules/playwright';
const { chromium } = require(PW);
const URL = 'file:///home/xiaodongye/games/buxiache-rpg/index.html';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ok  ' : '  FAIL') + '  ' + msg); };

(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil:'load' });
  await page.waitForTimeout(900);

  /* 1. 竖屏 + 触屏模式生效 */
  const env = await page.evaluate(() => ({
    touch: document.body.classList.contains('touch'),
    portrait: document.body.classList.contains('portrait'),
    touchDisp: getComputedStyle(document.querySelector('#touch')).display,
    hScroll: document.documentElement.scrollWidth - innerWidth,
    screen: document.querySelector('#screen').getBoundingClientRect().toJSON(),
  }));
  ok(env.touch, '触屏模式已识别 (body.touch)');
  ok(env.touchDisp === 'none', '标题阶段先藏起虚拟手柄 (display=' + env.touchDisp + ')');
  ok(env.portrait, '竖屏布局 class 生效');
  ok(env.hScroll <= 1, '没有横向滚动 (scrollWidth-innerWidth=' + env.hScroll + ')');
  ok(env.screen.height >= 180, '游戏画面高度 ' + Math.round(env.screen.height) + 'px（竖屏贴顶）');

  /* 2. 标题上唯一该被点到的就是开始键 */
  const startHit = await page.evaluate(() => {
    const e = document.querySelector('#startBtn'), b = e.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x+b.width/2, b.y+b.height/2);
    return { self: hit === e || (hit && e.contains(hit)), hit: hit ? (hit.id||hit.className) : null };
  });
  ok(startHit.self, '开始键点得中 (' + startHit.hit + ')');

  /* 3. 开局：手柄出现、不压对话框 */
  await page.click('#startBtn');
  await page.waitForTimeout(900);
  const dlgOn = await page.evaluate(() => document.querySelector('#dlg').classList.contains('on'));
  ok(dlgOn, '开场对话出现');
  const touchOn = await page.evaluate(() => getComputedStyle(document.querySelector('#touch')).display);
  ok(touchOn === 'block', '开局后虚拟手柄出现 (display=' + touchOn + ')');
  const overlap = await page.evaluate(() => {
    const R = s => document.querySelector(s).getBoundingClientRect();
    const hit = (a,b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    const dlg = R('#dlg'), pad = R('#touch .pad'), ab = R('#touch .abtn');
    return { dlgPad: hit(dlg,pad), dlgAb: hit(dlg,ab), padAb: hit(pad,ab) };
  });
  ok(!overlap.dlgPad && !overlap.dlgAb && !overlap.padAb,
     '手柄不压对话框、彼此不重叠 (' + JSON.stringify(overlap) + ')');

  /* 4. 点屏幕推进对话 */
  const before = await page.evaluate(() => document.querySelector('#dtext').textContent);
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector('#dtext').textContent);
  ok(before !== after, '点画面能推进对话（"' + before.slice(0,10) + '" → "' + after.slice(0,10) + '"）');

  /* 5. 把开场读完（对话框收起 = 回到可操作） */
  for (let i = 0; i < 14; i++) {
    const on = await page.evaluate(() => document.querySelector('#dlg').classList.contains('on'));
    if (!on) break;
    await page.touchscreen.tap(195, 420);
    await page.waitForTimeout(260);
  }
  const idle = await page.evaluate(() => ({ on: document.querySelector('#dlg').classList.contains('on'), paused }));
  ok(!idle.on && !idle.paused, '开场读完，回到可操作状态');

  /* 6. 每个按钮的命中区（标题已隐藏） */
  const targets = ['#touch .pad .u', '#touch .pad .p-l', '#touch .pad .p-r', '#touch .pad .d', '#btnT', '#btnB', '#btnA'];
  for (const sel of targets) {
    const r = await page.evaluate(s => {
      const e = document.querySelector(s);
      const b = e.getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2);
      return { box:[b.x,b.y,b.width,b.height], hit: hit ? (hit.id || hit.className || hit.tagName) : null,
               inside: b.x >= 0 && b.y >= 0 && b.x+b.width <= innerWidth+1 && b.y+b.height <= innerHeight+1,
               self: hit === e || (hit && e.contains(hit)) };
    }, sel);
    ok(r.box[2] >= 44 && r.box[3] >= 44, sel + ' 触控尺寸 ' + Math.round(r.box[2]) + '×' + Math.round(r.box[3]));
    ok(r.inside, sel + ' 在屏内 ' + r.box.map(Math.round).join(','));
    ok(r.self, sel + ' 点得中（elementFromPoint=' + r.hit + '）');
  }

  /* 7. 方向键真的能走 */
  const px0 = await page.evaluate(() => P.x);
  await page.dispatchEvent('#touch .pad .p-r', 'pointerdown');
  await page.waitForTimeout(450);
  await page.dispatchEvent('#touch .pad .p-r', 'pointerup');
  await page.waitForTimeout(120);
  const px1 = await page.evaluate(() => P.x);
  ok(px1 > px0 + 3, '按住 ▶ 角色向右移动 (' + Math.round(px0) + ' → ' + Math.round(px1) + ')');

  /* 6. 磁带盒：点开 → 点年份 → 真的跳年 */
  await page.evaluate(() => { unlockTape('2006','2006 · 夏'); unlockTape('2007','2007 · 冬'); });
  await page.tap('#btnT');
  await page.waitForTimeout(400);
  const tapeOpen = await page.evaluate(() => document.querySelector('#tapeUI').classList.contains('on'));
  ok(tapeOpen, '点「磁带」打开磁带盒');
  const cells = await page.evaluate(() => [...document.querySelectorAll('#tapeList .tape')].map(e => {
    const b = e.getBoundingClientRect(); return { box:[b.x,b.y,b.width,b.height], locked:e.classList.contains('locked'), label:e.textContent };
  }));
  ok(cells.length === 6, '磁带盒里 6 格（含未获得）');
  const cell = cells.find(c => !c.locked && c.label.indexOf('2007') >= 0);
  ok(!!cell, '2007 磁带可点');
  if (cell) {
    const t = await page.evaluate(() => document.querySelectorAll('#tapeList .tape')[1].getBoundingClientRect().toJSON());
    await page.touchscreen.tap(t.x + t.width/2, t.y + t.height/2);
    await page.waitForTimeout(1500);
    const era = await page.evaluate(() => S.era);
    ok(era === '2007', '点 2007 磁带后真的跳年（S.era=' + era + '）');
  }

  /* 7. 选项面板可点 */
  await page.evaluate(() => { runScript(() => npcGuard()); });
  await page.waitForTimeout(900);
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(700);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#choices .opt')].map(e => {
    const b = e.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2);
    return { h:b.height, hit: hit ? hit.className : null, y:b.y };
  }));
  ok(opts.length > 0, '选项出现 ' + opts.length + ' 个');
  ok(opts.every(o => o.h >= 44), '选项高度都 ≥44px (' + opts.map(o=>Math.round(o.h)).join('/') + ')');
  ok(opts.every(o => String(o.hit).indexOf('opt') >= 0), '选项点得中（不被手柄挡住）');
  if (opts.length) {
    await page.evaluate(() => document.querySelectorAll('#choices .opt')[0].click());
    await page.waitForTimeout(300);
  }

  /* 8. 结算 */
  ok(errors.length === 0, 'console 零报错' + (errors.length ? ' → ' + errors.join(' | ') : ''));
  await browser.close();

  console.log('\n' + (fails.length ? '=== PHONE FAIL (' + fails.length + ') ===\n' + fails.map(f => ' - ' + f).join('\n') : '=== PHONE PASS ==='));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('\n!!! PHONE ERROR:', e.message); process.exit(1); });
