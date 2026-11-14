const { bestLoop } = require('../geom');
module.exports = async (page, shot, o) => {
  const W = o.w, H = o.h;
  // 视图由游戏按“本关物件包围盒”现算，夹具直接读页面里的真实 view
  const readView = () => page.evaluate(() => window.__game.getView());
  const drawLoop = async (v, pts) => {
    const toScr = p => [p.x*v.s + v.ox, p.y*v.s + v.oy];
    await page.mouse.move(...toScr(pts[0]));
    await page.mouse.down();
    for (const p of pts) await page.mouse.move(...toScr(p), { steps: 1 });
    await page.mouse.move(...toScr(pts[0]), { steps: 2 });
    await page.mouse.up();
  };

  await shot('01_card');
  await page.mouse.click(W/2, H/2);
  await page.waitForTimeout(450);
  await shot('02_play');

  const levels = await page.evaluate(() => window.__game.LEVELS);

  // 先故意画一个不够大的圈，截失败态
  const L0 = levels[0];
  const tiny = bestLoop(L0.objs, L0.need - 1, 44).pts;   // 故意少圈一样
  await drawLoop(await readView(), tiny);
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
    const { pts } = bestLoop(L.objs, L.need, 44);
    await drawLoop(await readView(), pts);
    const st = await page.evaluate(() => window.__game.G.state);
    await page.waitForTimeout(260);
    if (i === 0) await shot('04_sealed');
    if (st !== 'sealed'){ console.log(`   第 ${i+1} 站没封上（${st}）`); await shot('x_fail_'+i); }
    await page.waitForTimeout(1900);
  }
  await page.waitForTimeout(700);
  await shot('05_end');
};
