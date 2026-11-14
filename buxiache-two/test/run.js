// 《各执一词》headless 验收：真 Chromium 驱动，不走 DOM 假壳。
const path = require('path');
const { chromium } = require('/home/xiaodongye/dsh-3090/repo/node_modules/playwright');

const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const SHOTS = '/home/xiaodongye/shots/two';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const shot = n => page.screenshot({ path: SHOTS + '/' + n + '.png' });
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__g.S)));

  // ── 1. 开场 ──
  await page.goto(FILE);
  await page.waitForTimeout(300);
  ok(errors.length === 0, '打开无报错');
  ok(await page.locator('.who button').count() === 2, '开场给出两个可扮演的人');
  ok((await page.locator('#s-intro').innerText()).includes('重构'), '开场声明这是重构不是还原');
  await shot('01_intro');

  // ── 2. 选许飞 ──
  await page.click('.who .xf');
  await page.waitForTimeout(150);
  ok(await page.locator('#s-tl').isVisible(), '进入时间轴');
  ok((await S()).who === 'xf', '角色记为许飞');
  ok(await page.locator('#tl-list button').count() === 4, '时间轴三站 + 终局');
  ok(await page.locator('#tl-list button.fin').isDisabled(), '终局一开始锁着');
  await shot('02_timeline');

  // ── 3. 第一站：档案 → 场景 ──
  await page.locator('#tl-list button').nth(0).click();
  await page.waitForTimeout(300);
  ok(await page.locator('#s-arch').isVisible(), '先看档案，不是直接进场景');
  const arch1 = await page.locator('#arch-body').innerText();
  ok(arch1.includes('于公于私'), '档案含原始出处');
  ok(arch1.includes('公开可查'), '有可信度戳');
  await shot('03_archive');

  await page.click('#arch-go');
  await page.waitForTimeout(150);
  ok(await page.locator('#s-scene').isVisible(), '进入场景');
  ok(await page.locator('.opt').count() === 4, '三个选项 + 一个灰选项');
  ok(await page.locator('.opt.ghost').count() === 1, '灰选项只有一个');
  ok((await S()).battery === 5, '回去一次耗一格电');
  await shot('04_scene');

  // ── 4. 偏离档案 → 裂痕 ──
  await page.locator('.opt').nth(1).click();
  await page.waitForTimeout(150);
  const cons = await page.locator('#s-cons').innerText();
  ok(cons.includes('裂痕'), '偏离档案会产生裂痕');
  await shot('05_consequence');
  await page.click('#cons-back');
  await page.waitForTimeout(150);
  ok(await page.locator('#s-tl').isVisible(), '回到时间轴');
  ok((await S()).cracks === 2, '裂痕计数正确');
  ok((await page.locator('#tl-list button').nth(0).innerText()).includes('已经回去过'), '走过的一站被标记');

  // ── 5. 第二站：罗生门那一格必须是空的 ──
  await page.locator('#tl-list button').nth(1).click();
  await page.waitForTimeout(300);
  const arch2 = await page.locator('#arch-body').innerText();
  ok(arch2.includes('没有第三方证据'), '2007 节点的档案写明无第三方证据');
  ok(arch2.includes('厉娜把解约'), '指控方是厉娜，不是许飞');
  ok(!arch2.includes('许飞指认'), '没有把告密的指控方向写反');
  ok(arch2.includes('罗生门') || arch2.includes('⚠'), '标为罗生门，不是结论');
  await shot('06_archive_ruin');
  await page.click('#arch-go');
  await page.waitForTimeout(150);

  // 灰选项：说出口了吗
  await page.locator('.opt.ghost').click();
  await page.waitForTimeout(150);
  ok((await page.locator('#s-cons').innerText()).includes('没说出口'), '灰选项被识别为没说出口');
  ok((await S()).unspoken === 1, '没说出口计数 +1');
  await page.click('#cons-back');
  await page.waitForTimeout(150);

  // ── 6. 第三站 ──
  await page.locator('#tl-list button').nth(2).click();
  await page.waitForTimeout(300);
  const arch3 = await page.locator('#arch-body').innerText();
  ok(arch3.includes('画地为牢'), '第三站档案含关键台词');
  ok(arch3.includes('许飞说'), '「我画地为牢」是许飞说的');
  ok(arch3.includes('厉娜用 AI'), '查 AI、点麦当劳的是厉娜');
  await page.click('#arch-go');
  await page.waitForTimeout(150);
  await page.locator('.opt').nth(0).click();
  await page.waitForTimeout(150);
  await page.click('#cons-back');
  await page.waitForTimeout(150);

  // ── 7. 终局解锁 ──
  ok(!(await page.locator('#tl-list button.fin').isDisabled()), '走完三站后终局解锁');
  await page.locator('#tl-list button.fin').click();
  await page.waitForTimeout(300);
  await page.click('#arch-go');
  await page.waitForTimeout(150);
  ok(await page.locator('#s-scene').isVisible(), '进入终局');

  // ── 8. 两个版本并排 ──
  await page.locator('.opt').nth(0).click();
  await page.waitForTimeout(300);
  const end = await page.locator('#end-body').innerText();
  ok(end.includes('你 的 版 本') && end.includes('她 的 版 本'), '结局把两个版本并排放');
  ok(end.includes('不是同一件事'), '结局拒绝裁决');
  ok(end.includes('说 不 清') || end.includes('各 自 安 好'), '落到一个明确结局');
  await shot('07_ending');

  // ── 9. 全 match 走一遍 → 裂痕 0 ──
  await page.click('#restart');
  await page.waitForTimeout(150);
  await page.click('.who .ln');
  await page.waitForTimeout(150);
  for (let i = 0; i < 3; i++) {
    await page.locator('#tl-list button').nth(i).click();
    await page.waitForTimeout(200);
    await page.click('#arch-go');
    await page.waitForTimeout(120);
    await page.locator('.opt').nth(0).click();   // 每站第一个都是 match
    await page.waitForTimeout(120);
    await page.click('#cons-back');
    await page.waitForTimeout(120);
  }
  await page.locator('#tl-list button.fin').click();
  await page.waitForTimeout(200);
  await page.click('#arch-go');
  await page.waitForTimeout(120);
  await page.locator('.opt').nth(0).click();
  await page.waitForTimeout(250);
  const end2 = await page.locator('#end-body').innerText();
  ok(end2.includes('各 自 安 好'), '全程符合档案 → 各自安好');
  ok(end2.includes('我是被宣判的人'), '玩厉娜时，她的版本是许飞的账');
  ok(!end2.includes('麦当劳'), '玩厉娜时不会把她自己做的事写进"她的版本"');
  ok(!end2.includes('于公于私'), '玩厉娜时不会把 2006 年那一票算到许飞头上');

  // ── 10. 下车结局 + 电量拦截 ──
  await page.click('#restart');
  await page.waitForTimeout(150);
  await page.click('.who .xf');
  await page.waitForTimeout(120);
  const guard = await page.evaluate(() => {
    window.__g.S.battery = 0;
    window.__g.refresh();
    const btns = [...document.querySelectorAll('#tl-list button')];
    return { disabled: btns[0].disabled, fin: btns[3].disabled };
  });
  ok(guard.disabled, '没电了时间轴上的站点点不动');
  // 就算绕过禁用态直接调，也必须被守卫挡住
  const blocked = await page.evaluate(() => {
    const before = document.querySelectorAll('.screen.on')[0].id;
    window.__g.enterNode(window.__g.NODES[0]);
    return before === document.querySelectorAll('.screen.on')[0].id;
  });
  ok(blocked, '直接调用也被电量守卫挡住');

  // ── 11. 下车结局 ──
  await page.evaluate(() => { window.__g.S.battery = 6; window.__g.refresh(); });

  for (let i = 0; i < 3; i++) {
    await page.locator('#tl-list button').nth(i).click();
    await page.waitForTimeout(200); await page.click('#arch-go'); await page.waitForTimeout(120);
    await page.locator('.opt').nth(0).click(); await page.waitForTimeout(120);
    await page.click('#cons-back'); await page.waitForTimeout(120);
  }
  await page.locator('#tl-list button.fin').click(); await page.waitForTimeout(200);
  await page.click('#arch-go'); await page.waitForTimeout(120);
  await page.locator('.opt').nth(1).click();   // 不说，下车
  await page.waitForTimeout(250);
  ok((await page.locator('#end-body').innerText()).includes('下 车'), '选择不说 → 下车结局');
  await shot('08_leave');

  ok(errors.length === 0, '全程零报错（错误数 ' + errors.length + '）');

  await browser.close();
  console.log('\n=== ' + (fail ? 'FAIL' : 'PASS') + ' : ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩溃：', e.message); process.exit(1); });
