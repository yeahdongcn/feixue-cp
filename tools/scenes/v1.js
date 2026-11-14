/* v1《不下车》道具场景：标题 → 开场 → 对话 → 磁带盒 → 随身听 → 选项 → 战斗 → 结局
   既覆盖真实点击流，也把三个模态面板和结局页各留一张证据。 */
module.exports = async (page, shot, o) => {
  const W = o.w, H = o.h;
  const tap = async (ms = 220) => {
    await page.keyboard.press('Space').catch(()=>{});
    await page.mouse.click(W/2, H*0.82).catch(()=>{});
    await page.waitForTimeout(ms);
  };

  await shot('01_title');
  await page.click('#startBtn').catch(()=>{});
  await page.waitForTimeout(800);
  await shot('02_opening');

  for (let i = 0; i < 6; i++) await tap(260);
  await shot('03_dialog');

  for (let i = 0; i < 10; i++) await tap(180);
  await shot('04_story');

  // 磁带盒：先给两盘（初始只有一盘时 T 只会弹 toast），再用键盘打开
  await page.evaluate(() => { unlockTape('2006','2006 · 夏'); unlockTape('2007','2007 · 冬'); });
  await page.keyboard.press('t').catch(()=>{});
  await page.waitForTimeout(450);
  await shot('05_tape');
  await page.click('#tapeClose').catch(()=>{});
  await page.waitForTimeout(350);

  // 随身听（X）
  await page.keyboard.press('x').catch(()=>{});
  await page.waitForTimeout(400);
  await shot('06_menu');
  await page.click('#menuClose').catch(()=>{});
  await page.waitForTimeout(300);

  // 选项：跑一段真实剧本（保安查票），停在选择处
  await page.evaluate(() => { runScript(() => npcGuard()); });
  await page.waitForTimeout(900);
  await tap(600);                       // 把「票呢？」推过去 → 出现选项
  await shot('07_choice');
  await page.click('#choices .opt').catch(()=>{});
  await page.waitForTimeout(500);
  for (let i = 0; i < 18; i++) await tap(150);

  // 战斗：打镜子，留一张，然后走开
  await page.evaluate(() => { runScript(() => battle('mirror', { flee:true, q:5, zdown:3 })); });
  await page.waitForTimeout(900);
  await shot('08_battle');
  const cmds = await page.$$('#bCmds .bcmd');
  if (cmds.length) await cmds[cmds.length-1].click().catch(()=>{});
  await page.waitForTimeout(700);

  // 结局页
  await page.evaluate(() => { showEnding(); });
  await page.waitForTimeout(900);
  await shot('09_ending');

  // 真的「再来一次」：不是 reload，走 resetGame，回到站台并重播开场
  await page.click('#replay').catch(()=>{});
  await page.waitForTimeout(1400);
  await shot('10_replay');
};
