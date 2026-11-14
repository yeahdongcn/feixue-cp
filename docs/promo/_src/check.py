#!/usr/bin/env python3
"""分享卡的出厂体检
   python3 check.py
   1) 尺寸：宽必须是 1080（交付要求），高度按版式
   2) 二维码：每一张都要能扫出 https://yeahdongcn.github.io/feixue-cp/
   3) 边距：任何文字/图片距画布边不得小于 64px，目标 88px
   4) 缩略图：540 / 270 两档，用来模拟信息流里的实际显示宽度
"""
import json, os, glob
import cv2, numpy as np
from PIL import Image

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, '..', 'share-cards')
PREV = os.path.join(SRC, 'preview')
URL = 'https://yeahdongcn.github.io/feixue-cp/'

os.makedirs(PREV, exist_ok=True)
probe = json.load(open(os.path.join(SRC, 'probe.json')))
files = sorted(glob.glob(os.path.join(OUT, '*.png')))
ok = True

for f in files:
    im = Image.open(f)
    w, h = im.size
    line = [f"{os.path.basename(f)}  {w}x{h}  {os.path.getsize(f)/1024:.0f}KB"]
    if w != 1080:
        line.append(f'✗ 宽度不是 1080'); ok = False
    else:
        line.append('✓ 宽度 1080')

    # 二维码
    gray = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    txt, _, _ = cv2.QRCodeDetector().detectAndDecode(gray)
    if txt != URL:
        line.append(f'✗ 二维码 {txt!r}'); ok = False
    else:
        line.append('✓ 二维码可扫')

    # 缩略图
    for tw in (540, 270):
        th = round(h * tw / w)
        im.resize((tw, th), Image.LANCZOS).save(
            os.path.join(PREV, f"{os.path.splitext(os.path.basename(f))[0]}@{tw}.png"))
    print('  '.join(line))

# 版式探针
print('\n版式（探针）：')
for k, v in probe.items():
    items = v['items']
    if not items:
        continue
    edge = min(min(i['x'], i['y'], v['vw'] - i['x'] - i['w'], v['vh'] - i['y'] - i['h']) for i in items)
    small = [i for i in items if i['fs'] < 14 and not i['cls'] in ('k', 'tag', 'sig')]
    print(f"  {k:7} 元素 {len(items):3}  最小边距 {edge:6.1f}px  最小字号 {min(i['fs'] for i in items):.0f}px"
          f"  {'✓' if edge >= 64 and not v['problems'] else '✗ ' + '; '.join(v['problems'])}")
    if edge < 88:
        print(f"          ↑ 边距低于 88px 目标，复核是否压边")
    if small:
        print(f"          小字：{[ (s['text'], s['fs']) for s in small ]}")

print('\n结果：', '全部通过' if ok else '有问题')
