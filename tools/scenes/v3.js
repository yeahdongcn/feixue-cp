const { bestLoop } = require('../geom');
module.exports = async (page, shot, o) => {
  const W = o.w, H = o.h;
  const s = Math.min(W*0.94, H*0.78)/1000;
  const ox = (W - 1000*s)/2, oy = (H - 1000*s)*0.52;
  const toScr = p => [p.x*s + ox, p.y*s + oy];

  await shot('01_card');
  await page.mouse.click(W/2, H/2);
  await page.waitForTimeout(450);
  await shot('02_play');

  const levels = await page.evaluate(() => window.__game.LEVELS);

  // 先故意画一个不够大的圈，截失败态
  const L0 = levels[0];
  const tiny = bestLoop(L0.objs, L0.need - 1, 34).pts;   // 故意少圈一样
  await page.mouse.move(...toScr(tiny[0]));
  await page.mouse.down();
  for (const p of tiny) await page.mouse.move(...toScr(p), { steps: 2 });
  await page.mouse.move(...toScr(tiny[0]));
  await page.mouse.up();
  await page.waitForTimeout(320);
  await shot('03_fail');
  await page.waitForTimeout(900);

  // 正式跑完六站
  for (let i = 0; i < levels.length; i++){
    if (i > 0){
      await page.mouse.click(W/2, H/2);          // 章节卡
      await page.waitForTimeout(500);
    }
    const L = levels[i];
    const { pts } = bestLoop(L.objs, L.need, 34);
    await page.mouse.move(...toScr(pts[0]));
    await page.mouse.down();
    for (const p of pts) await page.mouse.move(...toScr(p), { steps: 2 });
    await page.mouse.move(...toScr(pts[0]), { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(260);
    if (i === 0) await shot('04_sealed');
    const st = await page.evaluate(() => window.__game.G.state);
    if (st !== 'sealed'){ console.log(`   第 ${i+1} 站没封上（${st}）`); await shot('x_fail_'+i); }
    await page.waitForTimeout(1900);
  }
  await page.waitForTimeout(700);
  await shot('05_end');
};
