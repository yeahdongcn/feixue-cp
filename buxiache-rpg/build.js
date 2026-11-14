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
const PARTS = ['game.js', 'ui.js', 'story.js'];
const MARK = '<!--BUILD:SCRIPTS-->';

function render(){
  const shell = fs.readFileSync(path.join(DIR, 'src', 'shell.html'), 'utf8');
  if (!shell.includes(MARK)) throw new Error('shell.html 里找不到 ' + MARK);
  const blocks = PARTS.map(name => {
    const code = fs.readFileSync(path.join(DIR, 'src', name), 'utf8');
    if (/<\/script/i.test(code)) throw new Error(name + ' 里出现了 </script，内联会截断');
    return '<script>\n/* ───── src/' + name + ' ───── */\n' + code.replace(/\s*$/, '') + '\n</script>';
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
console.log('built index.html  ' + Buffer.byteLength(out) + ' bytes  （' +
  PARTS.map(p => p + ' ' + fs.statSync(path.join(DIR, 'src', p)).size).join(', ') + '）');
