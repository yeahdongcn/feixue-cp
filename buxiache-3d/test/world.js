/* 世界构建器自检：在 node 里跑真实 three.js（不需要 WebGL） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sandbox = { console, Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Set, Map,
                  Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, isNaN, parseFloat, parseInt };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
sandbox.location = { search:'' };
sandbox.URLSearchParams = class { get(){ return null; } };
const ctx = vm.createContext(sandbox);

for (const f of ['vendor-three.min.js', 'src/world.js']){
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f});
}
const G = n => vm.runInContext(n, ctx);

const THREE = ctx.THREE;
console.log('three revision:', THREE.REVISION);

let fail = 0;
function check(cond, msg){ if(!cond){ console.log('  ✗', msg); fail++; } else console.log('  ✓', msg); }

function scanGeo(g, label){
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  const c = g.attributes.color.array;
  let nan = 0, inf = 0;
  const scan = arr => { for (let i=0;i<arr.length;i++){ if (Number.isNaN(arr[i])) nan++; else if (!Number.isFinite(arr[i])) inf++; } };
  scan(p); scan(n); scan(c);
  check(nan === 0, `${label}: 无 NaN (${p.length/3} verts)`);
  check(inf === 0, `${label}: 无 Infinity`);
  check(g.index && g.index.count % 3 === 0, `${label}: 索引是三角形 (${g.index?g.index.count/3:0} tris)`);
  // 法线是否归一化
  let badN = 0;
  for (let i=0;i<n.length;i+=3){
    const L = Math.hypot(n[i],n[i+1],n[i+2]);
    if (Math.abs(L-1) > 0.02) badN++;
  }
  check(badN === 0, `${label}: 法线归一化 (异常 ${badN})`);
  return { tris: g.index.count/3, verts: p.length/3 };
}

let totalTris = 0, totalVerts = 0;
for (let e=0;e<6;e++){
  const era = G('ERAS')[e];
  const { solid, glow } = ctx.buildEra(e, -e*190);
  console.log(`\n[${era.id}] ${era.tag}`);
  const a = scanGeo(solid, 'solid');
  const b = scanGeo(glow, 'glow');
  totalTris += a.tris + b.tris;
  totalVerts += a.verts + b.verts;
  console.log(`   tris=${a.tris + b.tris}  verts=${a.verts + b.verts}`);
}

console.log(`\n合计 tris=${totalTris}  verts=${totalVerts}  draw calls ≈ 6 eras × 2 = 12 (+实体)`);
check(totalTris < 220000, `三角面预算 < 220k (实得 ${totalTris})`);

// 障碍生成
ctx.genEntities();
const obs = Array.from(G('obstacles'));
const tapes = Array.from(G('tapeData'));
console.log('\nobstacles:', obs.length, ' tapes:', tapes.length);
check(tapes.length >= 24, `磁带数量合理 (${tapes.length})`);
const byKind = {};
obs.forEach(o=> byKind[o.kind]=(byKind[o.kind]||0)+1);
console.log(byKind);
check(obs.length > 100, `障碍数量合理 (${obs.length})`);
// 每处必须有安全车道
const groups = {};
obs.forEach(o=>{ (groups[o.z] = groups[o.z]||[]).push(o); });
let unsafe = 0;
Object.values(groups).forEach(gs=>{
  const lanes = new Set(gs.filter(g=>g.kind==='block').map(g=>g.lane));
  if (lanes.size >= 3) unsafe++;
});
check(unsafe === 0, `没有三车道全封的死局 (${unsafe})`);

// 同框机制：每个时代的形态/间距必须合法
const PE = G('PAIR_ERA');
check(PE.length === 6, 'PAIR_ERA 覆盖 6 个时代');
check(PE.filter(e=>e.mode==='none').length === 1 && PE[5].mode === 'none', '只有最后一年框不住');
PE.forEach((e,i)=>{
  check(['both','one','none'].includes(e.mode), `era${i} mode 合法`);
  check(e.gap >= 0 && e.gapMax >= e.gap, `era${i} 间距范围合法 (${e.gap}..${e.gapMax})`);
  if (e.mode !== 'none') check(e.outRate > 0, `era${i} 掉出同框会掉线`);
});

// 罗生门：三块碎片同 z、不同道，且周围没有障碍挡着拿
const RD = G('rumorData');
check(RD.length === 3, `罗生门有 3 个版本 (${RD.length})`);
check(new Set(RD.map(r=>r.lane)).size === 3, '三块碎片在三条不同的道上');
check(Math.max(...RD.map(r=>r.z)) - Math.min(...RD.map(r=>r.z)) < 0.01, '三块碎片在同一位置');
RD.forEach((r,i)=> check(r.z > -1140 && r.z < -190, `碎片 ${i} 在 2007 段内 (z=${r.z})`));
const nearShard = obs.filter(o=>RD.some(r=>Math.abs(o.z-r.z) < 6.5));
check(nearShard.length === 0, `碎片附近清空了障碍 (${nearShard.length})`);
const RV = G('RUMOR_VERSIONS');
check(RV.length === 3 && new Set(RV.map(v=>v.y)).size === 3, '三种说法互不相同');
check(RV.every(v=>/未证实|没有第三方|没人能证实|说不清/.test(v.y)), '三种说法都写明没有第三方证据');

// 时间线
const TL = G('TIMELINE');
check(TL.length === 6, '时间线覆盖 6 个时代');
TL.forEach((l,i)=> check(l.length >= 1 && l.every(x=> x.at > 0 && x.at < 1 && x.y && x.t),
  `时代 ${i} 有 ${l.length} 个节点，at 合法`));

console.log(fail === 0 ? '\n=== WORLD PASS ===' : `\n=== FAIL ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
