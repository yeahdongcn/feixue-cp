#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   把 src/ 里的三段脚本内联进 src/shell.html，产出唯一的交付物 index.html
   —— 产物不引用任何外部文件，双击即玩。
   用法：
     node build.js           生成 index.html
     node build.js --check   只比对，过期则退出码 1
   ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
/* 每个元素是一「段」脚本，可以合并多个源文件；产量仍然是 3 段（测试按 3 段校验） */
const PARTS = [['game.js'], ['ui.js', 'music.js'], ['story.js']];
const MARK = '<!--BUILD:SCRIPTS-->';

function render(){
  const shell = fs.readFileSync(path.join(DIR, 'src', 'shell.html'), 'utf8');
  if (!shell.includes(MARK)) throw new Error('shell.html 里找不到 ' + MARK);
  const blocks = PARTS.map(group => {
    const code = group.map(name => {
      const src = fs.readFileSync(path.join(DIR, 'src', name), 'utf8');
      if (/<\/script/i.test(src)) throw new Error(name + ' 里出现了 </script，内联会截断');
      return src.replace(/\s*$/, '');
    }).join('\n\n');
    return '<script>\n/* ───── src/' + group.join(' + ') + ' ───── */\n' + code + '\n</script>';
  }).join('\n');
  const out = shell.replace(MARK, blocks);
  // 产物里不允许再有任何外部资源引用（只看标签，不看脚本正文）
  const markup = out.replace(/<script>[\s\S]*?<\/script>/g, '');
  const bad = markup.match(/(?:src|href)\s*=\s*["'](?!#)[^"']+/gi) || [];
  if (bad.length) throw new Error('产物里还有外部引用：' + bad.join(', '));
  return out;
}

const out = render();
const target = path.join(DIR, 'index.html');

if (process.argv.includes('--check')){
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out){
    console.error('index.html 与 src/ 不一致，请先跑 node build.js');
    process.exit(1);
  }
  console.log('index.html 是最新的 (' + Buffer.byteLength(out) + ' bytes)');
  process.exit(0);
}

fs.writeFileSync(target, out);
const sizes = [];
for (const group of PARTS) for (const name of group) sizes.push(name + ' ' + fs.statSync(path.join(DIR, 'src', name)).size);
console.log('built index.html  ' + Buffer.byteLength(out) + ' bytes  （' + sizes.join(', ') + '）');
