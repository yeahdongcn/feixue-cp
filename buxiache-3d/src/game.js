/* ══════════════════════════════════════════════════════════════
   《不下车》 · 主程序
   ══════════════════════════════════════════════════════════════ */

const SPEED0 = 12, SPEED1 = 19;
const JUMP_V = 7.2, GRAV = 22;
const LANE_LERP = 13;

let camX = 0, camY = 0, camLookX = 0;
let trauma = 0, fovBump = 0;
let eraMix = { from:0, to:0, t:1 };
let obstacleIdx = 0;
let ringGroup = null;
let revealT = 0;

const HUD = {};
const st = {
  score:0, tapes:0, hearts:3, combo:0, bestCombo:0,
  hitAt:-99, era:0, tapeBits:0, perEra:[],
};

/* ══════════ 音频（WebAudio 合成，零资源） ══════════ */
let AC = null;
function audioInit(){
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ AC = null; }
}
function blip(freq, dur, type, gain, slideTo){
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, AC.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, AC.currentTime + dur);
  g.gain.setValueAtTime(gain || 0.06, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(); o.stop(AC.currentTime + dur + 0.02);
}
function sfxPick(){ blip(880, 0.10, 'square', 0.05, 1320); }
function sfxHit(){ blip(160, 0.22, 'sawtooth', 0.09, 60); }
function sfxJump(){ blip(420, 0.09, 'triangle', 0.05, 640); }
function sfxEra(){ blip(220, 0.5, 'sine', 0.07, 440); }
function sfxEnd(){ blip(120, 1.2, 'sine', 0.08, 40); }

/* ══════════ 角色 ══════════ */
function makePlayer(){
  const g = new THREE.Group();
  const COL = {
    shirt:'#c8342b', pants:'#232a35', skin:'#e0a882', dark:'#14161a', acc:'#f2d24b',
    shoe:'#1b1d22', hair:'#14161a'
  };
  const M = c => new THREE.MeshLambertMaterial({ color:c, flatShading:true });
  const matShirt = M(COL.shirt), matPants = M(COL.pants), matSkin = M(COL.skin);
  const matDark = M(COL.dark), matAcc = M(COL.acc), matShoe = M(COL.shoe), matHair = M(COL.hair);
  const add = (parent, w,h,d, x,y,z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); parent.add(m); return m;
  };

  const root = new THREE.Group(); g.add(root);
  // 髋
  add(root, .34,.16,.20, 0,.80,0, matPants);
  // 躯干
  const torso = new THREE.Group(); torso.position.set(0,.80,0); root.add(torso);
  torso.rotation.x = 0.10;
  add(torso, .40,.52,.24, 0,.28,0, matShirt);
  add(torso, .40,.10,.24, 0,.02,0, matPants);      // 腰
  add(torso, .42,.06,.25, 0,.50,0, matAcc);        // 领口
  add(torso, .30,.16,.22, 0,.56,0, matSkin);       // 颈

  // 头
  const head = new THREE.Group(); head.position.set(0,.68,0); torso.add(head);
  add(head, .34,.34,.32, 0,.17,0, matSkin);
  add(head, .36,.12,.34, 0,.31,0, matHair);
  add(head, .36,.10,.10, 0,.24,-.14, matHair);     // 刘海
  add(head, .06,.05,.02, -.09,.18,.165, matDark);  // 眼
  add(head, .06,.05,.02,  .09,.18,.165, matDark);

  // 手臂
  const mkArm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx*.26,.46,0); torso.add(sh);
    add(sh, .11,.28,.12, 0,-.13,0, matShirt);
    const el = new THREE.Group(); el.position.set(0,-.26,0); sh.add(el);
    add(el, .10,.26,.11, 0,-.13,0, matSkin);
    add(el, .11,.07,.12, 0,-.26,0, matAcc);        // 袖口
    return { sh, el };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // 腿
  const mkLeg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx*.11,.80,0); root.add(hip);
    add(hip, .14,.42,.15, 0,-.21,0, matPants);
    const kn = new THREE.Group(); kn.position.set(0,-.42,0); hip.add(kn);
    add(kn, .13,.40,.14, 0,-.20,0, matPants);
    add(kn, .14,.09,.28, 0,-.40,.04, matShoe);     // 脚
    add(kn, .14,.03,.29, 0,-.44,.04, matAcc);      // 鞋底
    return { hip, kn };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // 影子
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 14),
    new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.34, depthWrite:false })
  );
  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = 0.02;
  g.add(shadow);

  // 小光（受击时闪）
  scene.add(g);
  return { g, root, torso, head, armL, armR, legL, legR, shadow };
}

/* ══════════ 障碍 / 磁带 ══════════ */
const OB_KINDS = ['barrier','gate','block'];
const OB_H = { barrier:1.15, gate:2.9, block:2.4 };

let obIM = {}, tapeIM = null;

function buildEntities(){
  genEntities();
  // InstancedMesh
  const geoBox = new THREE.BoxGeometry(1,1,1);
  const matB = new THREE.MeshLambertMaterial({ color:0xffffff, flatShading:true });
  OB_KINDS.forEach(k=>{
    const list = obstacles.filter(o=>o.kind===k);
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geoBox, matB.clone(), list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    scene.add(im);
    obIM[k] = { im, list };
  });

  // 磁带（发光小方块 + 内圈）
  const tapeGeo = new THREE.BoxGeometry(0.62, 0.42, 0.14);
  const tapeMat = new THREE.MeshBasicMaterial({ color:0xffd479 });
  tapeIM = new THREE.InstancedMesh(tapeGeo, tapeMat, tapeData.length);
  tapeIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tapeIM.frustumCulled = false;
  scene.add(tapeIM);

  placeObstacles();
}

const _mm = new THREE.Matrix4();
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();

function placeObstacles(){
  const D = new THREE.Vector3(), Q4 = new THREE.Quaternion(), S = new THREE.Vector3();
  OB_KINDS.forEach(k=>{
    const rec = obIM[k]; if (!rec) return;
    rec.list.forEach((o, i) => {
      const h = OB_H[k];
      const w = (k==='barrier') ? 2.42 : (k==='gate' ? 2.42 : 1.6);
      const d = (k==='gate') ? 0.5 : 1.0;
      const y = (k==='gate') ? ROOF_Y + 1.85 : ROOF_Y + h/2;
      D.set(LANE_X[o.lane], y, o.z); S.set(w, h, d);
      _mm.compose(D, Q4, S);
      rec.im.setMatrixAt(i, _mm);
    });
    rec.im.instanceMatrix.needsUpdate = true;
  });
}

function hideObstacle(o){
  const rec = obIM[o.kind]; if (!rec) return;
  const i = rec.list.indexOf(o);
  if (i < 0) return;
  _mm.makeScale(0.0001,0.0001,0.0001);
  rec.im.setMatrixAt(i, _mm);
  rec.im.instanceMatrix.needsUpdate = true;
}

/* ══════════ 场景搭建 ══════════ */
function initScene(){
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference:'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  document.getElementById('cvhost').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 320);
  clock = new THREE.Clock();

  scene.add(makeSky());

  ambLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  scene.add(ambLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
  sunLight.position.set(-6, 12, 4);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
  fill.position.set(8, 4, 8);
  scene.add(fill);
  scene.userData.fill = fill;

  // 六个时代
  worldGroup = new THREE.Group(); scene.add(worldGroup);
  const initMat = (opts) => new THREE.MeshLambertMaterial(Object.assign({ vertexColors:true, flatShading:true }, opts));
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:0.9,
    blending:THREE.AdditiveBlending, depthWrite:false });

  for (let e=0;e<6;e++){
    const z0 = -e*ERA_LEN;
    const { solid, glow } = buildEra(e, z0);
    const ms = new THREE.Mesh(solid, initMat());
    ms.frustumCulled = false;
    worldGroup.add(ms);
    const mg = new THREE.Mesh(glow, glowMat);
    mg.frustumCulled = false; mg.renderOrder = 2;
    worldGroup.add(mg);
  }

  particles = makeParticles(); scene.add(particles);
  player.model = makePlayer();
  buildEntities();
  buildRing();
  applyEra(0, 0, 1);
}

/* 结局用的环形轨道 */
function buildRing(){
  ringGroup = new THREE.Group();
  ringGroup.visible = false;
  const R = 46;
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.9, 6, 96),
    new THREE.MeshLambertMaterial({ color:0x6a6070, emissive:0x221e28, flatShading:true, fog:false })
  );
  torus.rotation.x = Math.PI/2;
  ringGroup.add(torus);
  // 轨道上的小车
  const dots = new THREE.Group();
  for (let i=0;i<7;i++){
    const a = i/7*Math.PI*2;
    const d = new THREE.Mesh(new THREE.BoxGeometry(2.2,1.2,4.4),
      new THREE.MeshBasicMaterial({ color:0xffd479, fog:false }));
    d.position.set(Math.cos(a)*R, 0.7, Math.sin(a)*R);
    d.rotation.y = -a;
    dots.add(d);
  }
  ringGroup.add(dots);
  ringGroup.userData.dots = dots;
  scene.add(ringGroup);
}

/* ══════════ 时代调色 ══════════ */
let curPal = null;
function applyEra(from, to, k){
  const A = ERAS[from], B = ERAS[to];
  const L = (a,b) => a + (b-a)*k;
  const col = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), k);
  const fogC = col(A.fog, B.fog);
  if (!scene.fog) scene.fog = new THREE.Fog(fogC, L(A.fogN,B.fogN), L(A.fogF,B.fogF));
  else { scene.fog.color.copy(fogC); scene.fog.near = L(A.fogN,B.fogN); scene.fog.far = L(A.fogF,B.fogF); }
  scene.fog.near = L(A.fogN,B.fogN);
  scene.fog.far  = L(A.fogF,B.fogF);

  skyMat.uniforms.uTop.value.copy(col(A.skyTop, B.skyTop));
  skyMat.uniforms.uBot.value.copy(col(A.skyBot, B.skyBot));
  skyMat.uniforms.uSun.value.copy(col(A.sun, B.sun));
  skyMat.uniforms.uSunI.value = L(A.sunI, B.sunI);

  ambLight.color.copy(col(A.amb, B.amb));
  ambLight.intensity = L(A.ambI, B.ambI);
  sunLight.color.copy(col(A.dir, B.dir));
  sunLight.intensity = L(A.dirI, B.dirI);
  scene.userData.fill.color.copy(col(A.amb, B.amb));
  scene.userData.fill.intensity = L(A.dirI, B.dirI) * 0.22;

  pMat.color.copy(col(A.pcol, B.pcol));
  renderer.toneMappingExposure = L(1.12, 1.0);

  // HUD 时代色
  document.documentElement.style.setProperty('--era', B.accent);
  const yEl = HUD.year, tEl = HUD.tag;
  if (yEl && k > 0.5){ yEl.textContent = B.year; tEl.textContent = B.tag; }
  curPal = B;
}

/* ══════════ 输入 ══════════ */
const keys = {};
let touchStart = null;

function bindInput(){
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW'){ e.preventDefault(); tryJump(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS'){ e.preventDefault(); trySlide(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA'){ e.preventDefault(); tryLane(-1); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD'){ e.preventDefault(); tryLane(1); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  const el = document.getElementById('stage');
  el.addEventListener('touchstart', e => {
    touchStart = { x:e.touches[0].clientX, y:e.touches[0].clientY, t:performance.now() };
  }, { passive:true });
  el.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 26 && ay < 26) tryJump();
    else if (ax > ay) tryLane(dx > 0 ? 1 : -1);
    else if (dy < 0) tryJump();
    else trySlide();
    touchStart = null;
  }, { passive:true });
}

function tryLane(d){
  if (G.state !== 'playing') return;
  const n = Math.max(0, Math.min(2, player.lane + d));
  if (n !== player.lane){ player.lane = n; player.lean = -d*0.5; }
}
function tryJump(){
  if (G.state !== 'playing') return;
  if (!player.jumping && player.slide <= 0){
    player.jumping = true; player.vy = JUMP_V; sfxJump();
    trauma = Math.min(1, trauma + 0.10);
  }
}
function trySlide(){
  if (G.state !== 'playing') return;
  if (!player.jumping){ player.slide = 0.55; }
  else { player.vy = Math.min(player.vy, -6); }
}

/* ══════════ 主循环 ══════════ */
function update(dt){
  if (G.state === 'title'){ renderIdle(dt); return; }
  if (G.state === 'reveal'){ updateReveal(dt); return; }
  if (G.state === 'result'){ return; }

  const E = G.era;
  G.t += dt;
  G.speed = SPEED0 + (SPEED1-SPEED0) * Math.min(1, G.t/68);

  // 距离 & 时代
  const mul = G.pen > 0 ? (0.52 + 0.48*(1 - G.pen/0.7)) : 1;
  player.z -= G.speed * mul * dt;
  if (G.pen > 0) G.pen -= dt;
  G.dist = -player.z;
  const newEra = Math.min(5, Math.floor(G.dist / ERA_LEN));
  if (newEra !== G.era){
    G.era = newEra;
    eraMix = { from: eraMix.to, to: newEra, t: 0 };
    sfxEra(); G.flash = 0.9;
    showCaption(ERAS[newEra].year, ERAS[newEra].tag);
    st.perEra[newEra] = true;
  }
  if (eraMix.t < 1){
    eraMix.t = Math.min(1, eraMix.t + dt/1.2);
    applyEra(eraMix.from, eraMix.to, smooth(eraMix.t));
  }

  // 车道
  const tx = LANE_X[player.lane];
  player.x += (tx - player.x) * Math.min(1, LANE_LERP * dt);
  player.lean += (0 - player.lean) * Math.min(1, 8*dt);

  // 跳跃 / 滑铲
  if (player.jumping){
    player.vy -= GRAV * dt;
    player.y += player.vy * dt;
    if (player.y <= 0){
      player.y = 0; player.vy = 0; player.jumping = false;
      trauma = Math.min(1, trauma + 0.22);
    }
  }
  if (player.slide > 0) player.slide -= dt;

  // 跑步动画
  player.runPhase += dt * (G.speed * 0.72);
  animatePlayer(dt);

  // 碰撞
  collide();

  // 相机
  const shakeAmt = trauma * trauma;
  const sx = (Math.random()-0.5) * 0.35 * shakeAmt;
  const sy = (Math.random()-0.5) * 0.35 * shakeAmt;
  const camTargetX = player.x * 0.55;
  camX += (camTargetX - camX) * Math.min(1, 9*dt);
  camY += ((ROOF_Y + 2.70 + player.y*0.42) - camY) * Math.min(1, 6*dt);
  const camBack = 6.4 + (camera.aspect < 1 ? (1-camera.aspect)*5.0 : 0);
  camera.position.set(camX + sx, camY + sy, player.z + camBack);
  const lx = player.x * 0.42;
  camLookX += (lx - camLookX) * Math.min(1, 14*dt);
  camera.lookAt(camLookX, ROOF_Y + 1.00 + player.y*0.35, player.z - 15);
  camera.rotation.z += player.lean * 0.06 + (Math.random()-0.5)*0.02*shakeAmt;

  const asp = camera.aspect;
  const portBoost = asp < 1 ? (1 + (1-asp)*0.62) : 1;
  const fovTarget = (58 + 18 * (G.speed - SPEED0) / (SPEED1 - SPEED0)) * portBoost;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, 3*dt);
  camera.updateProjectionMatrix();

  // 天空跟随
  scene.children[0].position.copy(camera.position);

  // 粒子
  updateParticles(dt);
  trauma = Math.max(0, trauma - 1.8*dt);
  G.flash = Math.max(0, G.flash - dt*2.6);

  checkTimeline();

  // 分数
  st.score += G.speed * dt * 10;
  updateHUD();
  if (G.dist >= ERA_LEN*6 - 30) startReveal();
}

function smooth(t){ return t*t*(3-2*t); }

function animatePlayer(dt){
  const v = player.model;
  const ph = player.runPhase;
  const air = player.jumping;
  const sl = player.slide > 0;

  v.g.position.set(player.x, ROOF_Y + player.y, player.z);
  v.g.rotation.y = 0;
  v.g.rotation.z = player.lean * 0.25;

  const bob = air ? 0 : Math.sin(ph*2) * 0.045;
  v.root.position.y = bob;

  if (air){
    v.legL.hip.rotation.x = -0.9; v.legR.hip.rotation.x = 0.45;
    v.legL.kn.rotation.x = 1.5;   v.legR.kn.rotation.x = 0.7;
    v.armL.sh.rotation.x = -2.2;  v.armR.sh.rotation.x = -2.0;
    v.torso.rotation.x = -0.16;
  } else if (sl){
    v.root.rotation.x = -1.15;
    v.root.position.y = 0.55;
    v.legL.hip.rotation.x = 0.5; v.legR.hip.rotation.x = 0.3;
    v.armL.sh.rotation.x = 0.6;  v.armR.sh.rotation.x = 0.4;
    v.torso.rotation.x = 0.2;
  } else {
    v.root.rotation.x = 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    v.legL.hip.rotation.x = s * 0.95;
    v.legR.hip.rotation.x = -s * 0.95;
    v.legL.kn.rotation.x = Math.max(0, -c) * 1.15;
    v.legR.kn.rotation.x = Math.max(0,  c) * 1.15;
    v.armL.sh.rotation.x = -s * 0.8;
    v.armR.sh.rotation.x = s * 0.8;
    v.armL.el.rotation.x = -0.5 - Math.max(0,s)*0.5;
    v.armR.el.rotation.x = -0.5 - Math.max(0,-s)*0.5;
    v.torso.rotation.x = 0.10;
  }

  // 影子
  v.shadow.position.y = 0.02 - player.y;
  const sc = Math.max(0.35, 1 - player.y*0.32);
  v.shadow.scale.set(sc, sc, sc);
  v.shadow.material.opacity = 0.34 * sc;
}

function collide(){
  const pz = player.z;
  const feet = player.y;
  const headY = (player.slide > 0) ? 0.85 : 1.62;

  for (let k=0;k<OB_KINDS.length;k++){
    const rec = obIM[OB_KINDS[k]]; if (!rec) continue;
    const list = rec.list;
    for (let i=0;i<list.length;i++){
      const o = list[i];
      if (o.hit) continue;
      const dz = o.z - pz;
      if (dz > 3.0){ continue; }
      if (dz < -2.2){ continue; }
      const dx = Math.abs(LANE_X[o.lane] - player.x);
      if (dx > 1.30) continue;
      // 竖直判定
      let hits = false;
      if (o.kind === 'barrier') hits = feet < 1.05;
      else if (o.kind === 'gate') hits = (feet + headY) > 1.55;
      else hits = (feet+headY) > 0.2;
      if (hits && Math.abs(dz) < 1.15){
        o.hit = true; hideObstacle(o);
        onHit();
        return;
      }
    }
  }

  // 磁带
  if (tapeIM){
    for (let i=0;i<tapeData.length;i++){
      const t = tapeData[i];
      if (t.taken) continue;
      if (Math.abs(t.z - pz) < 1.3){
        if (Math.abs(LANE_X[t.lane] - player.x) < 1.2 && Math.abs((ROOF_Y+t.y) - (ROOF_Y+feet+0.8)) < 1.5){
          t.taken = true; onPick(i);
        }
      }
    }
  }
}

function onHit(){
  st.hearts--; st.combo = 0; st.hitAt = G.t;
  G.hits++; G.flash = 0.55; trauma = 1.0;
  sfxHit();
  G.pen = 0.7;
  if (st.hearts <= 0) endRun(false);
}

function onPick(i){
  st.tapes++; st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo);
  st.score += 60 + st.combo*8;
  sfxPick();
  const t = tapeData[i];
  // 隐藏
  _mm.makeScale(0.0001,0.0001,0.0001);
  tapeIM.setMatrixAt(i, _mm);
  tapeIM.instanceMatrix.needsUpdate = true;
  toast('磁带 +1');
}


let tlShown = {};
let tlT = null;

function checkTimeline(){
  const e = G.era;
  const local = (G.dist - e*ERA_LEN) / ERA_LEN;
  const list = TIMELINE[e] || [];
  for (let i=0;i<list.length;i++){
    const k = e + '_' + i;
    if (!tlShown[k] && local >= list[i].at){
      tlShown[k] = true;
      showTL(list[i]);
      st.tlCount = (st.tlCount||0) + 1;
    }
  }
}

function showTL(it){
  const el = document.getElementById('tl');
  if (!el) return;
  el.querySelector('.tlY').textContent = it.y;
  el.querySelector('.tlT').textContent = it.t;
  el.classList.add('on');
  clearTimeout(tlT);
  tlT = setTimeout(()=> el.classList.remove('on'), 5200);
  blip(1320, 0.06, 'sine', 0.03);
}

/* ══════════ 粒子 ══════════ */
function updateParticles(dt){
  const E = curPal || ERAS[0];
  const spd = G.speed;
  for (let i=0;i<pCount;i++){
    const i3 = i*3;
    if (E.weather === 'snow'){
      pPos[i3+1] -= (1.6 + (i%5)*0.25) * dt;
      pPos[i3]   += Math.sin(G.t*0.7 + i)*0.5*dt + 0.7*dt;
      pPos[i3+2] += spd * dt * 0.75;
    } else if (E.weather === 'rain'){
      pPos[i3+1] -= (11 + (i%4)) * dt;
      pPos[i3+2] += spd * dt * 0.9;
    } else if (E.weather === 'heat'){
      pPos[i3+1] += (0.5 + (i%3)*0.2) * dt;
      pPos[i3+2] += spd * dt * 0.85;
      pPos[i3]   += Math.sin(G.t + i*0.3)*0.3*dt;
    } else {
      pPos[i3+1] += Math.sin(G.t*0.6 + i)*0.25*dt;
      pPos[i3]   += Math.cos(G.t*0.4 + i*0.7)*0.28*dt;
      pPos[i3+2] += spd * dt * 0.8;
    }
    if (pPos[i3+1] < 0 || pPos[i3+1] > 30 || pPos[i3+2] > player.z + 26){
      resetParticle(i, false);
    }
  }
  pGeo.attributes.position.needsUpdate = true;
  pMat.size = E.weather === 'rain' ? 0.10 : (E.weather === 'snow' ? 0.13 : 0.17);

  // 磁带旋转/浮动
  if (tapeIM){
    for (let i=0;i<tapeData.length;i++){
      const t = tapeData[i];
      if (t.taken) continue;
      const D = new THREE.Vector3(LANE_X[t.lane], ROOF_Y + t.y + Math.sin(G.t*2 + t.spin)*0.12, t.z);
      _ee.set(0, G.t*1.6 + t.spin, 0.2);
      _qq.setFromEuler(_ee);
      _mm.compose(D, _qq, new THREE.Vector3(1,1,1));
      tapeIM.setMatrixAt(i, _mm);
    }
    tapeIM.instanceMatrix.needsUpdate = true;
  }
}

/* ══════════ HUD / 文案 ══════════ */
function updateHUD(){
  if (HUD.score) HUD.score.textContent = Math.floor(st.score).toLocaleString('en-US');
  if (HUD.tape)  HUD.tape.textContent = st.tapes;
  if (HUD.hearts) HUD.hearts.textContent = '●'.repeat(Math.max(0,st.hearts)) + '○'.repeat(Math.max(0,3-st.hearts));
  if (HUD.combo){
    if (st.combo > 1){ HUD.combo.textContent = '×' + st.combo; HUD.combo.classList.add('on'); }
    else HUD.combo.classList.remove('on');
  }
  if (HUD.bar){
    HUD.bar.style.width = Math.min(100, G.dist/(ERA_LEN*6)*100) + '%';
  }
}

let capT = null;
function showCaption(year, tag){
  const el = document.getElementById('caption');
  if (!el) return;
  el.querySelector('.cy').textContent = year;
  el.querySelector('.ct').textContent = tag;
  el.classList.add('on');
  clearTimeout(capT);
  capT = setTimeout(()=> el.classList.remove('on'), 2400);
}
let toastT = null;
function toast(msg){
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('on'), 900);
}

/* ══════════ 结局 ══════════ */
function startReveal(){
  G.state = 'reveal'; revealT = 0;
  document.getElementById('flash').classList.add('on');
  setTimeout(()=>{
    worldGroup.visible = false;
    particles.visible = false;
    player.model.g.visible = false;
    if (tapeIM) tapeIM.visible = false;
    Object.values(obIM).forEach(r=> r.im.visible = false);
    ringGroup.visible = true;
    document.getElementById('flash').classList.remove('on');
    camera.position.set(0, 76, 78);
    camera.fov = 45; camera.updateProjectionMatrix();
    camera.lookAt(0,0,0);
    sfxEnd();
    document.getElementById('revealText').classList.add('on');
  }, 700);
}

function updateReveal(dt){
  revealT += dt;
  const a = revealT * 0.16;
  ringGroup.userData.dots.rotation.y = a;
  scene.children[0].position.copy(camera.position);
  ringGroup.rotation.z = Math.sin(revealT*0.2)*0.02;
  if (revealT > 1.2 && document.getElementById('revealText').classList.contains('on') === false){
    document.getElementById('revealText').classList.add('on');
  }
  if (revealT > 9 && !document.getElementById('choiceRow').classList.contains('on')){
    document.getElementById('choiceRow').classList.add('on');
  }
}

function endRun(crashed){
  G.state = 'result';
  document.getElementById('revealText').classList.remove('on');
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('endKick').textContent = 'EARLY OUT';
  document.getElementById('endTitle').textContent = '提前下车';
  document.getElementById('endLine').textContent = '你被流言撞了三次。列车没有停，只是你不再看窗外了。';
  document.getElementById('over').classList.add('on');
  showResult(true);
}

function pickEnding(off){
  G.state = 'result';
  G.endPick = off ? 'off' : 'stay';
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('revealText').classList.remove('on');
  ringGroup.visible = false;
  document.getElementById('endKick').textContent = 'ENDING';
  document.getElementById('endTitle').textContent = off ? '下车' : '不下车';
  document.getElementById('endLine').textContent = off
    ? '你回到了 2026。站台很空，风把雪吹进轨道里。她还是那个会唱歌的人——只是不在你的车里了。'
    : '你把自己留在了那节车厢里。窗外还是 2006 年的夏天，蝉在叫，有人在喊一个名字。';
  document.getElementById('over').classList.add('on');
  showResult(false);
  sfxEnd();
}

const TITLES = [
  [9000,'短信投票冠军','一人一票投出来的'],
  [7000,'二十年老粉，证件齐全','你连她的应援色都记得'],
  [5500,'磁带收藏家，感情贫困户','收得越多，越说不清'],
  [4000,'站票二十年','你一直在门外'],
  [2800,'路过青春，没投过票','但你都记得'],
  [1500,'上车是为了看她，下车是因为挤','很合理'],
  [0,'提前下车，情有可原',''],
];

function showResult(crashed){
  const s = Math.floor(st.score);
  let t = TITLES.find(x=> s >= x[0]) || TITLES[TITLES.length-1];
  let hidden = false;
  if (st.tapes >= 20 && st.hearts === 3){ t = [0,'你一次都没信过流言','']; hidden = true; }

  document.getElementById('rScore').textContent = s.toLocaleString('en-US');
  document.getElementById('rTitle').textContent = t[1];
  document.getElementById('rTitle').classList.toggle('gold', hidden);
  document.getElementById('rSub').textContent = crashed ? '你提前下车了。' : t[2];
  const lines = ['没下车，也没到站。','二十年，就换来一张站票。','磁带都收齐了，人没留住。',
                 '我在 2014 那站睡着了。','你记得的比你以为的多。'];
  document.getElementById('rQuote').textContent = lines[s % lines.length];
  document.getElementById('rDetail').textContent =
    `距离 ${Math.floor(G.dist)}m · 磁带 ${st.tapes} · 路过 ${st.tlCount||0} 个时间点 · 最高连击 ×${st.bestCombo}`;
}

/* ══════════ 错误兜底（黑屏时给出可读信息） ══════════ */
function showErr(msg){
  let el = document.getElementById('err');
  if (!el){
    el = document.createElement('div');
    el.id = 'err';
    document.body.appendChild(el);
  }
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999;padding:14px 16px;' +
    'background:#1a0e12;color:#ff9aa8;font:12px/1.7 monospace;white-space:pre-wrap;' +
    'border-top:1px solid #ff6b8155;max-height:40%;overflow:auto';
  el.textContent = '出错了：' + msg;
}
window.addEventListener('error', e => { try{ showErr(e.message + '\n' + (e.filename||'') + ':' + (e.lineno||'')); }catch(_){} });

/* ══════════ 启动 ══════════ */
function boot(){
  HUD.year = document.getElementById('hudYear');
  HUD.tag = document.getElementById('hudTag');
  HUD.score = document.getElementById('hudScore');
  HUD.tape = document.getElementById('hudTape');
  HUD.hearts = document.getElementById('hudHearts');
  HUD.combo = document.getElementById('combo');
  HUD.bar = document.getElementById('eraBar');

  try {
    initScene();
  } catch (e) {
    showErr('WebGL 初始化失败：' + (e && e.message ? e.message : e) + '\n请换一个支持 WebGL 的浏览器');
    return;
  }
  bindInput();

  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnOff').addEventListener('click', ()=> pickEnding(true));
  document.getElementById('btnStay').addEventListener('click', ()=> pickEnding(false));
  document.getElementById('btnAgain').addEventListener('click', ()=> location.reload());

  window.addEventListener('resize', onResize);
  onResize();

  if (SHOT){ shotMode(); return; }

  G.state = 'title';
  loop();
}

function onResize(){
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}

function startGame(){
  audioInit();
  document.getElementById('title').classList.add('gone');
  document.getElementById('hud').classList.add('on');
  G.state = 'playing';
  if (player.model) player.model.g.visible = true;
  G.t = 0; G.speed = SPEED0; G.era = 0;
  player.z = 0; player.x = 0; player.lane = 1; player.y = 0; player.vy = 0;
  player.jumping = false; player.slide = 0; player.lean = 0; G.pen = 0;
  st.score = 0; st.tapes = 0; st.hearts = 3; st.combo = 0; st.bestCombo = 0; st.perEra = [];
  memsetTapes();
  tlShown = {}; st.tlCount = 0;
  document.getElementById('tl').classList.remove('on');
  eraMix = { from:0, to:0, t:1 };
  applyEra(0,0,1);
  showCaption(ERAS[0].year, ERAS[0].tag);
  updateHUD();
}

function memsetTapes(){
  if (!tapeIM) return;
  tapeData.forEach((t,i)=>{ t.taken = false; });
  for (let i=0;i<tapeData.length;i++){
    _mm.compose(new THREE.Vector3(LANE_X[tapeData[i].lane], ROOF_Y+tapeData[i].y, tapeData[i].z),
                new THREE.Quaternion(), new THREE.Vector3(1,1,1));
    tapeIM.setMatrixAt(i,_mm);
  }
  tapeIM.instanceMatrix.needsUpdate = true;
  obstacles.forEach(o=>{ o.hit = false; });
  placeObstacles();
}

function renderIdle(dt){
  const t = performance.now()*0.001;
  camera.position.set(Math.sin(t*0.16)*1.4, ROOF_Y+2.9, 7.4);
  camera.lookAt(0, ROOF_Y+1.0, -18);
  camera.fov = 58; camera.updateProjectionMatrix();
  scene.children[0].position.copy(camera.position);
  updateParticles(dt);
  if (player.model) player.model.g.visible = false;
}

let last = 0;
function loop(){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
}

/* ══════════ 截图模式（开发用） ══════════ */
function shotMode(){
  const d = parseFloat(Q.get('d') || '8');
  document.getElementById('title').classList.add('gone');
  document.getElementById('hud').classList.add('on');
  G.state = 'playing';
  if (player.model) player.model.g.visible = true;
  G.t = 0; G.speed = SPEED0; G.era = 0;
  player.z = -d; player.lane = 1; player.x = 0;
  G.dist = d;
  const e = Math.min(5, Math.floor(d / ERA_LEN));
  G.era = e; eraMix = { from:e, to:e, t:1 };
  applyEra(e,e,1);
  camX = 0; camY = ROOF_Y + 2.70;
  for (let i=0;i<3;i++){ update(1/60); }
  const asp0 = camera.aspect;
  camera.fov = (58 + 18*(G.speed-SPEED0)/(SPEED1-SPEED0)) * (asp0 < 1 ? (1+(1-asp0)*0.62) : 1);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  window.__shotDone = true;
  document.title = 'shot ok ' + d;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
