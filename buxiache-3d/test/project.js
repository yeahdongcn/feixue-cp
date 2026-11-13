/* 相机参数扫描：用真实投影矩阵选构图（不需要 WebGL） */
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const sb={console,Math,JSON,Array,Object,String,Number,Boolean,Date,RegExp,Set,Map,Float32Array,Uint8Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer};
sb.window=sb;sb.self=sb;sb.globalThis=sb;sb.location={search:''};
sb.URLSearchParams=class{get(){return null}};
const ctx=vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor-three.min.js'),'utf8'),ctx,{filename:'three'});
const THREE=ctx.THREE;
const ROOF_Y=3.42, HALF=3.2;

function measure(aspect, back, up, ldy, fov){
  const cam=new THREE.PerspectiveCamera(fov,aspect,0.1,320);
  cam.position.set(0, ROOF_Y+up, back);
  cam.lookAt(0, ROOF_Y+ldy, back-15);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const p=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(cam);return [v.x,v.y];};
  const L15=p(-HALF,ROOF_Y,-15), R15=p(HALF,ROOF_Y,-15);
  const L8 =p(-HALF,ROOF_Y,-8),  R8 =p(HALF,ROOF_Y,-8);
  return {
    w15:R15[0]-L15[0], w8:R8[0]-L8[0],
    playerY:p(0,ROOF_Y+0.85,0)[1],
    playerX:Math.abs(p(0,ROOF_Y+0.85,0)[0]),
    horizonY:p(0,ROOF_Y,-300)[1],
    edgeOk:Math.abs(L15[0])<1&&Math.abs(R15[0])<1,
    tapeY:p(0,ROOF_Y+1.5,-15)[1],
    skyVisible: p(0,ROOF_Y,-300)[1] < 0.92,
  };
}

const cands=[];
for (const fov of [50,54,58,62,66])
 for (const back of [5.5,6.0,6.5,7.0,7.8,8.6])
  for (const up of [2.0,2.4,2.8,3.2,3.6])
   for (const ldy of [0.4,0.8,1.2,1.6,2.0]){
     const m=measure(16/9, back, up, ldy, fov);
     if(!m.edgeOk) continue;
     if(m.horizonY < 0.12 || m.horizonY > 0.46) continue;
     if(m.playerY < -0.62 || m.playerY > -0.30) continue;
     cands.push({fov,back,up,ldy,m});
   }
cands.sort((a,b)=> b.m.w15 - a.m.w15);
console.log('满足构图约束的方案数:', cands.length);
const top=cands.slice(0,3);
top.forEach(c=>console.log(` fov=${c.fov} back=${c.back} up=${c.up} ldy=${c.ldy}  w15=${c.m.w15.toFixed(3)} w8=${c.m.w8.toFixed(3)} playerY=${c.m.playerY.toFixed(3)} horizon=${c.m.horizonY.toFixed(3)}`));

const B=top[0];
if(!B){ console.log('没有可行解'); process.exit(1); }
const port=measure(390/844, B.back+2.2, B.up, B.ldy, B.fov*1.18);
console.log('\n竖屏:', JSON.stringify(port,null,1));

let bad=0;
const chk=(c,msg)=>{ console.log((c?'  ✓ ':'  ✗ ')+msg); if(!c) bad++; };
console.log('\n--- 验收 ---');
chk(B.m.w15>0.40,'横屏 15m 车厢占屏宽 '+B.m.w15.toFixed(2));
chk(B.m.playerY>-0.62&&B.m.playerY<-0.30,'角色高度 '+B.m.playerY.toFixed(2));
chk(B.m.horizonY>0.12&&B.m.horizonY<0.46,'地平线 '+B.m.horizonY.toFixed(2));
chk(port.edgeOk,'竖屏轨道边缘在画面内');
chk(port.w15>0.5&&port.w15<1.0,'竖屏 15m 占屏宽 '+port.w15.toFixed(2));
console.log(bad===0?'\n=== PROJECT PASS ===':`\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
