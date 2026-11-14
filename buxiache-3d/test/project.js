/* 相机 / 构图验收：用真实投影矩阵量「两个剪影」和玩家在画面里的位置
   （不需要 WebGL；世界几何直接来自 src/world.js） */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sb = { console, Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Set, Map,
  Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer };
sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.location = { search:'' };
sb.URLSearchParams = class { get(){ return null; } };
const ctx = vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor-three.min.js'),'utf8'), ctx, {filename:'three'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'src/world.js'),'utf8'), ctx, {filename:'world'});

const THREE = ctx.THREE;
const ROOF_Y = 3.42;
const LANE_X = [-2.5, 0, 2.5];
const PAIR_AHEAD = vm.runInContext('PAIR_AHEAD', ctx);
const PAIR_ERA = vm.runInContext('PAIR_ERA', ctx);

const FOV0 = 58, BACK = 6.4, UP = 2.70, LDY = 1.00, LOOK = 15;

function makeCam(aspect){
  const portBoost = aspect < 1 ? (1 + (1-aspect)*0.18) : 1;
  const back = BACK + (aspect < 1 ? (1-aspect)*2.4 : 0);
  const cam = new THREE.PerspectiveCamera(FOV0*portBoost, aspect, 0.1, 320);
  cam.position.set(0, ROOF_Y+UP, back);
  cam.lookAt(0, ROOF_Y+LDY, back-LOOK);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return { cam, back, fov:FOV0*portBoost };
}
function P(cam, x,y,z){ const v = new THREE.Vector3(x,y,z).project(cam); return { x:v.x, y:(1-v.y)/2 }; }
function f0(cam, xs){
  return xs.map(x=> P(cam, x, ROOF_Y, -PAIR_AHEAD).x.toFixed(2)).join(' / ');
}

let bad = 0;
const chk = (c,msg)=>{ console.log((c?'  ✓ ':'  ✗ ')+msg); if(!c) bad++; };

for (const [label, aspect, W, H] of [['横屏 1280×800', 1.6, 1280, 800], ['竖屏 390×844', 390/844, 390, 844]]){
  const { cam, back, fov } = makeCam(aspect);
  console.log(`\n— ${label}  fov=${fov.toFixed(1)}°  camBack=${back.toFixed(2)}m —`);

  // 1. 轨道边缘
  let edgeOk = true, minX = 9, maxX = -9;
  for (const s of [-1,1]) for (const dz of [-15,-25,-40]){
    const p = P(cam, s*3.4, ROOF_Y, dz);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    if (Math.abs(p.x) > 1) edgeOk = false;
  }
  chk(edgeOk, `前方 15/25/40m 的车顶边缘都在画面内（ndc x ${minX.toFixed(2)}..${maxX.toFixed(2)}）`);

  // 2. 玩家
  const feet = P(cam, 0, ROOF_Y, 0);
  const chest = P(cam, 0, ROOF_Y+0.9, 0);
  const head = P(cam, 0, ROOF_Y+1.7, 0);
  chk(feet.y > 0.62 && feet.y < 0.92, `玩家脚在画面下部（y=${feet.y.toFixed(2)}）`);
  chk(head.y > 0.48 && head.y < 0.75, `玩家头在画面中部偏下（y=${head.y.toFixed(2)}）`);
  chk(feet.y - head.y > 0.08, `玩家够大（占屏高 ${((feet.y-head.y)*H).toFixed(0)}px）`);

  // 3. 「同框」的两个人：每个时代都要在画面里、在玩家上方、且看得见
  PAIR_ERA.forEach((cfg, e)=>{
    if (cfg.mode === 'none') return;
    const gap = cfg.mode === 'one' ? 0 : cfg.gap;
    // 最坏情况：中点被推到边上（lane 2，k 由间距决定）
    const k = Math.max(0, 1 - gap/4.2);
    const cx = LANE_X[2] * k;
    const xs = cfg.mode === 'one' ? [cx] : [cx - gap/2, cx + gap/2];
    let okIn = true, okAbove = true, minH = 9;
    xs.forEach(x=>{
      const f = P(cam, x, ROOF_Y, -PAIR_AHEAD);
      const h = P(cam, x, ROOF_Y+1.8, -PAIR_AHEAD);
      if (Math.abs(f.x) > 0.86) okIn = false;
      if (f.y >= head.y) okAbove = false;
      minH = Math.min(minH, Math.abs(f.y-h.y));
    });
    chk(okIn && okAbove, `era${e} 剪影${xs.length}人在框内、在玩家上方（x=${f0(cam,xs)}）`);
    chk(minH*H > 42, `era${e} 剪影高度 ${(minH*H).toFixed(0)}px > 42px`);
  });

  // 4. 两个剪影的屏幕间距随 gap 变化（玩家能看见「分开」这件事）
  const sepScreen = (gap)=>{
    const a = P(cam, -gap/2, ROOF_Y+0.9, -PAIR_AHEAD);
    const b = P(cam,  gap/2, ROOF_Y+0.9, -PAIR_AHEAD);
    return Math.abs(a.x-b.x) * W / 2;
  };
  const s1 = sepScreen(1.0), s2 = sepScreen(4.4);
  chk(s2 > s1 + 60, `间距 1.0m→4.4m 在屏幕上差 ${(s2-s1).toFixed(0)}px（${s1.toFixed(0)}→${s2.toFixed(0)}）`);

  // 5. 前方 15m 的三条道都在画里，玩家看得见要躲什么
  let laneOk = true;
  for (const lx of LANE_X) for (const dz of [-12,-20,-30]){
    const p = P(cam, lx, ROOF_Y+0.8, dz);
    if (Math.abs(p.x) > 0.98 || p.y < 0.30 || p.y > 0.90) laneOk = false;
  }
  chk(laneOk, '前方 12/20/30m 的三条道都在取景范围内');
}

console.log(bad===0 ? '\n=== PROJECT PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
