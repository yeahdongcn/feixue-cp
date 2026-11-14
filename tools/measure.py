#!/usr/bin/env python3
"""对截图做区域测量：亮度分布、对比度、主体占比。用法: measure.py a.png [b.png ...]"""
import sys
from PIL import Image, ImageStat

def stats(f):
    im = Image.open(f).convert('RGB'); w,h = im.size
    px = im.load()
    def region(x0,y0,x1,y1):
        xs=range(int(x0*w),int(x1*w)); ys=range(int(y0*h),int(y1*h))
        tot=[0,0,0]; n=0; dark=0; bright=0
        for y in ys:
            for x in xs:
                r,g,b = px[x,y]; tot[0]+=r; tot[1]+=g; tot[2]+=b; n+=1
                l=(r+g+b)/3
                if l<26: dark+=1
                if l>200: bright+=1
        return tuple(t//n for t in tot), dark/n, bright/n
    rows=[]
    for name,(x0,y0,x1,y1) in {
        '全屏':(0,0,1,1),'上':(0,0,1,.33),'中':(0,.33,1,.66),'下':(0,.66,1,1),
        '中心':(.3,.3,.7,.7),'左':(0,.3,.25,.7),'右':(.75,.3,1,.7)}.items():
        m,d,br = region(x0,y0,x1,y1)
        rows.append((name,m,d,br))
    print(f"\n{f}  {w}x{h}")
    for name,m,d,br in rows:
        print(f"  {name:4s} 平均RGB={m}  近黑={d*100:4.0f}%  高亮={br*100:4.1f}%")
    return rows

if __name__=='__main__':
    for f in sys.argv[1:]: stats(f)
