/* 软件光栅器：把真实几何 + 真实相机矩阵渲成 PPM，用于构图/配色验证
   用法: node test/render.js [eraIndex] [outfile] [W] [H] [aspect]      */
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const sb={console,Math,JSON,Array,Object,String,Number,Boolean,Date,RegExp,Set,Map,Float32Array,Uint8Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer,isNaN,parseFloat,parseInt};
sb.window=sb;sb.self=sb;sb.globalThis=sb;sb.location={search:''};
sb.URLSearchParams=class{get(){return null}};
const ctx=vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor-three.min.js'),'utf8'),ctx,{filename:'three'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'src/world.js'),'utf8'),ctx,{filename:'world'});
const THREE=ctx.THREE;
const ERAS=vm.runInContext('ERAS',ctx);
const buildEra=vm.runInContext('buildEra',ctx);

const era = parseInt(process.argv[2]||'0',10);
const out = process.argv[3] || `/home/xiaodongye/shot_era${era}.ppm`;
const W   = parseInt(process.argv[4]||'480',10);
const H   = parseInt(process.argv[5]||'270',10);
const ASPECT = parseFloat(process.argv[6]||'0');
const ROOF_Y=3.42;

/* ── 相机（与 game.js 一致）── */
const aspect = ASPECT || (W/H);
const back   = 6.4 + (aspect<1 ? (1-aspect)*2.4 : 0);
const up     = 2.70;
const ldy    = 1.00;
const portBoost = aspect<1 ? (1+(1-aspect)*0.18) : 1;
const fov    = 58 * portBoost;

const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 320);
const playerZ = -era*190 - 40;      // 时代内 40m 处（世界 z 向负方向延伸）
cam.position.set(0, ROOF_Y+up, playerZ+back);
cam.lookAt(0, ROOF_Y+ldy, playerZ-15);
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();

const E = ERAS[era];
const fogNear = E.fogN, fogFar = E.fogF;
const fogCol = new THREE.Color(E.fog);
const skyTop = new THREE.Color(E.skyTop), skyBot = new THREE.Color(E.skyBot);
const ambC = new THREE.Color(E.amb).multiplyScalar(E.ambI*0.55);
const dirC = new THREE.Color(E.dir).multiplyScalar(E.dirI);
const Ldir = new THREE.Vector3(-6,12,4).normalize();

/* ── 收集几何 ── */
const tri=[];
function addGeo(g, emissive){
  const pos=g.attributes.position.array, nor=g.attributes.normal.array, col=g.attributes.color.array, ix=g.index.array;
  for(let i=0;i<ix.length;i+=3){
    const a=ix[i],b=ix[i+1],c=ix[i+2];
    tri.push({a:[pos[a*3],pos[a*3+1],pos[a*3+2]], b:[pos[b*3],pos[b*3+1],pos[b*3+2]], c:[pos[c*3],pos[c*3+1],pos[c*3+2]],
      n:[nor[a*3],nor[a*3+1],nor[a*3+2]], col:[col[a*3],col[a*3+1],col[a*3+2]], em:emissive});
  }
}
// 本时代 + 前一个时代的尾巴（跑进来的风景）
for (const e of [era]){
  const {solid, glow} = buildEra(e, -e*190);
  addGeo(solid, false); addGeo(glow, true);
}
console.log('triangles:', tri.length);

/* ── 光栅化 ── */
const zbuf=new Float32Array(W*H).fill(1e9);
const ybuf=new Float32Array(W*H).fill(-1e9);
const img =new Float32Array(W*H*3);
// 天空
for(let y=0;y<H;y++){
  const t=1-y/(H-1);
  const k=Math.pow(Math.max(0,Math.min(1,t*1.15+0.14)),0.62);
  const c=[skyBot.r+(skyTop.r-skyBot.r)*k, skyBot.g+(skyTop.g-skyBot.g)*k, skyBot.b+(skyTop.b-skyBot.b)*k];
  for(let x=0;x<W;x++){ const i=(y*W+x)*3; img[i]=c[0];img[i+1]=c[1];img[i+2]=c[2]; }
}

const vp=new THREE.Vector3();
function toScreen(p){
  vp.set(p[0],p[1],p[2]).applyMatrix4(cam.matrixWorldInverse);
  const vz=vp.z;
  vp.applyMatrix4(cam.projectionMatrix);
  return [ (vp.x*0.5+0.5)*W, (1-(vp.y*0.5+0.5))*H, -vz ];
}

let drawn=0;
for(const t of tri){
  const A=toScreen(t.a), B=toScreen(t.b), C=toScreen(t.c);
  if(A[2]<=0.2||B[2]<=0.2||C[2]<=0.2) continue;
  const minx=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))), maxx=Math.min(W-1,Math.ceil(Math.max(A[0],B[0],C[0])));
  const miny=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))), maxy=Math.min(H-1,Math.ceil(Math.max(A[1],B[1],C[1])));
  if(maxx<minx||maxy<miny) continue;
  const area=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
  if(Math.abs(area)<1e-9) continue;
  // 不做背面剔除，交给 z-buffer
  const shade = t.em ? 1.0 : Math.max(0.12, (t.n[0]*Ldir.x+t.n[1]*Ldir.y+t.n[2]*Ldir.z));
  for(let y=miny;y<=maxy;y++){
    for(let x=minx;x<=maxx;x++){
      const px=x+0.5, py=y+0.5;
      const w0=((B[0]-A[0])*(py-A[1])-(B[1]-A[1])*(px-A[0]))/area;
      const w1=((C[0]-B[0])*(py-B[1])-(C[1]-B[1])*(px-B[0]))/area;
      const w2=((A[0]-C[0])*(py-C[1])-(A[1]-C[1])*(px-C[0]))/area;
      if(w0<0||w1<0||w2<0) continue;
      const z=A[2]*w1+B[2]*w2+C[2]*w0;
      const idx=y*W+x;
      if(z>=zbuf[idx]) continue;
      zbuf[idx]=z;
      ybuf[idx]=t.a[1]*w1+t.b[1]*w2+t.c[1]*w0;
      let r,g,b;
      if(t.em){ r=t.col[0]*0.9; g=t.col[1]*0.9; b=t.col[2]*0.9; }
      else {
        r=t.col[0]*(ambC.r+dirC.r*shade);
        g=t.col[1]*(ambC.g+dirC.g*shade);
        b=t.col[2]*(ambC.b+dirC.b*shade);
      }
      // 雾
      const f=Math.max(0,Math.min(1,(z-fogNear)/(fogFar-fogNear)));
      const ff=f*f;
      r=r+(fogCol.r-r)*ff; g=g+(fogCol.g-g)*ff; b=b+(fogCol.b-b)*ff;
      const i3=idx*3; img[i3]=r; img[i3+1]=g; img[i3+2]=b;
    }
  }
  drawn++;
}
console.log('drawn triangles:', drawn);

/* ── ACES 近似 + gamma，写 PPM ── */
const aces=x=>{ const a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return Math.max(0,Math.min(1,(x*(a*x+b))/(x*(c*x+d)+e))); };
const buf=Buffer.alloc(W*H*3);
let sum=[0,0,0], bright=0;
for(let i=0;i<W*H;i++){
  for(let k=0;k<3;k++){
    let v=img[i*3+k]*1.12;
    v=aces(v);
    v=Math.pow(Math.max(0,v),1/2.2)*255;
    buf[i*3+k]=Math.round(Math.max(0,Math.min(255,v)));
    sum[k]+=buf[i*3+k];
  }
  if((buf[i*3]+buf[i*3+1]+buf[i*3+2])/3>40) bright++;
}
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
console.log('wrote', out);
console.log('mean rgb', sum.map(v=>Math.round(v/(W*H))).join(','), ' bright%', (bright/(W*H)*100).toFixed(1));
// 分区亮度
const regions={sky:[0,0,W,Math.floor(H*0.35)],mid:[0,Math.floor(H*0.35),W,Math.floor(H*0.65)],ground:[0,Math.floor(H*0.65),W,H]};
for(const [k,[x0,y0,x1,y1]] of Object.entries(regions)){
  let s=0,n=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*W+x)*3;s+=(buf[i]+buf[i+1]+buf[i+2])/3;n++;}
  console.log(' ',k,'mean',(s/n).toFixed(1));
}

/* ── ASCII 预览：把画面降采样成字符画，供无图形环境下"看"构图 ── */
const AW = parseInt(process.env.AW||'100',10), AH = Math.round(AW*H/W*0.5);
const ramp = ' .:-=+*#%@';
let art='';
for(let ay=0;ay<AH;ay++){
  let line='';
  for(let ax=0;ax<AW;ax++){
    const x0=Math.floor(ax*W/AW), x1=Math.max(x0+1,Math.floor((ax+1)*W/AW));
    const y0=Math.floor(ay*H/AH), y1=Math.max(y0+1,Math.floor((ay+1)*H/AH));
    let s=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*W+x)*3;s+=(buf[i]+buf[i+1]+buf[i+2])/3;n++;}
    const v=s/n;
    line += ramp[Math.min(ramp.length-1, Math.floor(v/256*ramp.length))];
  }
  art += line+'\n';
}
console.log('\n'+art);

/* ── 深度图预览：确认物体是否在正确的位置与尺度 ── */
if (process.env.MODE==='height'){
  let artH='';
  for(let ay=0;ay<AH;ay++){
    let line='';
    for(let ax=0;ax<AW;ax++){
      const x=Math.floor((ax+0.5)*W/AW), y=Math.floor((ay+0.5)*H/AH);
      const wy=ybuf[y*W+x];
      if(wy<-1e8){ line+=' '; continue; }
      // 0=地面, 3.4=车顶, >6=建筑
      const t=Math.max(0,Math.min(1, wy/14));
      line += '.:-=+*#%@'[Math.min(8,Math.floor(t*9))];
    }
    artH+=line+'\n';
  }
  console.log('\n--- HEIGHT (0=. 3.4=+ 6+ =* # ; 空格=天空) ---\n'+artH);
}
if (process.env.MODE==='depth'){
  let art2='';
  const near=1, far=90;
  for(let ay=0;ay<AH;ay++){
    let line='';
    for(let ax=0;ax<AW;ax++){
      const x=Math.floor((ax+0.5)*W/AW), y=Math.floor((ay+0.5)*H/AH);
      const z=zbuf[y*W+x];
      if(z>1e8){ line+=' '; continue; }
      const t=Math.max(0,Math.min(1,(z-near)/(far-near)));
      const ramp2='@%#*+=-:. ';
      line += ramp2[Math.min(9,Math.floor(t*10))];
    }
    art2+=line+'\n';
  }
  console.log('\n--- DEPTH (@=near) ---\n'+art2);
}

/* ── 对比度检查：路（中间）vs 道旁（两边） ── */
function meanLum(x0,x1,y0,y1){
  let s=0,n=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*W+x)*3;s+=(buf[i]+buf[i+1]+buf[i+2])/3;n++;}
  return s/n;
}
const ry0=Math.floor(H*0.62), ry1=Math.floor(H*0.92);
const road=meanLum(Math.floor(W*0.40),Math.floor(W*0.60),ry0,ry1);
const side=meanLum(Math.floor(W*0.06),Math.floor(W*0.20),ry0,ry1);
console.log(`对比度: 路面=${road.toFixed(1)} 道旁=${side.toFixed(1)} 差=${(road-side).toFixed(1)}`);
if(process.env.CHECK==='1'){
  const ok = (road-side) > 12;
  console.log(ok? '  ✓ 路面与道旁可区分' : '  ✗ 路面与道旁对比不足');
  process.exit(ok?0:1);
}

/* ── 按世界高度分类的亮度对比（避开天空干扰） ── */
{
  let roofS=0,roofN=0,grS=0,grN=0,skyN=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x, wy=ybuf[i], z=zbuf[i];
    const lum=(buf[i*3]+buf[i*3+1]+buf[i*3+2])/3;
    if(z>1e8){ skyN++; continue; }
    if(wy>3.0&&wy<3.9){ roofS+=lum; roofN++; }
    else if(wy>-0.3&&wy<0.6){ grS+=lum; grN++; }
  }
  const roof=roofN?roofS/roofN:0, gr=grN?grS/grN:0;
  console.log(`高度分类: 车顶像素=${roofN} 亮度=${roof.toFixed(1)} | 地面像素=${grN} 亮度=${gr.toFixed(1)} | 天空像素=${skyN}`);
  if(process.env.CHECK==='1'){
    const ok = roof > gr*1.5 && roof > 40;
    console.log(ok?'  ✓ 车顶明显亮于地面（路径清晰）':'  ✗ 车顶与地面区分不足');
    process.exit(ok?0:1);
  }
}
