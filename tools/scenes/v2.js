module.exports = async (page, shot, o) => {
  await shot('01_title');
  await page.click('#btnStart').catch(()=>{});
  // 标题淡出 0.7s，等它彻底隐藏再拍，否则半透明的标题字会压在场景上
  await page.waitForFunction(() => document.getElementById('title').classList.contains('gone'));
  await page.waitForTimeout(1000);
  await shot('02_run_start');

  // 跑一会儿，看第一个时代的构图
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(260); await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await shot('03_run_air');

  await page.waitForTimeout(2200);
  await shot('04_era2');

  // 不再操作，让它撞到结算页；等动画走完再拍，避免拍到淡入的中间态
  await page.waitForSelector('#over.on', { timeout: 40000 });
  await page.waitForTimeout(1200);
  await shot('05_result');

  // 「再坐一次」必须是真正的 reset，不是 location.reload
  await page.click('#btnAgain');
  await page.waitForTimeout(1000);
  const reset = await page.evaluate(() => ({
    titleGone: document.getElementById('title').classList.contains('gone'),
    hudOn: document.getElementById('hud').classList.contains('on'),
    overOn: document.getElementById('over').classList.contains('on'),
    score: document.getElementById('hudScore').textContent,
    url: location.search,
  }));
  console.log('   reset check:', JSON.stringify(reset));
  await shot('06_again');

  // 2007 那一站：三种说法摆在同一条线上
  await page.goto(page.url().split('?')[0] + '?shot=1&d=268', { waitUntil:'load' });
  await page.waitForTimeout(1500);
  await shot('07_rumor');

  // 终点：环形轨道 + 两个按钮
  await page.goto(page.url().split('?')[0] + '?shot=1&d=1120', { waitUntil:'load' });
  await page.waitForTimeout(2200);
  const endState = await page.evaluate(() => ({
    choiceOn: document.getElementById('choiceRow').classList.contains('on'),
    tlOn: document.getElementById('tl').classList.contains('on'),
    buttons: ['btnOff','btnStay'].map(id => {
      const b = document.getElementById(id), r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
      return { id, box:[r.x,r.y,r.width,r.height].map(Math.round), hitOK: !!(hit && (hit===b||b.contains(hit))) };
    }),
  }));
  console.log('   end check:', JSON.stringify(endState));
  await shot('08_end');

  // 其余三个时代：同一套 HUD 在 2014 灰 / 2020 紫 / 2026 青底上也得能读
  for (const [name, d] of [['09_2014', 480], ['10_2020', 660], ['11_2026', 860]]){
    await page.goto(page.url().split('?')[0] + '?shot=1&d=' + d, { waitUntil:'load' });
    await page.waitForTimeout(1300);
    await shot(name);
  }
};
