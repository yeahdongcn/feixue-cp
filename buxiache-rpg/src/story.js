
/* ═══════════════════════════════════════════════════════════
   剧本 · 六个年份
   ═══════════════════════════════════════════════════════════ */

const PLAYER_PAL = { skin:'#e8b98f', skin2:'#c9946d', hair:'#241a14', shirt:'#d94f63', shirt2:'#a83a4c', pants:'#2f3a52', shoe:'#1a1512' };
const NPC_PAL    = { skin:'#e0b088', skin2:'#bd8a63', hair:'#2a1e18', shirt:'#4a5a7a', shirt2:'#38465e', pants:'#2b3244', shoe:'#191410' };

const PAL = {
  xm:   { skin:'#eec39a', skin2:'#c99670', hair:'#3a2418', shirt:'#5f8fd6', shirt2:'#4770ad', pants:'#3a3f52', shoe:'#1a1512' },
  guard:{ skin:'#d8a878', skin2:'#b5875c', hair:'#1e1a16', shirt:'#2f3a46', shirt2:'#232c36', pants:'#1f2730', shoe:'#14100e' },
  scalper:{ skin:'#dcae82', skin2:'#b8895f', hair:'#2a2018', shirt:'#7a5a3a', shirt2:'#5e4429', pants:'#3a3028', shoe:'#171310' },
  poster:{ skin:'#e2b78e', skin2:'#bd9068', hair:'#241c16', shirt:'#3f4a3a', shirt2:'#2f382c', pants:'#2a2f2a', shoe:'#151310' },
  busker:{ skin:'#e6bd93', skin2:'#c1966d', hair:'#33241a', shirt:'#6a4a7a', shirt2:'#523960', pants:'#31303e', shoe:'#171216' },
  worker:{ skin:'#dcb48c', skin2:'#b78f68', hair:'#1f1b17', shirt:'#54606e', shirt2:'#3e4854', pants:'#2a3038', shoe:'#141210' },
  mod:  { skin:'#ecc49c', skin2:'#c79c74', hair:'#2e1f18', shirt:'#d0709a', shirt2:'#a8557a', pants:'#3a2e40', shoe:'#1a1218' },
  pap:  { skin:'#e0b48a', skin2:'#bb9068', hair:'#241a14', shirt:'#2a2a34', shirt2:'#1e1e26', pants:'#232330', shoe:'#121014' },
  fan:  { skin:'#e9c09a', skin2:'#c49873', hair:'#2c1e16', shirt:'#c85a52', shirt2:'#a0443e', pants:'#33384a', shoe:'#181412' },
  grey: { skin:'#c9c9c9', skin2:'#a4a4a4', hair:'#141414', shirt:'#2a2a2a', shirt2:'#1e1e1e', pants:'#1c1c1c', shoe:'#0e0e0e' },
};

/* ───────── 2006 ───────── */
async function npcXiaoman(){
  if (!S.flags.xm1){
    await say('小满','你也是飞雪的？');
    await say('小满','她们今天住一个宿舍。我表哥在里面当志愿者，真的。');
    await say('小满','厉娜爱干净，天天晾白T恤。许飞被她喂鸭舌，现在自己也上瘾了。');
    S.flags.xm1 = 1;
    await say('','（你记住了。有些细节会跟着你一辈子。）');
    await say('小满','哎，你那台随身听，借我看看。');
    await say('','你递过去。她按了一下播放键，什么声音都没有。');
    await say('小满','空的。……你后面地上那个是什么？');
  } else if (S.tapes.includes('2007')){
    await say('小满','你今天话怎么这么少？');
    await say('小满','刚才那个瞬间，你会记很久吧。');
    S.qing += 1; updateHUD();
  } else {
    await say('小满','快去门口啊，一会儿人就满了。');
  }
}

async function npcGuard(){
  if (S.flags.door1){
    await say('保安','散了散了，人都走完了。');
    if (S.tapes.includes('2007')) await say('保安','……你站这儿半天了，不冷啊？');
    return;
  }
  await say('保安','票呢？');
  const c = await choose(['有。（其实没有）','没有。']);
  if (c === 0){
    await say('保安','拿出来看看。');
    await say('','你把手伸进兜里，摸到一张皱掉的公交票。');
    await say('保安','……行吧，站这边，别挤。');
    S.zhi += 1;
  } else {
    await say('保安','那站远点。');
    await say('','你站到警戒线外面。你还是很高兴。');
  }

  await delay(200);
  await say('','就在这时，里面传来一阵尖叫。');
  await say('','大屏幕切到后台：灯光很亮，两个人站在台口。');
  await say('','主持人问厉娜：你这一票，投给谁？标准是什么？');
  await say('','她没看镜头。');
  await say('厉娜','于公于私，于情于理。');
  await say('','然后她举起了许飞的手。');
  await say('','整条街都在叫。你也在叫，叫到听不见自己。');
  await say('','那天晚上回去，你在随身听里塞进了第一盘磁带。');
  await say('','你也不记得自己是什么时候录的。');
  S.flags.door1 = 1;
  unlockTape('2007','2007 · 冬');
  S.qing += 1; updateHUD();
}

/* ───────── 2007 ───────── */
async function npcPoster(){
  if (!S.flags.poster1){
    await say('发帖的人','包夜十块。机器在里面。');
    await say('','他屏幕上是天涯的页面。标题很长。');
    await say('发帖的人','《关于某超女解约那点事，我知道的不多，但都是真的》。');
    await say('','楼主只说了三句话。');
    await say('','一、她不是自己要走的。');
    await say('','二、她的计划，只有一个人知道。');
    await say('','三、那个人，现在还在台上。');
    await say('','下面跟了两千一百三十七楼。');
    S.flags.poster1 = 1;
  } else {
    await say('发帖的人','还在看啊。');
  }
  await say('发帖的人','你说，这三句话，哪句是真的？');
  const c = await choose(['第一句。','第二句。','第三句。','一句都不是。']);
  S.flags.belief = c;
  if (c === 3){ await say('发帖的人','那你来这儿干嘛。'); S.qing += 2; }
  else { await say('发帖的人','嗯。我也是这么想的。'); S.zhi += 2; }
  updateHUD();
}

async function npcWhisper(){
  await say('','一个戴口罩的人站在路灯下。');
  await say('口罩人','你也想知道是谁说的，对吧。');
  await say('口罩人','我告诉你。');
  const ok = await battle('whisper', { flee:true, q:3, zdown:2 });
  if (ok){
    await say('','你说：我不知道。而且，我可能永远都不会知道。');
    await say('','他笑了一下，散成了一堆没有上下文的句子。');
    await say('','地上留下一盘磁带。标签：2007 · 冬。');
    unlockTape('2014','2014 · 春');
    S.flags.whisperDone = 1;
  } else {
    await say('','你没能反驳他。');
    await say('','他说的那些话，你带回了家。');
    S.flags.whisperFail = 1;
  }
}

/* ───────── 2014 ───────── */
async function npcBusker(){
  await say('','地铁口有个弹吉他的人。他唱的歌你听过。');
  await say('卖唱的人','这首歌不要钱。');
  await say('','他在唱一个父亲写给女儿的字。你站在风里听完。');
  const c = await choose(['给他十块。','站着听完，没钱。']);
  if (c === 0){ S.zhi += 1; await say('卖唱的人','谢谢。你也在等人吧。'); }
  else { S.qing += 1; await say('卖唱的人','站着听就挺好。'); }
  await say('卖唱的人','我在这儿唱了三年，从来没人点她的歌。');
  await say('卖唱的人','你是第一个听出来的。');
  updateHUD();
}

async function npcWorker(){
  if (!S.flags.worker1){
    await say('加班的人','借个火。');
    await say('','你没火。他还是站着没走。');
    await say('加班的人','你手机屏保是06年超女？');
    await say('','你赶紧按灭了屏幕。');
    await say('加班的人','我当年也投过。一条一块，我投了三十条。');
    await say('加班的人','后来她消失了七年。你算过吗，七年是多少天。');
    S.flags.worker1 = 1;
  } else {
    await say('加班的人','两千五百五十五天。');
  }
  await say('加班的人','你自己算算。');
}

async function npcSeven(){
  await say('','地铁口的风把一张旧日历吹到你脚边。');
  await say('','上面的数字一直在跳。');
  const ok = await battle('seven', { flee:true, q:3, zdown:2 });
  if (ok){
    await say('','你说：七年就是七年。它已经过去了。');
    await say('','日历落在地上，停在了今天。');
    await say('','你捡起来，背面是一盘磁带。');
    unlockTape('2020','2020 · 春');
  } else {
    await say('','你算不过来。数字把你埋了。');
  }
}

/* ───────── 2020 ───────── */
async function npcMod(){
  if (S.flags.mod1){ await say('群管','群还在。安静得像没人。'); return; }
  await say('群管','486个人，十分钟999+。你也是群主吧。');
  await say('','她手机屏幕上全是红点。');
  await say('群管','他们让我踢人。踢谁？踢说真话的，还是踢说假话的？');
  const c = await choose(['控评。把骂她的都踢了。','打一段很长的话，然后删掉。','把群解散。']);
  if (c === 0){ S.zhi += 2; await say('群管','好。那我先走了。'); await say('','群里少了一半人。你盯着那个数字看了很久。'); }
  if (c === 1){ S.qing += 2; await say('群管','……你打了多久？'); await say('','四十分钟。你一个字都没发出去。'); }
  if (c === 2){ S.qing += 3; await say('','486个人，一瞬间安静。'); await say('群管','挺好的。'); }
  S.flags.mod1 = 1;
  await say('','那天晚上，另一个人的回应只有六个字。');
  await say('厉娜','我们不说别人了，乖。');
  await say('','就这一句。热搜上没人转。');
  unlockTape('2026','2026 · 秋');
  S.flags.got2026 = 1;
  updateHUD();
}

async function npcPap(){
  await say('代拍','姐，让一下。');
  await say('','她扛着一台长焦，站了三个小时。');
  await say('代拍','我拍这个八年了。她们俩同框，我一共拍到过两次。');
  await say('代拍','一次是今年，一次是……很久以前。');
  await say('代拍','你说，这算不算一个故事？');
  const c = await choose(['算。','不算，这是两个人的人生。']);
  if (c === 1){ S.qing += 2; await say('代拍','……你说得对。'); }
  else { S.zhi += 1; await say('代拍','那我这八年没白站。'); }
  updateHUD();
}

/* ───────── 2026 ───────── */
async function npcStation(){
  await say('站姐','你也来啦。');
  await say('站姐','从今天早上六点开始，这儿已经站了四十多个人。');
  await say('站姐','她们待会儿从那个门出来。就那一个门。');
  await say('站姐','你说，我要是把相机放下，我还能干什么？');
  const c = await choose(['继续拍。','把相机放下。']);
  if (c === 0){ S.zhi += 2; await say('站姐','对，拍。拍到没得拍为止。'); }
  else { S.qing += 2; await say('站姐','……我试试。'); }
  updateHUD();
}

async function npcPasserby(){
  await say('路人','这节目真好看。');
  await say('路人','我妈都看哭了。她说这两个人怎么这么犟。');
  await say('','你笑了笑，没解释。');
  await say('路人','哎，你说她们到底怎么了？');
  const c = await choose(['一个人说了什么。','什么都没发生。','我不知道。']);
  if (c === 2){ S.qing += 2; }
  else { S.zhi += 1; }
  await say('路人','哦。');
  updateHUD();
}

async function objPlatform(){
  if (S.flags.platformDone){ await say('','站台上空了。风把雪吹进轨道里。'); return; }
  await say('','站台尽头停着保姆车。');
  await say('','一个女人走到车边，蹲了下去。');
  await say('','她在系鞋带。');
  await delay(300);
  await say('','……她的鞋带，是系好的。');
  await say('','她解开，又系上。第二次。');
  await say('','第三次。她抬头看了一眼另一辆车的方向。');
  await say('','第四次。她站起来，上了那辆车。');
  await delay(400);
  await say('','车门关上了。');
  await say('','弹幕开始刷。有人说「她就是在等」，有人说「别过度解读」。');
  await say('','两边吵了三千楼。');
  await say('','你忽然意识到：这个画面里，唯一不知道自己在演什么的人，可能是她本人。');
  S.flags.platformDone = 1;
  S.items.push('一段十一秒的视频');
  S.zhi += 2; updateHUD();

  await say('','你转过身，看见玻璃上映出一个人。');
  await say('','那个人和你穿一样的衣服。');
  const ok = await battle('mirror', { q:5, zdown:3 });
  if (ok){
    await say('','你对他说：你只是我。');
    await say('','他点了点头，像终于被允许离开。');
    await say('','玻璃碎了，后面是一盘磁带。');
    await say('','标签上什么都没写。');
    unlockTape('????','？？？？');
  } else {
    await say('','他说得对。你一直是这么想的。');
    await say('','……但你还是站在这儿。');
    await say('','你从兜里摸出一盘没有标签的磁带。');
    unlockTape('????','？？？？');
  }
}

/* ───────── ???? ───────── */
async function npcVoid(){
  await say('','这里什么都没有。只有一扇门，和一个人。');
  await say('灰','你终于来了。');
  await say('灰','门后面是 2006 年。你随时可以回去。');
  await say('灰','但你要先回答我一个问题。');
  await say('灰','这二十年，你爱的到底是她们，还是你自己那段十七岁？');
  const c = await choose(['是她们。','是我自己。','我不想分。']);
  S.flags.final = c + 1;   // 0 是假值，不能直接用
  if (c === 0){ S.zhi += 3; }
  if (c === 1){ S.qing += 4; }
  if (c === 2){ S.zhi += 1; S.qing += 2; }
  await say('灰','进去吧。');
  updateHUD();
}

async function objDoor(){
  if (!S.flags.final){
    await say('','门锁着。');
    await say('','（还有个人在等你说话。）');
    return;
  }
  await say('','门后面很亮。');
  await say('','你听见很多年前的声音：整条街都在叫。');
  showEnding();
}

/* ═══════════════════════════════════════════════════════════
   时代配置
   ═══════════════════════════════════════════════════════════ */
const ERA_SCRIPT = {
  '2006': {
    hint:'去广电门口看看',
    npcs:[
      { id:'xm', name:'小满', tx:20, ty:11, dir:0, pal:PAL.xm, opt:{longHair:true}, script:npcXiaoman },
      { id:'guard', name:'保安', tx:20, ty:9, dir:0, pal:PAL.guard, opt:{hat:'cap'}, script:npcGuard },
      { id:'sc', name:'黄牛', tx:13, ty:12, dir:2, pal:PAL.scalper, opt:{bag:true}, script:async()=>{ await say('黄牛','票要不要？内场三百。'); const c=await choose(['太贵了。','……买。']); if(c===0){S.qing+=1; await say('黄牛','穷鬼。');} else {S.zhi+=2; await say('黄牛','爽快。'); await say('','你花了三百块，买了一张根本进不去的票。');} updateHUD(); } },
      { id:'fan2', name:'举牌的人', tx:26, ty:13, dir:1, pal:PAL.fan, opt:{longHair:true}, script:async()=>{ await say('举牌的人','飞雪 forever！'); await say('','她把两个人的名字写在同一张纸上，中间画了一颗心。'); await say('举牌的人','你说她们会一直这么好吗？'); const c=await choose(['会。','不会。']); if(c===0){S.zhi+=2;} else {S.qing+=2;} updateHUD(); } },
    ],
    objs:[
      { id:'t1', type:'tape', tx:9, ty:12,
        text:'地上一盘磁带。标签上手写着：2006 · 夏。\n你完全不记得自己录过这个。',
        tape:'2006', tapeName:'2006 · 夏',
        after: async()=>{ await say('','你把它塞进随身听。按下了播放。'); await say('','里面是你自己的呼吸声，很吵，很远。'); await say('','然后是一个女孩的声音，在喊一个名字。'); await say('','……按 T，你可以回到这一年。任何时候。'); } },
    ],
  },

  '2007': {
    hint:'网吧 / 路灯下那个戴口罩的人',
    npcs:[
      { id:'po', name:'发帖的人', tx:6, ty:17, dir:0, pal:PAL.poster, opt:{bag:true}, script:npcPoster },
      { id:'wh', name:'口罩人', tx:27, ty:12, dir:3, pal:PAL.grey, opt:{hat:'beanie'},
        when:()=>!S.flags.whisperDone, script:npcWhisper },
      { id:'wd', name:'扫雪的人', tx:14, ty:18, dir:1, pal:PAL.worker,
        script:async()=>{ await say('扫雪的人','今年的雪，下得比哪年都大。'); await say('','他扫出一条路，风又把它填回去。'); } },
    ],
    objs:[],
  },

  '2014': {
    hint:'地铁口',
    npcs:[
      { id:'bu', name:'卖唱的人', tx:6, ty:17, dir:1, pal:PAL.busker, opt:{longHair:true}, script:npcBusker },
      { id:'wo', name:'加班的人', tx:28, ty:17, dir:3, pal:PAL.worker, opt:{bag:true}, script:npcWorker },
      { id:'sv', name:'七年', tx:30, ty:11, dir:0, pal:PAL.grey, when:()=>!S.tapes.includes('2020'), script:npcSeven },
    ],
    objs:[],
  },

  '2020': {
    hint:'录制基地外',
    npcs:[
      { id:'mo', name:'群管', tx:14, ty:12, dir:0, pal:PAL.mod, opt:{longHair:true}, script:npcMod },
      { id:'pa', name:'代拍', tx:26, ty:12, dir:2, pal:PAL.pap, opt:{hat:'cap'}, script:npcPap },
    ],
    objs:[],
  },

  '2026': {
    hint:()=> S.tapes.includes('2026') ? '站台尽头' : '雪地里好像有东西在反光',
    npcs:[
      { id:'st', name:'站姐', tx:17, ty:11, dir:0, pal:PAL.fan, opt:{longHair:true}, script:npcStation },
      { id:'ps', name:'路人', tx:24, ty:17, dir:3, pal:PAL.worker, script:npcPasserby },
    ],
    objs:[
      { id:'t0', type:'tape', tx:20, ty:13, once:true,
        when:()=> !S.tapes.includes('2006'),
        text:'雪地里有个东西在反光。\n是一盒磁带。标签旧得发黄，上面写着：2006 · 夏。',
        tape:'2006', tapeName:'2006 · 夏',
        after: async()=>{
          await say('','你把它塞进随身听，按下播放。');
          await say('','里面是蝉鸣。很吵。还有很远的人声，在喊一个名字。');
          await say('','（按 T，打开磁带盒。）');
        } },
      { id:'plat', type:'station', tx:27, ty:19, text:'',
        when:()=> S.tapes.includes('2026'), script:objPlatform },
    ],
  },

  '????': {
    hint:'那扇门',
    npcs:[
      { id:'gr', name:'灰', tx:20, ty:11, dir:0, pal:PAL.grey, opt:{glow:'#f0e8d0'}, script:npcVoid },
    ],
    objs:[
      { id:'door', type:'door', tx:20, ty:8, text:'', script:objDoor },
    ],
  },
};

/* 覆盖：把 tile 坐标转成像素 */
function eraNPCs(){
  const l = (ERA_SCRIPT[S.era] && ERA_SCRIPT[S.era].npcs) || [];
  return l.filter(n => !n.when || n.when()).map(n => Object.assign({}, n, { x:n.tx*TS, y:n.ty*TS }));
}
function eraObjs(){
  const l = (ERA_SCRIPT[S.era] && ERA_SCRIPT[S.era].objs) || [];
  return l.filter(o => !o.hidden)
          .filter(o => !o.when || o.when())
          .map(o => Object.assign({}, o, { x:o.tx*TS, y:o.ty*TS }));
}

/* ═══════════════════════════════════════════════════════════
   结局
   ═══════════════════════════════════════════════════════════ */
let endingShown = false;

const ENDINGS = {
  be: { tag:'ENDING 01', t:'意难平', s:'你还在那间屋子里',
    p:['节目结束以后，你还是每天刷她们的词条。',
       '你把那十一秒的视频存下来，调成 0.5 倍速，一帧一帧地看。你在评论区认识了很多和你一样的人。你们互相确认：那双鞋，是有话要说的。',
       '你开始写。你把二十年写成一条时间线，细到自己都相信了。',
       '有天深夜你写到一半，停下来问自己：这件事里，我到底知道什么？',
       '你真正确认过的，只有一些画面。鸭舌。白T恤。一只举起来的手。四次没松过的鞋带。一句「我画地为牢」。一份麦当劳。两扇没有打开的车门。',
       '剩下的全是你的。',
       '你没有关掉那个文档。你只是把标题从「真相」改成了「我以为」。'] },
  peace: { tag:'ENDING 02', t:'各自安好', s:'你把灯牌放下了',
    p:['你发了一条很长的微博。写完删，删完写，最后发出去的只有一句：',
       '「谢谢你们唱过歌。」',
       '你把超话取关了。没有告别，没有仪式。第二天醒来，世界并没有变。地铁还是那么挤，你还是坐过了两站。',
       '后来你偶尔还会刷到她们。一个接了新的商演，一个发了新歌。评论区还是有人在问那个问题，还是有人给出不同的答案。',
       '你不再点进去了。',
       '你不是不爱了。你只是终于分清了：你爱的是她们唱过的歌，不是她们必须成为你想象的样子。'] },
  wall: { tag:'ENDING 03', t:'画地为牢', s:'你承认你也是那个人',
    p:['你没有脱粉，也没有再上头。你就那么待在原地。',
       '那句「我画地为牢」，你听了不止一遍。你起初觉得那是她在说她自己。后来你发现，说这句话的人，可以是任何一个在深夜里翻旧账的人。',
       '你想起十七岁那年，你在灯牌背面写了三个字，又涂掉。你涂得很用力，马克笔都洇开了。',
       '二十年后那三个字露出来了。你才明白，有些东西不是被涂掉的，是被压在下面的。',
       '你继续做你的粉丝。你买票，你听歌，你在她们各自的评论区里留一句「好听」。',
       '你不催她们和好，也不再帮她们编故事。',
       '你只是把那盏灯牌留着了。有一天你也许会扔掉。但不是今天。'] },
  out: { tag:'ENDING 04', t:'局外人', s:'你只是看了一档好节目',
    p:['你把整季看完，关掉视频，去洗了个碗。',
       '节目确实好看。剪辑、配乐、那个海拔四千米的悬崖小屋，都好看。',
       '有人问你：你磕吗？',
       '你说：不磕，但我理解。',
       '你理解一个人在原地站了十五年，也理解另一个人根本不知道有这间屋子。你理解深情，也理解钝感。你甚至理解那个深夜发视频的编剧——大家只是想在自己的人生里，找到一个不会散的版本。',
       '你没有收集那些料。你只是记得，有两个女孩在 2006 年的夏天，同住过一间宿舍。',
       '一个爱干净，天天晾白T恤。一个被人递了一袋鸭舌，从此吃上瘾。',
       '这就够了。剩下的，是别人的二十年。'] },
};

function showEnding(){
  if (endingShown) return;
  endingShown = true;
  paused = true;
  let key;
  const z = S.zhi, q = S.qing;
  if (z >= 9 && z - q >= 4) key = 'be';
  else if (q >= 8 && q - z >= 2) key = 'peace';
  else if (z >= 5) key = 'wall';
  else key = 'out';
  const E = ENDINGS[key];
  el.ending.classList.add('on');
  el.ending.innerHTML =
    '<div class="end-in">' +
    '<div class="etag">' + E.tag + '</div>' +
    '<h2>' + E.t + '</h2>' +
    '<div class="esub">' + E.s + '</div>' +
    '<div class="ebody">' + E.p.map(x=>'<p>'+x+'</p>').join('') + '</div>' +
    '<div class="erule"></div>' +
    '<div class="estats"><span>执念 '+z+'</span><span>清醒 '+q+'</span><span>磁带 '+S.tapes.length+'/6</span></div>' +
    '<div class="enote">本作是非官方同人。许飞与厉娜是真实的歌手，2006 年《超级女声》长沙赛区的冠军与季军，全国第五与第六。' +
    '文中公开事件均有报道可循；而「告密」至今是罗生门，双方各执一词，没有任何一方被证实。所有情感解读都是粉丝视角的虚构。<br><br>请把她们当歌手。她们唱过歌，这就够了。</div>' +
    '<button id="replay">再来一次</button>' +
    '</div>';
  $('#replay').onclick = () => { resetGame(); playIntro(); };
}

/* ═══════════════════════════════════════════════════════════
   启动 / 重开
   ═══════════════════════════════════════════════════════════ */

/* 真正的重置：不 reload 页面、不依赖查询参数。
   点「再来一次」、或从结局回到开头，都走这里，等同一次干净的新开局。 */
function resetGame(){
  // 1) 清掉所有异步 / 模态状态
  confirmQ.length = 0;
  scriptLock = false;
  dlgActive = false;
  battleActive = false;
  if (battleAnimId){ clearInterval(battleAnimId); battleAnimId = 0; }
  tapeOpen = false; menuOpen = false;
  endingShown = false;
  el.tapeUI.classList.remove('on');
  el.menu.classList.remove('on');
  el.battle.classList.remove('on');
  el.ending.classList.remove('on');
  el.ending.innerHTML = '';
  el.fade.classList.remove('on');
  $('#toast').classList.remove('on');
  clearTimeout(toastT);
  dlgOff();
  el.choices.innerHTML = '';
  document.body.classList.remove('choosing');

  // 2) 回到 2026 年秋天的站台
  S.era = '2026';
  S.tapes = [];
  S.flags = {};
  S.zhi = 0; S.qing = 0;
  S.hp = S.maxhp = 32;
  S.items = [];
  S.ended = false;
  ERA = ERAS['2026'];
  P.x = 20*TS; P.y = 11*TS; P.dir = 0; P.fr = 0; P.t = 0;
  PLAYER_PAL.shirt = '#d94f63'; PLAYER_PAL.shirt2 = '#a83a4c';
  buildMap();
  bakeMap();
  initWeather(ERA.weather);
  NPCS = eraNPCs();
  OBJS = eraObjs();
  updateCamera();
  updateHUD();
  for (const k in keys) keys[k] = false;

  // 3) 重新开一条干净的渲染循环
  titleMode = false;
  paused = false;
  started = true;
  document.body.classList.add('started');
  startLoop();
}

async function playIntro(){
  await delay(320);
  const touch = document.body.classList.contains('touch');
  await runScript(async () => {
    await say('','2026年10月。夜里十一点四十。');
    await say('','你站在一列开往北方的车站台上。雪落在睫毛上，化得很快。');
    await say('','你不记得自己为什么会在这里。');
    await say('', touch ? '左下角方向键走路，A 说话，右上「磁带」换年份。'
                        : '方向键走路，Z 说话，X 打开随身听。');
    await say('','出站口那边，有个东西在雪里反光。');
  });
}

async function startGame(){
  if (started && !endingShown) return;   // 防双击
  el.title.classList.add('gone');
  resetGame();
  await playIntro();
}

function syncTouchMode(){
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const hasTouch = ('ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const narrow = (typeof window !== 'undefined' && window.innerWidth <= 680);
  const on = !!(coarse || hasTouch || narrow);
  document.body.classList.toggle('touch', on);
  // 标题上的操作说明跟着输入方式走
  const tk = $('.tkeys');
  if (tk){
    if (!tk.dataset.pc) tk.dataset.pc = tk.innerHTML;
    tk.innerHTML = on
      ? '左下方向键 走路　A 说话<br>右上「磁带」换年份　B 打开随身听'
      : tk.dataset.pc;
  }
}

function bindUI(){
  $('#startBtn').onclick = () => { startGame(); };

  $('#tapeClose').onclick = closeTape;
  $('#menuClose').onclick = () => { menuOpen = false; el.menu.classList.remove('on'); };

  syncTouchMode();

  // 触屏方向键
  document.querySelectorAll('[data-key]').forEach(b => {
    const k = b.dataset.key;
    const on = e => { e.preventDefault(); keys[k] = true; };
    const off = e => { e.preventDefault(); keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  const a = $('#btnA'), bb = $('#btnB'), tt = $('#btnT');
  if (a) a.addEventListener('pointerdown', e => { e.preventDefault(); onConfirm(); });
  if (bb) bb.addEventListener('pointerdown', e => { e.preventDefault(); onCancel(); });
  if (tt) tt.addEventListener('pointerdown', e => { e.preventDefault(); onTapeKey(); });

  // 点画面 / 对话框推进对话。绑在 stage 上：canvas 之外的地方也能点
  const stage = $('#stage');
  stage.addEventListener('pointerdown', e => {
    if (!dlgActive) return;
    const t = e.target;
    if (t && t.closest && t.closest('button,.sheet,#title,#ending')) return;
    onConfirm();
  });

  // 点遮罩空白处关闭弹层
  const sheet = $('#tapeUI');
  if (sheet) sheet.addEventListener('pointerdown', e => { if (e.target === sheet) closeTape(); });
  const menu = $('#menu');
  if (menu) menu.addEventListener('pointerdown', e => {
    if (e.target !== menu) return;
    menuOpen = false; el.menu.classList.remove('on');
  });

  // 数字键选择
  window.addEventListener('keydown', e => {
    if (!dlgActive) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9){
      const b = el.choices.children[n-1];
      if (b && el.choices.classList.contains('on')){ e.preventDefault(); b.click(); }
    }
  });

  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas(){
  const r = $('#stage').getBoundingClientRect();
  const portrait = r.height > r.width * 1.02;
  document.body.classList.toggle('portrait', portrait);
  syncTouchMode();

  const sc = Math.max(0.2, Math.min(r.width / CW, r.height / CH));
  const w = Math.round(CW*sc), h = Math.round(CH*sc);
  const L = Math.round((r.width-w)/2);
  // 竖屏：画面贴顶，剩下的纵向空间交给手柄和对话框，避免上下两条大黑边
  const T = portrait ? Math.round(Math.min(48, Math.max(8, r.height*0.018)))
                     : Math.round((r.height-h)/2);
  const scr = $('#screen');
  scr.style.left = L+'px'; scr.style.top = T+'px';
  scr.style.width = w+'px'; scr.style.height = h+'px';
  document.documentElement.style.setProperty('--sh', (T+h)+'px');

  if (bgCanvas){
    bgCanvas.width = Math.max(64, Math.round(r.width/4));
    bgCanvas.height = Math.max(64, Math.round(r.height/4));
  }
}

function boot(){
  canvas = $('#cv');
  canvas.width = CW; canvas.height = CH;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  bgCanvas = $('#cvBg');
  bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
  cacheEls();
  bindInput();
  bindUI();
  resizeCanvas();
  window.addEventListener('load', resizeCanvas);
  setTimeout(resizeCanvas, 60);
  titleScene();
}

/* 标题背后就是 2026 年的站台：雪一直下，灯一直亮，镜头很慢地漂 */
function titleScene(){
  ERA = ERAS['2026'];
  S.era = '2026';
  buildMap(); bakeMap();
  initWeather('snow');
  NPCS = eraNPCs();
  OBJS = eraObjs();
  P.x = 20*TS; P.y = 14*TS; P.dir = 0;
  updateCamera();
  updateHUD();
  titleMode = true; paused = true; started = false;
  document.body.classList.remove('started');
  startLoop();
}

boot();
