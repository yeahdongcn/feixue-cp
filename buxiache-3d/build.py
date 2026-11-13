#!/usr/bin/env python3
"""把 src 打成一个自包含的 index.html（three.js 内联，零外部请求）"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC  = ROOT / 'src'

html = (ROOT / 'index.html').read_text(encoding='utf-8')

def inline(path):
    code = path.read_text(encoding='utf-8')
    # 防止 </script> 提前闭合
    code = code.replace('</script>', '<\\/script>')
    return '<script>\n' + code + '\n</script>'

parts = [
    inline(ROOT / 'vendor-three.min.js'),
    inline(SRC / 'world.js'),
    inline(SRC / 'game.js'),
]

for tag in ['<script src="vendor-three.min.js"></script>',
            '<script src="src/world.js"></script>',
            '<script src="src/game.js"></script>']:
    assert tag in html, tag

blob = '\n'.join(parts)
html = html.replace('<script src="vendor-three.min.js"></script>', blob, 1)
html = html.replace('<script src="src/world.js"></script>', '', 1)
html = html.replace('<script src="src/game.js"></script>', '', 1)

out = ROOT / 'dist' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')

raw = len(html.encode('utf-8'))
import gzip
gz = len(gzip.compress(html.encode('utf-8'), 9))
print(f'built {out}  raw={raw/1024:.1f}KB  gzip={gz/1024:.1f}KB  ratio={gz/raw*100:.0f}%')
