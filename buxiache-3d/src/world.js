/* ══════════════════════════════════════════════════════════════
   《不下车》 · 3D 列车跑酷
   单文件 · three.js · 零外部资源 · 全程序化几何
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* ───────── 常量 ───────── */
const LANE_X   = [-2.50, 0, 2.50];
const ROOF_Y   = 3.42;       // 车顶高度
const CAR_LEN  = 14;         // 单节车厢长
const CAR_GAP  = 0.45;
const CAR_W    = 7.4;
const ERA_LEN  = 190;        // 每个时代的世界长度
const SPAWN_A  = 60;         // 前方多少距离内生成障碍

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot');

/* ───────── 时代调色板 ───────── */
const ERAS = [
  { id:'2006', year:'2006', tag:'夏 · 长沙',
    skyTop:'#241a4a', skyBot:'#ff9a5a', sun:'#ffd9a0', sunI:1.0,
    fog:'#5a3f56', fogN:34, fogF:150,
    amb:'#6b5a7a', ambI:1.05, dir:'#ffcf9a', dirI:1.5,
    ground:'#2a211a', roofC:'#ab7f50', roofC2:'#7d5c39', trim:'#d9b070',
    accent:'#ffb35c', glow:'#ffd28a', weather:'heat', pcol:'#ffd9a0',
    lit:'#ffb35c' },

  { id:'2007', year:'2007', tag:'冬 · 雪',
    skyTop:'#0b1430', skyBot:'#3d5f8f', sun:'#cfe4ff', sunI:0.5,
    fog:'#1d2b45', fogN:26, fogF:120,
    amb:'#4a5f80', ambI:0.95, dir:'#bcd4f0', dirI:1.1,
    ground:'#101825', roofC:'#5f7591', roofC2:'#43536b', trim:'#8fb4d8',
    accent:'#7fb8ff', glow:'#a8d4ff', weather:'snow', pcol:'#dceaff',
    lit:'#6fa8e8' },

  { id:'2014', year:'2014', tag:'春 · 灰',
    skyTop:'#1b1e24', skyBot:'#4d525c', sun:'#9aa0aa', sunI:0.35,
    fog:'#2e3238', fogN:22, fogF:105,
    amb:'#585d66', ambI:1.05, dir:'#b6bec8', dirI:1.25,
    ground:'#14171b', roofC:'#7d8696', roofC2:'#5a616e', trim:'#9aa3b0',
    accent:'#8899aa', glow:'#b8c4d0', weather:'rain', pcol:'#9fb0c4',
    lit:'#7a8899' },

  { id:'2020', year:'2020', tag:'春 · 台上',
    skyTop:'#1a0a28', skyBot:'#6a1f6a', sun:'#ff7ae0', sunI:1.4,
    fog:'#3a1440', fogN:28, fogF:135,
    amb:'#7a3a8a', ambI:1.1, dir:'#ff8ae8', dirI:1.6,
    ground:'#170c20', roofC:'#a84cbc', roofC2:'#7a3488', trim:'#ff9aea',
    accent:'#ff5ad0', glow:'#ff9aea', weather:'dust', pcol:'#ff9aea',
    lit:'#ff5ad0' },

  { id:'2026', year:'2026', tag:'秋 · 站台',
    skyTop:'#04121a', skyBot:'#12485a', sun:'#cffff0', sunI:0.7,
    fog:'#0a2a34', fogN:30, fogF:140,
    amb:'#2a5a6a', ambI:1.0, dir:'#bfeef0', dirI:1.2,
    ground:'#081419', roofC:'#3a7484', roofC2:'#28505c', trim:'#8fe0d8',
    accent:'#5ff0d8', glow:'#a8fff0', weather:'snow', pcol:'#d8fff8',
    lit:'#4fe0d0' },

  { id:'????', year:'????', tag:'画地为牢',
    skyTop:'#050508', skyBot:'#141018', sun:'#ffffff', sunI:0.0,
    fog:'#0a0a10', fogN:18, fogF:95,
    amb:'#3a3540', ambI:0.85, dir:'#d8d0e0', dirI:0.55,
    ground:'#06060a', roofC:'#4a4353', roofC2:'#2e2a3a', trim:'#a89ac0',
    accent:'#c8b8e8', glow:'#e8dcff', weather:'dust', pcol:'#c8b8e8',
    lit:'#9a8ac0' },
];

const C = hex => new THREE.Color(hex);
const shadeC = (hex, k) => { const c = C(hex); c.multiplyScalar(k); return c; };

/* ══════════════════════════════════════════════════════════════
   几何构建器：把所有静态东西合并成极少的 draw call
   ══════════════════════════════════════════════════════════════ */
const UNIT_BOX = new THREE.BoxGeometry(1,1,1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5,0.5,1,7,1,false);
const _m4 = new THREE.Matrix4();
const _q  = new THREE.Quaternion();
const _v3 = new THREE.Vector3();
const _e  = new THREE.Euler();

class Builder{
  constructor(){
    this.pos=[]; this.nor=[]; this.col=[]; this.idx=[]; this.n=0;
  }
  _push(src, mat, color){
    const p = src.attributes.position, nm = src.attributes.normal, ix = src.index;
    const c = C(color);
    const start = this.n;
    const v = new THREE.Vector3();
    for (let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(mat);
      this.pos.push(v.x,v.y,v.z);
      v.fromBufferAttribute(nm,i).transformDirection(mat);
      this.nor.push(v.x,v.y,v.z);
      this.col.push(c.r,c.g,c.b);
    }
    if (ix){ for (let i=0;i<ix.count;i++) this.idx.push(start + ix.getX(i)); }
    else { for (let i=0;i<p.count;i++) this.idx.push(start+i); }
    this.n += p.count;
  }
  box(w,h,d, x,y,z, color, ry){
    _e.set(0, ry||0, 0);
    _q.setFromEuler(_e);
    _m4.compose(new THREE.Vector3(x,y,z), _q, new THREE.Vector3(w,h,d));
    this._push(UNIT_BOX, _m4, color);
    return this;
  }
  // 直接给 4x4 矩阵
  boxm(mat, color){ this._push(UNIT_BOX, mat, color); return this; }
  cyl(r,h, x,y,z, color, ry){
    _e.set(0, ry||0, 0);
    _q.setFromEuler(_e);
    _m4.compose(_v3.set(x,y,z), _q, new THREE.Vector3(r*2, h, r*2));
    this._push(UNIT_CYL, _m4, color);
    return this;
  }
  build(){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos,3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(this.nor,3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(this.col,3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/* ══════════════════════════════════════════════════════════════
   场景 / 渲染器
   ══════════════════════════════════════════════════════════════ */
let renderer, scene, camera, clock;
let skyMat, sunLight, ambLight, hemiLight;
let glows, solids;          // 每个时代两组合并网格
let tapesIM, shardIM;       // 动的东西才用 InstancedMesh
let particles;
let worldGroup;

const G = {
  running:false, over:false, t:0, dist:0, speed:26,
  era:0, tapes:0, hearts:3, hits:0, combo:0, maxCombo:0,
  state:'title', slowmo:0, shake:0, flash:0, tilt:0,
  endPick:null,
};

const player = {
  lane:1, x:0, y:0, vy:0, jumping:false, slide:0, z:0,
  runPhase:0, lean:0, dead:false, model:null,
  limbs:{},
};

/* ── 天空 ── */
function makeSky(){
  const geo = new THREE.SphereGeometry(600, 24, 16);
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{
      uTop:{value:C('#241a4a')}, uBot:{value:C('#ff9a5a')},
      uSun:{value:C('#ffd9a0')}, uSunI:{value:1.0},
      uSunPos:{value:new THREE.Vector3(0,0.18,-1)},
    },
    vertexShader:`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform vec3 uTop, uBot, uSun; uniform float uSunI; uniform vec3 uSunPos;
      varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y*1.15+0.14, 0.0, 1.0);
        vec3 col = mix(uBot, uTop, pow(h, 0.62));
        // 地平线暖光
        float hz = exp(-abs(vDir.y)*7.0);
        col += uSun * hz * 0.42 * uSunI;
        // 太阳/月亮
        float d = max(dot(normalize(vDir), normalize(uSunPos)), 0.0);
        col += uSun * pow(d, 220.0) * 1.6 * uSunI;
        col += uSun * pow(d, 9.0) * 0.16 * uSunI;
        // ShaderMaterial 不参与 three 的输出色彩空间转换，手动编码回 sRGB
        gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(0.4545)), 1.0);
      }`
  });
  const m = new THREE.Mesh(geo, skyMat);
  m.frustumCulled = false;
  m.renderOrder = -100;
  return m;
}

/* ── 粒子（雪/雨/尘/热浪） ── */
let pGeo, pMat, pPos, pVel, pCount = 520;

function makeParticles(){
  pPos = new Float32Array(pCount*3);
  pVel = new Float32Array(pCount*3);
  for (let i=0;i<pCount;i++) resetParticle(i, true);
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  pMat = new THREE.PointsMaterial({
    size:0.14, color:0xffffff, transparent:true, opacity:0.85,
    depthWrite:false, sizeAttenuation:true, blending:THREE.AdditiveBlending
  });
  const pts = new THREE.Points(pGeo, pMat);
  pts.frustumCulled = false;
  return pts;
}
function resetParticle(i, anywhere){
  const z = camera ? camera.position.z + (anywhere ? -90 + Math.random()*120 : -95) : 0;
  pPos[i*3]   = (Math.random()-0.5)*70;
  pPos[i*3+1] = 1 + Math.random()*26;
  pPos[i*3+2] = z;
  pVel[i*3]   = (Math.random()-0.5)*0.6;
  pVel[i*3+1] = -1.5 - Math.random()*2.5;
  pVel[i*3+2] = 0;
}

/* ══════════════════════════════════════════════════════════════
   世界 = 六个时代段，全部预烘焙成合并几何
   ══════════════════════════════════════════════════════════════ */
const obstacles = [];   // {z, lane, kind, w, h, y}
const tapeList  = [];   // {z, lane, y, taken}
const tapeData  = [];
const SCENERY = [];

function buildEra(era, z0){
  const b = new Builder();      // 受光实体
  const g = new Builder();      // 自发光
  const E = ERAS[era];
  const len = ERA_LEN;

  /* ── 车厢 ── */
  const nCar = Math.ceil(len / (CAR_LEN+CAR_GAP));
  for (let i=0;i<nCar;i++){
    const cz = z0 - i*(CAR_LEN+CAR_GAP);
    // 车体
    b.box(CAR_W, 2.9, CAR_LEN, 0, 1.55, cz, E.roofC2);
    // 车顶
    b.box(CAR_W+0.5, 0.22, CAR_LEN+0.4, 0, 3.30, cz, E.roofC);
    b.box(CAR_W+0.2, 0.10, CAR_LEN+0.2, 0, 3.19, cz, shadeC(E.roofC,0.82).getHex());
    // 车顶护栏（两侧）
    b.box(0.12, 0.30, CAR_LEN+0.2, -CAR_W/2-0.20, 3.55, cz, E.trim);
    b.box(0.12, 0.30, CAR_LEN+0.2,  CAR_W/2+0.20, 3.55, cz, E.trim);
    // 车顶导引亮条（两侧 + 中线）
    b.box(0.26, 0.06, CAR_LEN+0.4, -CAR_W/2+0.18, 3.43, cz, E.trim);
    b.box(0.26, 0.06, CAR_LEN+0.4,  CAR_W/2-0.18, 3.43, cz, E.trim);
    b.box(0.12, 0.05, CAR_LEN+0.2, 0, 3.42, cz, shadeC(E.trim,1.15).getHex());
    // 车顶通风口
    for (let k=-1;k<=1;k++) b.box(1.6, 0.26, 2.0, k*1.7, 3.52, cz + 3.5, shadeC(E.roofC,0.7).getHex());
    // 侧面窗带（发光）
    g.box(CAR_W+0.06, 0.95, CAR_LEN-1.4, 0, 2.10, cz, E.lit);
    // 车窗分隔
    for (let k=0;k<6;k++){
      const wz = cz - CAR_LEN/2 + 1.4 + k*2.3;
      b.box(CAR_W+0.10, 1.05, 0.28, 0, 2.10, wz, shadeC(E.roofC2,0.6).getHex());
    }
    // 底部裙板
    b.box(CAR_W-0.3, 0.55, CAR_LEN-0.6, 0, 0.28, cz, shadeC(E.roofC2,0.55).getHex());
    // 转向架
    b.box(2.2, 0.5, 1.6, 0, 0.55, cz - CAR_LEN/2 + 1.6, '#14171c');
    b.box(2.2, 0.5, 1.6, 0, 0.55, cz + CAR_LEN/2 - 1.6, '#14171c');
  }

  /* ── 道旁：地面 ── */
  b.box(90, 0.4, len+40, 0, -0.2, z0 - len/2, E.ground);
  // 轨道
  for (let s=-1;s<=1;s+=2){
    b.box(0.16, 0.16, len+40, s*1.2, 0.06, z0 - len/2, '#3a3d44');
  }
  // 枕木
  for (let i=0;i<len/3;i++){
    const tz = z0 - i*3;
    b.box(4.2, 0.12, 0.5, 0, 0.02, tz, shadeC(E.ground, 0.7).getHex());
  }

  /* ── 道旁场景 ── */
  const prop = (type, z, side, seed) => {
    const s = side; // -1 左, 1 右
    const r = mulberry(seed);
    if (type === 'pole'){
      for (let k=0;k<7;k++){
        const pz = z - k*22;
        b.cyl(0.14, 9.5, s*(8.5), 4.6, pz, shadeC(E.trim,0.55).getHex());
        b.box(3.4, 0.16, 0.16, s*(7.0), 8.6, pz, shadeC(E.trim,0.45).getHex());
        g.box(0.9, 0.16, 0.16, s*(6.2), 8.5, pz, E.glow);   // 灯
        g.box(1.2, 1.2, 1.2, s*(6.2), 8.2, pz, E.glow).box; // 光晕用精灵另做
      }
    } else if (type === 'blocks'){
      // 远处楼群
      for (let k=0;k<6;k++){
        const pz = z - k*26 - r()*8;
        const h = 6 + r()*22;
        const w = 5 + r()*7;
        const d = 5 + r()*7;
        const dist = 16 + r()*20;
        b.box(w, h, d, s*(dist), h/2, pz, shadeC(E.ground, 1.35 + r()*0.5).getHex());
        // 窗户点阵
        const rows = Math.min(9, Math.floor(h/3.0)), cols = Math.min(4, Math.floor(w/2.6));
        for (let ry2=0; ry2<rows; ry2++){
          for (let cx=0; cx<cols; cx++){
            if (r() > 0.62){
              g.box(0.9, 0.9, 0.06, s*(dist) - w/2 + 1.3 + cx*2.6, 2.0 + ry2*3.0, pz + d/2 + 0.05,
                    r() > 0.7 ? E.accent : E.lit);
            }
          }
        }
      }
    } else if (type === 'fence'){
      for (let k=0;k<16;k++){
        const pz = z - k*2.2;
        b.box(0.10, 1.6, 0.10, s*7.6, 0.8, pz, shadeC(E.trim,0.5).getHex());
      }
      b.box(0.08, 0.10, 36, s*7.6, 1.55, z-17, shadeC(E.trim,0.6).getHex());
    } else if (type === 'crowd'){
      for (let k=0;k<26;k++){
        const pz = z - 2 - r()*46;
        const px = s*(9.5 + r()*3.5);
        const hh = 1.35 + r()*0.35;
        const col = ['#2a2434','#332a3e','#241f2c','#3a2f42'][(r()*4)|0];
        b.box(0.55, hh*0.62, 0.45, px, hh*0.31 + 0.9, pz, col);
        b.box(0.42, 0.42, 0.42, px, hh*0.62 + 0.9 + 0.30, pz, col);
        // 举起的灯牌
        if (r() > 0.55){
          g.box(0.75, 0.30, 0.06, px, hh*0.62 + 1.35, pz, E.accent);
        }
      }
    } else if (type === 'sign'){
      for (let k=0;k<4;k++){
        const pz = z - k*40;
        b.box(0.25, 5.0, 0.25, s*8.0, 2.5, pz, shadeC(E.trim,0.5).getHex());
        b.box(3.6, 1.5, 0.2, s*8.0, 4.4, pz, shadeC(E.ground,1.6).getHex());
        g.box(3.2, 1.1, 0.1, s*8.0, 4.4, pz, E.glow);
      }
    } else if (type === 'trees'){
      for (let k=0;k<11;k++){
        const pz = z - k*9 - r()*4;
        const px = s*(11 + r()*10);
        b.cyl(0.16, 2.4, px, 1.2, pz, '#2a2018');
        const hh = 2.6 + r()*2.2;
        b.box(2.2, hh, 2.2, px, 2.4+hh/2, pz, shadeC(E.ground,1.5).getHex());
      }
    } else if (type === 'stage'){
      // 2020 舞台灯架
      for (let k=0;k<3;k++){
        const pz = z - k*55;
        b.box(0.2, 7, 0.2, s*9.5, 3.5, pz, shadeC(E.trim,0.6).getHex());
        b.box(0.2, 7, 0.2, s*11.5, 3.5, pz, shadeC(E.trim,0.6).getHex());
        b.box(0.2, 0.2, 7, s*9.5, 6.8, pz-3.5, shadeC(E.trim,0.6).getHex());
        g.box(0.5, 0.5, 0.5, s*10.5, 6.4, pz-2, E.accent);
      }
    }
  };

  // 每个时代不同的道旁组合
  const layout = {
    '2006': [['crowd',z0-6],['sign',z0-10],['blocks',z0-20],['fence',z0-4]],
    '2007': [['trees',z0-8],['pole',z0-4],['blocks',z0-24],['fence',z0-2],['snowpiles',0]],
    '2014': [['pole',z0-6],['blocks',z0-14],['fence',z0-10],['sign',z0-30]],
    '2020': [['stage',z0-8],['crowd',z0-12],['blocks',z0-26]],
    '2026': [['pole',z0-5],['sign',z0-16],['blocks',z0-20],['fence',z0-8]],
    '????': [['fence',z0-6],['pole',z0-18]],
  }[E.id] || [];

  layout.forEach(([t, z], i) => {
    if (t === 'snowpiles'){
      for (let k=0;k<40;k++){
        const pz = z0 - k*5.5 - Math.random()*3;
        const s = Math.random()<0.5?-1:1;
        b.box(1.8+Math.random()*2.4, 0.5, 2.2, s*(8+Math.random()*1.5), 0.25, pz, '#c8d8ea');
      }
      return;
    }
    prop(t, z, -1, i*17+era*7+1);
    prop(t, z,  1, i*17+era*7+99);
  });

  // 时代招牌：横跨铁轨的拱门
  const gateCol = E.accent;
  b.box(0.5, 7.5, 0.5, -9.5, 3.75, z0-2, shadeC(gateCol,0.7).getHex());
  b.box(0.5, 7.5, 0.5,  9.5, 3.75, z0-2, shadeC(gateCol,0.7).getHex());
  b.box(20, 0.7, 0.7, 0, 7.6, z0-2, shadeC(gateCol,0.8).getHex());
  g.box(9, 0.34, 0.34, 0, 7.4, z0-2.1, E.glow);

  /* ── 道旁剪影 + 站台 ── */
  const sil = SIL[era] || SIL[5];
  const tl = TIMELINE[era] || [];
  const spots = tl.length ? tl.map(t => z0 - t.at*len) : [z0 - len*0.5];
  spots.forEach((sz, si) => {
    const baseX = -8.6;
    // 站台
    b.box(7.4, 0.32, 6.0, baseX, 0.16, sz, shadeC(E.ground, 1.5).getHex());
    b.box(7.4, 0.06, 6.0, baseX, 0.34, sz, shadeC(E.trim, 0.35).getHex());
    if (sil.mode === 4) return;   // 空站台

    const fig = (x, facing, flip) => {
      const col = '#0b0c10';
      b.box(0.52, 1.10, 0.30, x, 0.90, sz, col);
      b.box(0.34, 0.34, 0.34, x, 1.62, sz, col);
      b.box(0.16, 0.16, 0.20, x, 1.66, sz + (facing? 0 : 0.14), col);
      // 轮廓辉光（贴在身后）
      g.box(0.60, 1.20, 0.06, x, 0.90, sz - 0.20, E.glow);
      g.box(0.40, 0.40, 0.06, x, 1.62, sz - 0.20, E.glow);
      // 腿
      b.box(0.18, 0.80, 0.18, x-0.12, 0.40, sz, col);
      b.box(0.18, 0.80, 0.18, x+0.12, 0.40, sz, col);
    };

    if (sil.mode === 2){
      fig(baseX - 1.2, 1);                     // 只剩一个人
    } else {
      fig(baseX - sil.gap/2, sil.mode === 0 ? 1 : 0);
      fig(baseX + sil.gap/2, sil.mode === 3 ? 0 : 1);
    }
  });

  return { solid:b.build(), glow:g.build() };
}

/* 确定性伪随机 */
function mulberry(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ══════════ 时间线：跑过的每一站，都是真的 ══════════ */
/* 道旁剪影：两个人之间的距离，就是那一年她们的距离 */
const SIL = [
  { gap:0.62, mode:0 },   // 2006 并肩
  { gap:3.40, mode:1 },   // 2007 背对
  { gap:0,    mode:2 },   // 2014 只剩一个人
  { gap:4.20, mode:1 },   // 2020 背对，更远
  { gap:1.90, mode:3 },   // 2026 一个先转身
  { gap:0,    mode:4 },   // ???? 空的站台
];

const TIMELINE = [
  [ {at:0.16, y:'2006.6 · 长沙赛区决赛', t:'厉娜是冠军，许飞是季军。她们住同一间宿舍。'},
    {at:0.58, y:'2006.9 · 全国总决赛',   t:'第 5 和第 6。PK 台上她说：于公于私，于情于理。'} ],
  [ {at:0.16, y:'2007.11 · 一个帖子',   t:'三句话，两千一百层楼。没有一句署名。'},
    {at:0.60, y:'2007 末 — 2014 · 空白', t:'近七年，她的行程表是空的。'} ],
  [ {at:0.18, y:'2014 · 她回来了',      t:'小场子，几十个人。没有人解释那七年。'},
    {at:0.62, y:'2014 · 灯牌还在',      t:'有人把 2006 年的灯牌擦干净，带去了现场。'} ],
  [ {at:0.16, y:'2020.4 · 一次重聚',    t:'她在节目里当场质问另一个人。舆论翻车。'},
    {at:0.58, y:'2020.4 · 六个字',      t:'「我们不说别人了，乖。」'} ],
  [ {at:0.12, y:'2026.10 · 后会友期',   t:'18 天列车，四对走散的旧友。播放破 7 亿。'},
    {at:0.44, y:'海拔 4000 米 · 悬崖',   t:'「我是被宣判的人，我能去哪儿啊。我画地为牢。」'},
    {at:0.78, y:'2026 · 系鞋带',        t:'她蹲下去系了四次。鞋带，一次都没有松。'} ],
  [ {at:0.30, y:'收官 · 下车环节',      t:'两个人都没有下车。'} ],
];

function genEntities(){
  obstacles.length = 0; tapeData.length = 0;
  for (let e=0;e<6;e++){
    const z0 = -e*ERA_LEN;
    const rnd = mulberry(9001 + e*131);
    let z = z0 - 26;
    let guard = 0;
    while (z > z0 - ERA_LEN + 18 && guard++ < 200){
      const r = rnd();
      if (r < 0.26){
        // 三闸：全横栏 -> 跳
        for (let l=0;l<3;l++) obstacles.push({ kind:'barrier', lane:l, z, hit:false });
      } else if (r < 0.46){
        // 三闸：横梁 -> 滑
        for (let l=0;l<3;l++) obstacles.push({ kind:'gate', lane:l, z, hit:false });
      } else if (r < 0.70){
        const l = (rnd()*3)|0;
        obstacles.push({ kind:'block', lane:l, z, hit:false });
      } else if (r < 0.88){
        const l = (rnd()*3)|0;
        const l2 = (l + 1 + ((rnd()*2)|0)) % 3;
        obstacles.push({ kind:'block', lane:l, z, hit:false });
        obstacles.push({ kind:'barrier', lane:l2, z, hit:false });
      } else {
        const l = (rnd()*3)|0;
        obstacles.push({ kind:'barrier', lane:l, z, hit:false });
      }
      z -= 15 + rnd()*9;
    }
    // 磁带
    let tz = z0 - 24;
    for (let i=0;i<5;i++){
      tapeData.push({ lane:(rnd()*3)|0, z: tz, y: 1.15 + rnd()*0.9, taken:false, spin: rnd()*6.28 });
      tz -= 30 + rnd()*8;
    }
  }
  obstacles.sort((a,b)=> b.z - a.z);   // 从远到近（z 递减）
}
