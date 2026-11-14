/* 交付边界自检：
   ① 不引任何外部资源（无 CDN / 图片 / 字体 / 音频文件）
   ② “重新开始”不用 location.reload
   ③ 正文色 vs 各级底色对比度 ≥ 4.5
   ④ 正文 / 界面字号 ≥ 13px（canvas 物件名也 ≥ 13px）
   ⑤ 结算卡与分享文案的关键节点都在
*/
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
let bad = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };

console.log('— 外部资源 —');
const external = [
  [/https?:\/\//i, '没有任何 http(s) 地址'],
  [/<script[^>]+\bsrc=/i, '没有外链脚本'],
  [/<link\b/i, '没有外链样式 / 字体'],
  [/<img\b/i, '没有图片文件'],
  [/<(audio|video)\b/i, '没有音频 / 视频文件'],
  [/@font-face/i, '没有字体文件'],
  [/\burl\s*\(/i, 'CSS 里没有 url() 资源'],
  [/\bnew\s+Image\s*\(/i, '没有 new Image()'],
  [/\bfetch\s*\(/i, '没有 fetch()'],
];
for (const [re, m] of external) chk(!re.test(html), m);

console.log('\n— 重新开始 —');
chk(!/location\.reload/.test(html), '不用 location.reload（真重置：loadLevel + showCard + 清空记录）');
chk(/location\.reload/.test(html) === false && /function loadLevel/.test(html), '有 loadLevel 重置函数');
chk(/btnAgain/.test(html), '「再画一次」入口存在');

console.log('\n— 对比度（WCAG，正文 ≥ 4.5）—');
const vars = {};
for (const m of html.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) vars[m[1]] = m[2];
const lum = hex => {
  const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const grounds = { '纸面 #0d0c0a': '#0d0c0a', '结算卡顶 #2f261c': '#2f261c', '结算卡底 #231d15': '#231d15', '年份格 #241d15': '#241d15' };
const inks = { '正文 ink': vars.ink, '次要 ink2': vars.ink2, '弱化 dim': vars.dim, '暖色 warm': vars.warm, '暖色 warm2': vars.warm2, '失败 bad': vars.bad };
let min = { r: Infinity, name: '' };
for (const [gn, g] of Object.entries(grounds)) {
  for (const [fn, f] of Object.entries(inks)) {
    const r = ratio(f, g);
    if (r < min.r) min = { r, name: `${fn} / ${gn}` };
    chk(r >= 4.5, `${fn} on ${gn} = ${r.toFixed(2)}`);
  }
}
chk(ratio('#1a1209', '#f2c78f') >= 4.5, `主按钮深字 on 暖底 = ${ratio('#1a1209', '#f2c78f').toFixed(2)}`);
console.log(`  最紧的一对：${min.name} = ${min.r.toFixed(2)}`);

console.log('\n— 字号 —');
const smallCss = [...html.matchAll(/font-size\s*:\s*(1[0-2])px/g)].map(m => m[0]);
chk(smallCss.length === 0, `没有 10–12px 的界面字号${smallCss.length ? '（' + smallCss.join(', ') + '）' : ''}`);
chk((html.match(/13px "Songti SC"/g) || []).length >= 1, 'canvas 物件名 ≥ 13px');

console.log('\n— 触控 / 小屏 —');
chk(/min-height:44px/.test(html), '声音按钮触控高度 ≥44px');
chk(/body\.card-open[^{}]*#snd/.test(html), '章节卡上声音按钮隐藏（避免可见但点不到）');
chk(/@media \(max-width:360px\)/.test(html), '≤360px 有结算卡压缩版式');
chk(/@media \(max-height:520px\)/.test(html), '≤520px 高（横屏）有结算卡压缩版式');

console.log('\n— 结算卡 / 分享 —');
const need = ['shareCard', 'eKept', 'eLeft', 'eStat', 'eYears', 'eBig', 'btnAgain', 'btnCopy', 'snd', 'cv'];
for (const id of need) chk(new RegExp(`id="${id}"`).test(html), `#${id} 在页面里`);
chk(/shareText\s*\(/.test(html) && /navigator\.clipboard/.test(html), '分享句可复制（clipboard + 兜底）');
chk(/六站，绳子从/.test(html), '分享句含六站 / 绳长钩子');
chk(/最后一圈只够圈住自己/.test(html), '分享句有落点');
chk(/你会先放下哪一样/.test(html), '分享句有可转发的问句');

const levels = JSON.parse(html.match(/<script id="levels"[^>]*>([\s\S]*?)<\/script>/)[1]);
chk(levels.length === 6, '六站数据完整');
chk(levels.every(l => l.year && l.rope && l.need && Array.isArray(l.objs)), '每站都有年份 / 绳长 / 要求 / 物件');
chk(levels[levels.length - 1].year === '????' && levels[levels.length - 1].need === 1, '末章只圈一个人');

console.log('\n— 这一轮视觉返工的回归线 —');
chk(/function fitView/.test(html) && /function levelBox/.test(html), '按本关物件包围盒自适应缩放（不再固定 1000×1000 棋盘）');
chk(/MIN_SPAN\s*=\s*360/.test(html), '末章单点也有最小取景范围（不会无限放大）');
chk(/function layout/.test(html) && /const inf = Math\.max/.test(html), '安全区夹在纸边以内，物件圈不压边线');
chk(/drawGrid\(|drawPaperEdge\(/.test(html), '纸面是“整屏一张纸”：方格 + 纸边 + 四角刻线');
chk(!/SPECKS/.test(html), '去掉了满盘碎点（原来像扫描仪故障）');
chk(!/\[150,300,450\]/.test(html), '去掉了物件周围的同心圆');
chk(!/ripples\.push\(\{x:seam/.test(html), '封口不再叠同心涟漪（只留光晕脉冲）');
chk(/function planLabels/.test(html), '标签有排布器：逐个试方向、避让别的标签和物件');
chk(/strokeText\(o\.name/.test(html) && /strokeStyle = 'rgba\(9,7,5/.test(html), '物件名有暗色描边，压在亮线上也读得清');
chk(/600 13px "Songti SC"/.test(html), '物件名用半粗 13px（细宋体在暗底上会发灰）');
chk(/#toast\{[^}]*bottom:/.test(html.replace(/\s+/g,'')) || /#toast\{[^}]*bottom:/.test(html), 'toast 贴底部的固定安全区（不再垂直居中压物件）');
chk(!/#toast\{[^}]*top:50%/.test(html), 'toast 不再垂直居中');
chk(/ropeLeft/.test(html) && /ropeOf/.test(html), '绳长显示为“剩余 / 总长”，不再是一个孤零零的数字');
chk(/剩余绳长/.test(html), '绳长有单位说明');
chk(/function syncNeed/.test(html) && !/封住了 · 圈住/.test(html), '右上角不再重复报“圈住 N 样”');
chk(/还差 <b>/.test(html) && /够了 · 松手封口/.test(html), '画的过程中实时报“还差几样”');
chk(/getView/.test(html), '__game 暴露 getView（截图夹具按真实取景画圈）');

console.log('\n— 这一轮验收的回归线（名字离圈、线穿过字、手机按钮）—');
chk(/const CLEAR = 10/.test(html), '名字离自己的圈有 10px 硬间距（不再只按中心距算）');
chk(/const boxGap = \(b, cx, cy\)/.test(html) && /boxGap\(box, p\.x, p\.y\)/.test(html),
  '排标签时按“盒子到圆心的最近点”量间距（斜着放时中心距不等于离圈边的距离）');
chk(/box\.x \+= ux\*k; box\.y \+= uy\*k; lx \+= ux\*k; ly \+= uy\*k/.test(html),
  '间距不够就沿着候选方向把盒子推出去，推完再判分');
chk(/const g2 = boxGap\(box, q\.x, q\.y\)/.test(html), '名字横穿别人那个圈要按距离重罚');
chk(/ctx\.shadowColor = 'rgba\(7,5,4,\.92\)'; ctx\.shadowBlur = 7;/.test(html),
  '名字描边外再垫一层同色柔光：线圈从字中间穿过时不在笔画之间渗光');
chk(/state === 'left' \? '#d4c9b3'/.test(html), '放手的名字提到 ~4.5:1（原来 #a89d8a×.62 只有 3.3:1）');
chk(/#btnAgain,#btnCopy\{[^}]*min-height:46px/.test(html), '手机结算卡按钮 46px（原来 44px，已经达标，这次多留 2px 余量）');

console.log('\n— 这一轮：时代色 / 水印 / 圈内实时反馈 —');
chk(/const ACCENTS = \['#ffc98a','#ff9e8a','#d5c489','#b9c6d8','#a9d2dc','#cec1ad'\]/.test(html),
  '六站各有时代色（HUD / 绳长 / 纸面光池跟着换）');
chk(/const PAPER_STOPS = \[/.test(html) && (html.match(/#[0-9a-f]{6}/gi) || []).length > 30,
  '纸的温度也分年代：不是六套配色，是同一张纸的六种光');
chk(/function drawWatermark/.test(html) && /G\.idx === LEVELS\.length - 1 \? '牢'/.test(html),
  '每站把章节名淡淡压在纸里（末章一个“牢”字）');
chk(/state === 'in'/.test(html) && /G\.liveIn = liveIn/.test(html),
  '画的过程中圈内物件实时亮起（不再只有右上角数字变）');
chk(/function failAnchor/.test(html) && /G\.failMsgX = anchor\.x/.test(html),
  '失败提示浮在圈外最近的一块空地，不再只贴在屏幕最下面');
chk(/\.scScore \.stat/.test(html) && /id="eOf"/.test(html),
  '结算卡分数改成“数字 / 单位”两行，14 和 12 不再挤成一行');

console.log('\n— 这一轮：原创配乐（现场合成、可静音、不突然出声）—');
chk(/const TEMPO = 60;/.test(html), '本作 60 BPM，四作各有速度');
chk(/const MUSIC_LEVEL = 0\.18;/.test(html), '配乐主输出默认 0.18');
chk(/const LOOKAHEAD = 0\.12;/.test(html), '前瞻排程 0.12s');
chk(/const MOTIF = \[69, 72, 76, 74, 72, 71, 69, 67\];/.test(html),
  '共享动机 A4 C5 E5 D5 C5 B4 A4 G4（A 小调）');
chk(/musicOut\.gain\.linearRampToValueAtTime\(MUSIC_LEVEL, t \+ 1\.2\)/.test(html),
  '进游戏后 1.2s 线性淡入，不突然出声');
chk(/musicTimer = setInterval\(musicTick, 25\)/.test(html) && !/setTimeout\([^)]*note/i.test(html),
  '25ms lookahead 调度，不用逐音符 setTimeout');
chk(/if \(!AC \|\| musicTimer\) return;/.test(html) && /if \(!AC\) return;/.test(html),
  '没有 AudioContext 就不排程（首次加载 / 静音 / 测试桩都不出声）');
chk(/function fadeScene/.test(html) && /now \+ 1\.5/.test(html) && /t0 \+ 1\.5/.test(html),
  '换站 1.5s 交叉淡化（旧场景淡出、新场景淡入）');
chk(/if \(!soundOn\) return;/.test(html) && /lsGet\(SOUND_KEY\) === '0'/.test(html) && /lsSet\(SOUND_KEY/.test(html),
  '静音状态读/写 localStorage，下次打开保持');
chk(/e\.key === 'm'/.test(html) && /els\.snd\.addEventListener\('click'/.test(html),
  'M 键和屏幕按钮都能静音');
chk(/type = 'sine'/.test(html) && /type = 'triangle'/.test(html) &&
  /type = 'sawtooth'/.test(html) && /frequency\.value = 900/.test(html) &&
  /setValueAtTime\(120, t\)/.test(html) && /exponentialRampToValueAtTime\(45, t \+ 0\.17\)/.test(html),
  '钢琴（sine+triangle）/ 弦垫（双 saw+900Hz 低通）/ 鼓（120→45Hz）都是现场合成');
chk(!/<audio|new Audio\(|\.mp3|\.wav|\.ogg/.test(html), '没有任何音频文件 / 音频标签');

console.log(bad === 0 ? '\n=== GUARD PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad ? 1 : 0);
