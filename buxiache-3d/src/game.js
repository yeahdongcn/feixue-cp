/* ══════════════════════════════════════════════════════════════
   《不下车》 · 主程序
   ──────────────────────────────────────────────────────────────
   这一版加了一件玩家能操作、能失去、也能保住的东西：
   「同框」——她们跑在你前面，两个人之间连着一条线。
   你站在两人中间，线就紧；你被撞开、被逼走，线就松、就断。
   你保不住她们的二十年，只能保住「她们还在同一个画面里」。
   ══════════════════════════════════════════════════════════════ */

const SPEED0 = 11, SPEED1 = 17;
const JUMP_V = 8.6, GRAV = 22;
const LANE_LERP = 13;

let camX = 0, camY = 0, camLookX = 0;
let trauma = 0, fovBump = 0;
let eraMix = { from:0, to:0, t:1 };
let ringGroup = null;
let revealT = 0;
let RUN = 0;                      // 局数令牌：防止上一局的 setTimeout 污染新一局

const HUD = {};
const st = {
  score:0, tapes:0, hearts:3, combo:0, bestCombo:0,
  hitAt:-99, era:0, tapeBits:0, perEra:[],
  near:0, precise:0, tlCount:0, rumor:null, rumorShort:'',
  shieldUsed:0, bondEnd:48, gapEnd:1.0,
};

/* ══════════ 「同框」状态 ══════════ */
const pair = {
  bond: 48, gap: 1.0, lane: 1, cx: 0, mode: 'both',
  inFrame: false, armed: false, used: false,
  group: null, a: null, b: null, segs: [], shadowSegs: [], knots: [], haloA: null, haloB: null,
  laneT: 3.4, runT: 0.9, z: 0, flash: 0,
};

function pairTol(gap){ return Math.max(0.30, 1.95 - gap * 0.24); }
function bondMult(){
  if (pair.mode === 'none') return 2;
  return 1 + Math.min(4, Math.floor(pair.bond / 20));
}
function pairLabel(){
  if (pair.mode === 'none') return '框不住了';
  if (pair.mode === 'one')  return '没有对照';
  if (pair.bond >= 88) return '线是紧的';
  if (pair.bond >= 60) return '还连着';
  if (pair.bond >= 35) return '有点松了';
  if (pair.bond >= 15) return '快散了';
  return '散了';
}

/* ══════════ 音频（WebAudio 合成，零资源） ══════════ */
let AC = null;
function audioInit(){
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ AC = null; }
}
function blip(freq, dur, type, gain, slideTo){
  if (!AC || MUSIC.isMuted()) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, AC.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, AC.currentTime + dur);
  g.gain.setValueAtTime((gain || 0.06) * 1.25, AC.currentTime);   // 配乐占了动态余量，音效跟着抬一点
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(); o.stop(AC.currentTime + dur + 0.02);
}
function sfxPick(){ blip(880, 0.10, 'square', 0.05, 1320); }
function sfxHit(){ blip(160, 0.22, 'sawtooth', 0.09, 60); }
function sfxJump(){ blip(420, 0.09, 'triangle', 0.05, 640); }
function sfxEra(){ blip(220, 0.5, 'sine', 0.07, 440); }
function sfxEnd(){ blip(120, 1.2, 'sine', 0.08, 40); }
function sfxNear(){ blip(1180, 0.05, 'sine', 0.028, 1500); }
function sfxShield(){ blip(520, 0.30, 'sine', 0.07, 900); }
function sfxRumor(){ blip(340, 0.36, 'triangle', 0.055, 240); }
function sfxBondBreak(){ blip(140, 0.5, 'sine', 0.05, 90); }

/* ════════════════════════════════════════════════════════════════════════
   配乐 ·《绕圈》 —— 原创 · WebAudio 现场合成 · 不加载任何音频文件

   主题动机（A 小调）：A4 C5 E5 D5 | C5 B4 A4 G4（每音一拍）
   128 BPM：一拍 0.46875s，两小节一句，16 小节绕一圈（约 30 秒）。
   70 秒跑完二十年 = 这句话要绕两圈半；每圈都停在 G 上，落不回主音。
   前半圈动机拉成两小节（循环），后半圈提速一倍（冲刺），鼓和贝斯一直往前推。

   配器：钢琴 sine+triangle（attack .004 / decay .9）
        弦垫 两个 detune sawtooth + lowpass 900 + attack .6
        音盒 sine + 高八度泛音（.25 秒短包络）
        鼓   白噪声 + bandpass 短包络；底鼓 sine 120→45Hz 下滑
   调度：前瞻式，setInterval 25ms / 提前 0.12s 排程（不是逐音 setTimeout）。
   ════════════════════════════════════════════════════════════════════════ */
const MUSIC = (() => {
  const BPM = 128, SPB = 60 / BPM, STEP = SPB / 2;
  const LOOK = 0.12, TICK = 25, SWING = 0.017, MASTER = 0.18, BARS = 16;
  const MEL  = [69, 72, 76, 74, 72, 71, 69, 67];                 // A4 C5 E5 D5 C5 B4 A4 G4
  const PROG = [[57,60,64],[55,59,62],[53,57,60],[55,59,62]];    // Am G F G
  const ROOT = [45, 43, 41, 43];                                 // A2 G2 F2 G2
  // 六个时代各一层配器 + 结果页「下车」
  const ARR = [
    { kick:.86, snare:.40, hat:.075, bass:.30, piano:.34, box:.085, pad:.105, half:0, busy:1 }, // 2006 夏
    { kick:.50, snare:.17, hat:.045, bass:.22, piano:.20, box:.080, pad:.130, half:0, busy:0 }, // 2007 冬
    { kick:.42, snare:0,   hat:.030, bass:.17, piano:.15, box:.050, pad:.120, half:1, busy:0 }, // 2014 灰
    { kick:.94, snare:.46, hat:.095, bass:.34, piano:.32, box:.060, pad:.060, half:0, busy:1 }, // 2020 台上
    { kick:.44, snare:.10, hat:.030, bass:.17, piano:.24, box:.070, pad:.115, half:1, busy:0 }, // 2026 灯灭
    { kick:.16, snare:0,   hat:0,    bass:.10, piano:.12, box:.070, pad:.150, half:1, busy:0 }, // ????
    { kick:0,   snare:0,   hat:0,    bass:0,   piano:.16, box:.075, pad:.165, half:1, busy:0 }, // 下车
  ];
  const f = n => 440 * Math.pow(2, (n - 69) / 12);
  // 整体电平：母带固定 0.18，各层再抬 1.45 倍，实测峰值约 -10dBFS，还有余量
  for (const a of ARR) for (const k in a) if (typeof a[k] === 'number' && k !== 'half' && k !== 'busy') a[k] *= 1.45;

  let ctx=null, master=null, ana=null, busA=null, busB=null, busOn=0;
  let ready=false, playing=false, timer=null, nextT=0, step=0, era=0, ending=false;
  let muted=false, noiseBuf=null;

  const lsGet = () => { try { return localStorage.getItem('bx3d.mute'); } catch(e){ return null; } };
  const lsSet = v => { try { localStorage.setItem('bx3d.mute', v); } catch(e){} };
  function gainNode(v){ const g = ctx.createGain(); g.gain.value = v; return g; }
  function filt(type, hz, q){ const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = q || 0.7; return b; }
  function noiseBufGet(){
    if (!noiseBuf){
      const n = Math.max(256, Math.floor(ctx.sampleRate * 0.6));
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function env(g, t, a, d, peak, hold){
    const p = Math.max(0.0002, peak);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0002, t);
    g.gain.linearRampToValueAtTime(p, t + a);
    if (hold > 0) g.gain.setValueAtTime(p, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0002, t + a + (hold > 0 ? hold : 0) + d);
  }
  const cur = () => (busOn ? busB : busA);
  const alt = () => (busOn ? busA : busB);

  /* ── 钢琴：sine + triangle，快起 / 0.9s 衰减 ── */
  function piano(t, m, dec, amp){
    const b = cur(); if (!b) return;
    const g = gainNode(0), g2 = gainNode(0.40);
    const o1 = ctx.createOscillator(); o1.type = 'sine';     o1.frequency.value = f(m);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f(m); o2.detune.value = 5;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(b);
    env(g, t, 0.004, dec || 0.9, amp);
    const stop = t + (dec || 0.9) + 0.12;
    o1.start(t); o2.start(t); o1.stop(stop); o2.stop(stop);
  }
  /* ── 音盒：sine + 高八度泛音，0.25s ── */
  function musicBox(t, m, amp){
    const b = cur(); if (!b) return;
    const g = gainNode(0), g2 = gainNode(0.30);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f(m);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f(m + 12);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(b);
    env(g, t, 0.002, 0.25, amp);
    o1.start(t); o2.start(t); o1.stop(t + 0.34); o2.stop(t + 0.34);
  }
  /* ── 弦垫：两个 detune 的 saw + lowpass 900 + 慢起 ── */
  function padChord(t, notes, dur, amp){
    const b = cur(); if (!b) return;
    const lp = filt('lowpass', 900, 0.6), g = gainNode(0);
    lp.connect(g); g.connect(b);
    for (const m of notes) for (const det of [-7, 7]){
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.0);
    }
    env(g, t, 0.6, 0.9, amp, dur - 1.5);
  }
  /* ── 鼓 ── */
  function kick(t, amp){
    const b = cur(); if (!b) return;
    const o = ctx.createOscillator(), g = gainNode(0);
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    env(g, t, 0.003, 0.20, amp);
    o.connect(g); g.connect(b); o.start(t); o.stop(t + 0.30);
  }
  function snare(t, amp){
    const b = cur(); if (!b) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBufGet();
    const bp = filt('bandpass', 1900, 0.9), g = gainNode(0);
    s.connect(bp); bp.connect(g); g.connect(b);
    env(g, t, 0.002, 0.11, amp);
    s.start(t); s.stop(t + 0.16);
    const o = ctx.createOscillator(), g2 = gainNode(0);
    o.type = 'triangle'; o.frequency.value = 190;
    env(g2, t, 0.002, 0.07, amp * 0.45);
    o.connect(g2); g2.connect(b); o.start(t); o.stop(t + 0.12);
  }
  function hat(t, amp, open){
    const b = cur(); if (!b) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBufGet();
    const bp = filt('bandpass', open ? 7000 : 9000, 0.8), g = gainNode(0);
    s.connect(bp); bp.connect(g); g.connect(b);
    env(g, t, 0.001, open ? 0.20 : 0.035, amp);
    s.start(t); s.stop(t + 0.26);
  }
  function bass(t, m, dur, amp){
    const b = cur(); if (!b) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o1.frequency.value = f(m);
    o2.type = 'sine';     o2.frequency.value = f(m - 12);
    const lp = filt('lowpass', 320, 0.9), g = gainNode(0);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(b);
    env(g, t, 0.006, 0.16, amp, dur);
    const stop = t + dur + 0.22;
    o1.start(t); o2.start(t); o1.stop(stop); o2.stop(stop);
  }
  function crash(t, amp){
    const b = cur(); if (!b) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBufGet(); s.loop = true;
    const hp = filt('highpass', 3200, 0.7), g = gainNode(0);
    s.connect(hp); hp.connect(g); g.connect(b);
    env(g, t, 0.004, 0.9, amp);
    s.start(t); s.stop(t + 1.0);
  }

  /* ── 一步（八分音符网格） ── */
  function playStep(i, t, cfg){
    const bar = (i / 8) | 0, s = i & 7, sec = bar >= BARS / 2, hum = 0.86 + Math.random() * 0.28;
    const ci = bar & 3;
    if (cfg.kick && (s === 0 || s === 4 || (cfg.busy && s === 6 && (bar & 3) === 3)))
      kick(t, cfg.kick * (s === 0 ? 1 : 0.86) * hum);
    if (cfg.snare && (s === 2 || s === 6 || (cfg.busy && s === 7 && (bar & 7) === 7)))
      snare(t, cfg.snare * (s === 6 ? 1 : 0.6) * hum);
    if (cfg.hat && (!cfg.half || (s & 1) === 0))
      hat(t, cfg.hat * ((s & 1) ? 1 : 0.45) * hum, s === 7 && (bar & 3) === 3);
    if (cfg.bass && (s & 1) === 0){
      const r = ROOT[ci];
      bass(t, s === 6 ? r + 12 : (s === 4 ? r + 7 : r), SPB * 0.42, cfg.bass * hum);
    }
    if (cfg.pad && s === 0) padChord(t, PROG[ci], SPB * 4, cfg.pad);
    if (sec){
      // 后半圈：动机提速一倍，八分音符连奏 —— 冲刺
      if (cfg.piano) piano(t, MEL[i & 7], 0.9, cfg.piano * 0.52 * hum);
      if (cfg.box && (s & 1) === 0) musicBox(t + 0.01, MEL[(i >> 1) & 7] + 12, cfg.box * 0.95);
    } else {
      // 前半圈：动机拉成两小节一句 —— 循环
      if ((s & 1) === 0){
        const mi = (bar * 4 + (s >> 1)) & 7;
        if (cfg.piano) piano(t, MEL[mi], 0.9, cfg.piano * (mi === 0 ? 1 : 0.9) * hum);
        if (cfg.box && (mi === 2 || mi === 6)) musicBox(t + 0.01, MEL[mi] + 12, cfg.box * 0.8);
      }
    }
    if (s === 0 && (bar === 0 || bar === 8)) crash(t, 0.13);
  }

  /* ── 前瞻式调度：25ms 心跳，提前 0.12s 排程 ── */
  function tick(){
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    if (nextT < now - 0.25) nextT = now + 0.03;     // 切后台回来不补一串音
    let guard = 0;
    while (nextT < now + LOOK && guard++ < 32){
      const cfg = ending ? ARR[6] : (ARR[era] || ARR[0]);
      playStep(step % (BARS * 8), nextT + ((step & 1) ? SWING : 0), cfg);
      nextT += STEP; step++;
    }
  }

  function applyMute(instant){
    if (!ready || !master) return;
    const now = ctx.currentTime, g = muted ? 0 : MASTER;
    master.gain.cancelScheduledValues(now);
    if (instant){ master.gain.setValueAtTime(g, now); return; }
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(g, now + 0.15);
  }
  function fadeIn(){
    if (!ready || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER, now + 1.2);   // 1.2 秒淡入
  }
  function cross(){
    if (!ready) return;
    const now = ctx.currentTime, T = 1.5;                                  // 1.5 秒交叉淡入
    const from = cur(), to = alt();
    to.gain.cancelScheduledValues(now);
    to.gain.setValueAtTime(Math.max(0, to.gain.value), now);
    to.gain.linearRampToValueAtTime(1, now + T);
    from.gain.cancelScheduledValues(now);
    from.gain.setValueAtTime(Math.max(0, from.gain.value), now);
    from.gain.linearRampToValueAtTime(0, now + T);
    busOn = busOn ? 0 : 1;
  }
  function syncBtn(){
    const b = document.getElementById('mute');
    if (!b) return;
    if (b.classList) b.classList.toggle('off', muted);
    if (b.setAttribute) b.setAttribute('aria-pressed', muted ? 'true' : 'false');
    b.title = muted ? '打开音乐（M）' : '静音（M）';
  }
  function init(){
    if (ready) return true;
    if (!ctx){
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ return false; }
    }
    if (!ctx || !ctx.createBiquadFilter || !ctx.createBufferSource || !ctx.createBuffer || !ctx.createGain) return false;
    try {
      master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
      busA = ctx.createGain(); busA.gain.value = 1; busA.connect(master);
      busB = ctx.createGain(); busB.gain.value = 0; busB.connect(master);
      if (ctx.createAnalyser){ ana = ctx.createAnalyser(); ana.fftSize = 1024; master.connect(ana); }
      muted = lsGet() === '1';
      ready = true;
      applyMute(true);
      syncBtn();
    } catch(e){ ready = false; return false; }
    return true;
  }

  return {
    /* 首次点击 / 按键后调用：只建图，不出声 */
    attach(c){ if (c) ctx = c; return init(); },
    start(){
      if (!init()) return;
      if (ctx.resume && ctx.state !== 'running') { try { ctx.resume(); } catch(e){} }
      if (!playing){ playing = true; timer = setInterval(tick, TICK); }
      // 重开一局：从头绕圈，别把上一局的「下车」尾声带进来
      step = 0; ending = false; era = 0;
      busA.gain.value = 1; busB.gain.value = 0; busOn = 0;
      nextT = Math.max(nextT, ctx.currentTime + 0.08);
      fadeIn();
    },
    stop(){ if (timer){ clearInterval(timer); timer = null; } playing = false; },
    setEra(e){
      e = e | 0;
      if (e < 0 || e > 5) return;
      if (e === era && !ending) return;
      era = e;
      if (ending){ ending = false; if (playing) cross(); return; }
      if (playing) cross();
    },
    setEnd(){ if (ending) return; ending = true; if (playing) cross(); },
    toggleMute(){ muted = !muted; lsSet(muted ? '1' : '0'); applyMute(); syncBtn(); },
    isMuted(){ return muted; },
    syncBtn,
    meter(){
      if (!ana) return null;
      const d = new Uint8Array(ana.fftSize);
      ana.getByteTimeDomainData(d);
      let p = 0, sum = 0;
      for (let i = 0; i < d.length; i++){ const v = (d[i] - 128) / 128; p = Math.max(p, Math.abs(v)); sum += v * v; }
      return { peak: +p.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(3) };
    },
    debug(){
      return {
        ready, playing, muted, era, ending, step,
        state: ctx ? ctx.state : 'none',
        master: master ? +master.gain.value.toFixed(3) : null,
        busA: busA ? +busA.gain.value.toFixed(2) : null,
        busB: busB ? +busB.gain.value.toFixed(2) : null,
      };
    },
  };
})();

/* ══════════ 玩家角色 ══════════ */
function makePlayer(){
  const g = new THREE.Group();
  const COL = {
    shirt:'#c8342b', pants:'#232a35', skin:'#e0a882', dark:'#14161a', acc:'#f2d24b',
    shoe:'#1b1d22', hair:'#14161a'
  };
  // 一点自发光：最后一站「灯全灭」时，人不至于变成一团黑
  const M = (c,e) => new THREE.MeshLambertMaterial({ color:c, flatShading:true,
    emissive: new THREE.Color(e || 0x000000), emissiveIntensity: 1 });
  const matShirt = M(COL.shirt,'#3a1210'), matPants = M(COL.pants,'#0d1118'), matSkin = M(COL.skin,'#241a12');
  const matDark = M(COL.dark,'#0a0c10'), matAcc = M(COL.acc,'#3d3208'), matShoe = M(COL.shoe,'#090a0d'), matHair = M(COL.hair,'#0a0c10');
  const add = (parent, w,h,d, x,y,z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); parent.add(m); return m;
  };

  const root = new THREE.Group(); g.add(root);
  add(root, .34,.16,.20, 0,.80,0, matPants);
  const torso = new THREE.Group(); torso.position.set(0,.80,0); root.add(torso);
  torso.rotation.x = -0.10;   // 前倾（角色朝 -z 跑）
  add(torso, .40,.52,.24, 0,.28,0, matShirt);
  add(torso, .40,.10,.24, 0,.02,0, matPants);
  add(torso, .42,.06,.25, 0,.50,0, matAcc);
  add(torso, .30,.16,.22, 0,.56,0, matSkin);

  const head = new THREE.Group(); head.position.set(0,.68,0); torso.add(head);
  add(head, .31,.32,.30, 0,.16,0, matSkin);
  add(head, .33,.11,.32, 0,.29,0, matHair);
  add(head, .36,.10,.10, 0,.24,.14, matHair);   // 后脑勺在 +z
  add(head, .06,.05,.02, -.085,.17,-.155, matDark);
  add(head, .06,.05,.02,  .085,.17,-.155, matDark);

  const mkArm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx*.26,.46,0); torso.add(sh);
    add(sh, .11,.28,.12, 0,-.13,0, matShirt);
    const el = new THREE.Group(); el.position.set(0,-.26,0); sh.add(el);
    add(el, .10,.26,.11, 0,-.13,0, matSkin);
    add(el, .11,.07,.12, 0,-.26,0, matAcc);
    return { sh, el };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx*.11,.80,0); root.add(hip);
    add(hip, .16,.42,.17, 0,-.21,0, matPants);
    const kn = new THREE.Group(); kn.position.set(0,-.42,0); hip.add(kn);
    add(kn, .15,.40,.16, 0,-.20,0, matPants);
    add(kn, .14,.09,.28, 0,-.40,-.04, matShoe);
    add(kn, .14,.03,.29, 0,-.44,-.04, matAcc);
    return { hip, kn };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // 软阴影：硬边黑圆片像一块悬浮的板
  const SN=64, sd=new Uint8Array(SN*SN*4);
  for (let y=0;y<SN;y++) for (let x=0;x<SN;x++){
    const r=Math.hypot(x-(SN-1)/2, y-(SN-1)/2)/((SN-1)/2);
    // 0.6 次方：平方/1.5 次方只留下脚底一小点（人看着像悬着），
    // 但平铺又硬得像一个洞 —— 实测 0.6 才是「软但有」的那一档
    const a=Math.max(0,1-r), v=Math.round(255*Math.pow(a,0.6)), i=(y*SN+x)*4;
    sd[i]=sd[i+1]=sd[i+2]=v; sd[i+3]=255;
  }
  const shTex=new THREE.DataTexture(sd,SN,SN,THREE.RGBAFormat);
  shTex.magFilter=THREE.LinearFilter; shTex.minFilter=THREE.LinearFilter; shTex.needsUpdate=true;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.66, 22),
    new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.44, alphaMap:shTex, depthWrite:false })
  );
  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = 0.02;
  g.add(shadow);

  scene.add(g);
  return { g, root, torso, head, armL, armR, legL, legR, shadow };
}

/* ══════════ 她们：两个不说话的剪影 ══════════ */
function makePairFigure(which){
  const cool = which === 0;
  const bodyC = cool ? '#8ab0e8' : '#d08a5a';
  const trimC = cool ? '#9fc0ea' : '#f0bd7e';
  // 半透明：她们是记忆里跑在前面的人，不该挡住你要看的路
  const M = (c, e, op) => new THREE.MeshLambertMaterial({ color:c, flatShading:true,
    transparent:op < 1, opacity:op, emissive:new THREE.Color(e || 0x000000),
    emissiveIntensity:0.7, depthWrite:op >= 1 });
  // 身体半透明（不挡路），头和领口实一点（还看得出是两个人）
  const mBody = M(bodyC, cool ? 0x3a6aa8 : 0x7a3a10, 0.55),
        mTrim = M(trimC, cool ? 0x3f6a9a : 0x8a5a1a, 0.62),
        mHead = M('#15151c', 0x08080c, 0.58),
        mSkin = M(cool ? '#b4bfd2' : '#d0b8a2', 0x1a1410, 0.50);
  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  const add = (p,w,h,d,x,y,z,m)=>{ const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); q.position.set(x,y,z); p.add(q); return q; };

  add(root, .30,.14,.18, 0,.74,0, mBody);
  const torso = new THREE.Group(); torso.position.set(0,.74,0); root.add(torso);
  add(torso, .36,.48,.21, 0,.26,0, mBody);
  add(torso, .38,.05,.22, 0,.47,0, mTrim);            // 领口那一点亮
  add(torso, .16,.30,.23, 0,.20,-.02, mTrim);         // 背带 / 一点色块
  const head = new THREE.Group(); head.position.set(0,.62,0); torso.add(head);
  add(head, .28,.28,.27, 0,.15,0, mHead);
  add(head, .30,.07,.29, 0,.28,0, mTrim);
  add(head, .26,.05,.10, 0,.14,.13, mSkin);           // 下颌（只给一点，不做脸）

  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx*.23,.44,0); torso.add(sh);
    add(sh, .09,.26,.10, 0,-.13,0, mBody);
    add(sh, .10,.24,.10, 0,-.36,0, mSkin);
    return sh;
  };
  const armL = arm(-1), armR = arm(1);

  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx*.10,.74,0); root.add(hip);
    add(hip, .12,.40,.13, 0,-.20,0, mBody);
    const kn = new THREE.Group(); kn.position.set(0,-.40,0); hip.add(kn);
    add(kn, .11,.36,.12, 0,-.18,0, mBody);
    add(kn, .12,.08,.24, 0,-.36,.03, mHead);
    return { hip, kn };
  };
  const legL = leg(-1), legR = leg(1);

  const halo = makeGlowSprite(trimC, 2.10, 0.50);
  halo.position.set(0, .95, -.22);
  g.add(halo);

  // 脚下的一滩软光：别再画硬边圆环，那样像站在展台上
  const foot = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 28),
    new THREE.MeshBasicMaterial({ map:glowTex(), color:trimC, transparent:true, opacity:0.26,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false })
  );
  foot.rotation.x = -Math.PI/2;
  foot.position.y = 0.012;
  g.add(foot);

  return { g, root, torso, head, armL, armR, legL, legR, halo, foot, which };
}

function buildPair(){
  pair.group = new THREE.Group();
  pair.a = makePairFigure(0);
  pair.b = makePairFigure(1);
  pair.a.g.scale.setScalar(1.30);
  pair.b.g.scale.setScalar(1.30);
  pair.group.add(pair.a.g);
  pair.group.add(pair.b.g);
  pair.haloA = pair.a.halo;
  pair.haloB = pair.b.halo;

  // 两个人之间那根线：七段，能看见松垂；紧的时候连成一条
  // 先垫一层暗线，亮线压在上面 —— 不管背后是电视还是夜空都读得出来
  for (let i=0;i<7;i++){
    const sh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.36, 0.36),
      new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.34,
        depthWrite:false, fog:false })
    );
    pair.group.add(sh);
    pair.shadowSegs.push(sh);
  }
  for (let i=0;i<7;i++){
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color:0xffd479, transparent:true, opacity:0.62,
        blending:THREE.AdditiveBlending, depthWrite:false, fog:false })
    );
    pair.group.add(m);
    pair.segs.push(m);
  }
  // 线两端的两个亮点，把线“挂”在两个人身上
  for (let i=0;i<2;i++){
    const k = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color:0xffd479, transparent:true, opacity:0.9,
        blending:THREE.AdditiveBlending, depthWrite:false, fog:false })
    );
    pair.group.add(k);
    pair.knots.push(k);
  }
  scene.add(pair.group);
}

/* ══════════ 障碍 / 磁带 / 说法 ══════════ */
const OB_KINDS = ['barrier','gate','block'];
const OB_H = { barrier:1.15, gate:2.9, block:2.4 };

let obIM = {}, obGroup = null, tapeIM = null, tapeHaloIM = null, rumorIM = null, rumorHalos = [];

/* 贴图全部现算（DataTexture），不依赖 canvas —— node 里跑测试也安全 */
function txData(w, h, fn){
  const d = new Uint8Array(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const c = fn(x, y, w, h);
    const i = (y*w+x)*4;
    d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=(c[3]===undefined?255:c[3]);
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
let _texRail=null, _texChev=null, _texScr=null, _texGrille=null, _texTape=null;

/* 拦杆：奶白底 + 朱红斜纹（跳过去的那种低栏） */
function texRail(){
  if (_texRail) return _texRail;
  _texRail = txData(96, 24, (x,y)=>{
    const on = ((x + y*0.85) % 26) < 13;
    let c = on ? [204,54,42] : [246,240,226];
    if (x < 2 || x > 93 || y < 2 || y > 21) c = [28,30,36];
    return c;
  });
  return _texRail;
}
/* 限高梁：黑黄斜纹（要从下面滑过去） */
function texChev(){
  if (_texChev) return _texChev;
  _texChev = txData(96, 24, (x,y)=>{
    const on = ((x*0.8 + y) % 24) < 12;
    let c = on ? [236,186,56] : [34,32,30];
    if (x < 2 || x > 93 || y < 2 || y > 21) c = [20,18,16];
    return c;
  });
  return _texChev;
}
/* 旧电视的彩条测试画面 */
function texScr(){
  if (_texScr) return _texScr;
  const bars = [[240,235,220],[238,206,52],[46,222,214],[54,220,96],[226,64,220],[228,66,60],[56,70,230]];
  _texScr = txData(64, 48, (x,y)=>{
    let c = bars[Math.min(6, Math.floor(x/64*7))].slice();
    if (y > 39) c = [236,236,226];
    if (y % 3 === 0) c = c.map(n=>n*0.45);
    const dx=(x/63-0.5)*2, dy=(y/47-0.5)*2;
    const vig = Math.max(0.25, 1 - (dx*dx*0.5 + dy*dy*0.55));
    return c.map(n=>Math.round(n*vig));
  });
  return _texScr;
}
/* 磁带盒面：深色壳 + 标签纸 + 两个卷盘。没有这张脸，它只是一张空白卡片 */
function texTape(){
  if (_texTape) return _texTape;
  _texTape = txData(48, 32, (x,y)=>{
    let c = [233,214,172];                                        // 暖色外壳（亮壳才看得见）
    if (x < 2 || x > 45 || y < 2 || y > 29) c = [252,240,206];     // 外壳倒角高光
    if (y >= 4 && y <= 12 && x >= 5 && x <= 42) c = [252,247,232];  // 标签纸
    if (y >= 4 && y <= 12 && x >= 5 && x <= 42 && (y === 7 || y === 9)) c = [216,196,158];
    for (const cx of [15, 32]){                                   // 两个深色卷盘
      const d = Math.hypot(x-cx, y-21.0);
      if (d < 6.6) c = [62,54,44];
      if (d < 3.4) c = [238,226,198];
      if (d < 1.7) c = [42,36,30];
    }
    if (y >= 29 && x >= 11 && x <= 36) c = [32,27,22];            // 底部磁头窗
    return c;
  });
  return _texTape;
}
function texGrille(){
  if (_texGrille) return _texGrille;
  _texGrille = txData(32, 32, (x,y)=>{
    const dot = (x%4<2 && y%4<2);
    return dot ? [104,108,116] : [22,24,28];
  });
  return _texGrille;
}

function buildEntities(){
  genEntities();

  const geoBox = new THREE.BoxGeometry(1,1,1);
  const lam = (c,o)=> new THREE.MeshLambertMaterial(Object.assign({ color:c, flatShading:true }, o||{}));
  const bas = (c,o)=> new THREE.MeshBasicMaterial(Object.assign({ color:c }, o||{}));
  const mk = (mat, n)=>{
    const im = new THREE.InstancedMesh(geoBox, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    obGroup.add(im);
    return im;
  };
  obGroup = new THREE.Group();
  obGroup.name = 'obstacles';
  scene.add(obGroup);

  /* 拦杆：两根细腿 + 一道红白板 + 顶灯，看得见天空，一眼能读出“跳” */
  const B = obstacles.filter(o=>o.kind==='barrier');
  if (B.length){
    const P = {
      rail: mk(lam(0xffffff,{ map:texRail(), emissive:0x180806 }), B.length),
      top:  mk(lam(0x23262c), B.length),
      leg:  mk(lam(0x2a2e36), B.length*2),
      foot: mk(lam(0x181b21), B.length*2),
      lamp: mk(bas(0xffffff), B.length),
    };
    B.forEach((o,i)=>{
      const e = Math.max(0, Math.min(ERAS.length-1, Math.floor(-o.z/ERA_LEN)));
      P.lamp.setColorAt(i, new THREE.Color(ERAS[e].accent));
    });
    if (P.lamp.instanceColor) P.lamp.instanceColor.needsUpdate = true;
    obIM.barrier = { list:B, parts:P };
  }

  /* 限高梁：悬空黑黄梁 + 垂下的软条，底下是空的，能滑 */
  const G = obstacles.filter(o=>o.kind==='gate');
  if (G.length){
    const P = {
      beam: mk(lam(0xffffff,{ map:texChev(), emissive:0x1c1606 }), G.length),
      board: mk(lam(0xffffff,{ map:texChev(), emissive:0x1c1606 }), G.length),
      chain: mk(lam(0x2a2e36), G.length*2),
      post: mk(lam(0x2a2e36), G.length),
      lamp: mk(bas(0xff7a48), G.length*2),
    };
    // 板面固定用黑黄警示条 —— 不管哪一站都读得懂“低头”
    obIM.gate = { list:G, parts:P };
  }

  /* 障碍块：木托盘 + 两台旧电视 + 一只音箱，屏幕是亮着的彩条 */
  const K = obstacles.filter(o=>o.kind==='block');
  if (K.length){
    const P = {
      pallet: mk(lam(0x4a3a2b), K.length),
      tv1: mk(lam(0x23262c), K.length),
      scr1: mk(bas(0xffffff,{ map:texScr() }), K.length),
      tv2: mk(lam(0x2b2f36), K.length),
      scr2: mk(bas(0xffffff,{ map:texScr() }), K.length),
      amp: mk(lam(0x1e2126), K.length),
      grille: mk(bas(0xffffff,{ map:texGrille() }), K.length),
      back: mk(lam(0x8a7658), K.length),
      knob: mk(bas(0xd8d2c4), K.length*2),
    };
    obIM.block = { list:K, parts:P };
  }

  // 磁带（本体 + 一层软光晕）
  // 盒面有「两个卷盘 + 标签纸」，才读得出是磁带；自发光材质，夜里也看得见
  const tapeGeo = new THREE.BoxGeometry(0.50, 0.34, 0.13);
  const tapeMat = new THREE.MeshBasicMaterial({ map:texTape(), color:0xffffff });
  tapeIM = new THREE.InstancedMesh(tapeGeo, tapeMat, tapeData.length);
  tapeIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tapeIM.frustumCulled = false;
  scene.add(tapeIM);

  tapeHaloIM = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.72, 0.55),
    new THREE.MeshBasicMaterial({ map:glowTex(), color:0xffd479, transparent:true, opacity:0.20,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }),
    tapeData.length
  );
  tapeHaloIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tapeHaloIM.frustumCulled = false;
  scene.add(tapeHaloIM);

  buildRumor();
  placeObstacles();
}

function buildRumor(){
  if (!rumorData.length) return;
  const geo = new THREE.OctahedronGeometry(0.26, 0);
  const mat = new THREE.MeshBasicMaterial({ color:0xffffff });
  rumorIM = new THREE.InstancedMesh(geo, mat, rumorData.length);
  rumorIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rumorIM.frustumCulled = false;
  if (rumorIM.setColorAt){
    rumorData.forEach((r,i)=> rumorIM.setColorAt(i, new THREE.Color(
      r.idx === 0 ? 0xff7a8a : r.idx === 1 ? 0x9fc0ff : 0xd7b6ff)));
    if (rumorIM.instanceColor) rumorIM.instanceColor.needsUpdate = true;
  }
  scene.add(rumorIM);
  rumorData.forEach((r)=>{
    const s = makeGlowSprite(r.idx === 0 ? '#ff7a8a' : r.idx === 1 ? '#9fc0ff' : '#d7b6ff', 1.5, 0.42);
    s.position.set(LANE_X[r.lane], ROOF_Y + 1.55, r.z);
    scene.add(s);
    rumorHalos.push(s);
  });
}

const _mm = new THREE.Matrix4();
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();
const _dp = new THREE.Vector3();
const _ds = new THREE.Vector3();

function obSet(im, i, x,y,z, sx,sy,sz, ry){
  _dp.set(x,y,z); _ds.set(sx,sy,sz);
  if (ry) _qq.setFromEuler(_ee.set(0,ry,0)); else _qq.set(0,0,0,1);
  _mm.compose(_dp, _qq, _ds);
  im.setMatrixAt(i, _mm);
}

function placeObstacles(){
  const B = obIM.barrier;
  if (B && B.parts){
    const P = B.parts;
    B.list.forEach((o,i)=>{
      const x = LANE_X[o.lane], z = o.z;
      obSet(P.rail, i, x, ROOF_Y+0.80, z, 2.30, 0.46, 0.08);
      obSet(P.top,  i, x, ROOF_Y+1.09, z, 2.44, 0.10, 0.17);
      obSet(P.leg, i*2,   x-1.10, ROOF_Y+0.40, z, 0.12, 0.80, 0.15);
      obSet(P.leg, i*2+1, x+1.10, ROOF_Y+0.40, z, 0.12, 0.80, 0.15);
      obSet(P.foot, i*2,   x-1.10, ROOF_Y+0.03, z, 0.36, 0.06, 0.48);
      obSet(P.foot, i*2+1, x+1.10, ROOF_Y+0.03, z, 0.36, 0.06, 0.48);
      obSet(P.lamp, i, x, ROOF_Y+1.17, z, 0.16, 0.11, 0.13);
    });
    [P.rail,P.top,P.leg,P.foot,P.lamp].forEach(im=> im.instanceMatrix.needsUpdate = true);
  }
  const G = obIM.gate;
  if (G && G.parts){
    const P = G.parts;
    G.list.forEach((o,i)=>{
      const x = LANE_X[o.lane], z = o.z;
      obSet(P.beam, i, x, ROOF_Y+1.72, z, 2.44, 0.28, 0.28);
      // 不是一排栅栏，是三条吊在胸口高度的软性警示板：从下面滑过去
      obSet(P.board, i, x, ROOF_Y+1.22, z, 0.92, 0.42, 0.06);
      obSet(P.chain, i*2,   x-0.34, ROOF_Y+1.50, z, 0.035, 0.16, 0.035);
      obSet(P.chain, i*2+1, x+0.34, ROOF_Y+1.50, z, 0.035, 0.16, 0.035);
      // 只在最外道立两根细柱子，把整排横梁框成一道“门”，中间留空
      if (o.lane === 1) { _mm.makeScale(1e-4,1e-4,1e-4); P.post.setMatrixAt(i,_mm); }
      else obSet(P.post, i, x + (o.lane === 0 ? -3.72 : 3.72), ROOF_Y+0.97, z, 0.10, 1.94, 0.10);
      obSet(P.lamp, i*2,   x-1.02, ROOF_Y+1.90, z, 0.12, 0.10, 0.14);
      obSet(P.lamp, i*2+1, x+1.02, ROOF_Y+1.90, z, 0.12, 0.10, 0.14);
    });
    [P.beam,P.chain,P.board,P.post,P.lamp].forEach(im=> im.instanceMatrix.needsUpdate = true);
  }
  const K = obIM.block;
  if (K && K.parts){
    const P = K.parts;
    K.list.forEach((o,i)=>{
      const x = LANE_X[o.lane], z = o.z;
      obSet(P.pallet, i, x, ROOF_Y+0.07, z, 1.66, 0.14, 1.18);
      obSet(P.tv1, i, x, ROOF_Y+0.61, z, 1.56, 0.92, 0.96);
      obSet(P.scr1, i, x, ROOF_Y+0.66, z+0.49, 1.26, 0.62, 0.05);
      obSet(P.tv2, i, x+0.02, ROOF_Y+1.52, z+0.02, 1.22, 0.80, 0.84);
      obSet(P.scr2, i, x+0.02, ROOF_Y+1.55, z+0.455, 0.94, 0.50, 0.05);
      obSet(P.back, i, x, ROOF_Y+1.40, z-0.52, 1.90, 2.80, 0.14);
      obSet(P.amp, i, x-0.02, ROOF_Y+2.14, z-0.02, 1.06, 0.44, 0.66);
      obSet(P.grille, i, x-0.02, ROOF_Y+2.12, z+0.32, 0.84, 0.28, 0.04);
      obSet(P.knob, i*2,   x-0.70, ROOF_Y+0.64, z+0.49, 0.07, 0.07, 0.05);
      obSet(P.knob, i*2+1, x, ROOF_Y+2.62, z-0.44, 1.94, 0.22, 0.18);   // 墙顶的警示横条
    });
    [P.pallet,P.tv1,P.scr1,P.tv2,P.scr2,P.amp,P.grille,P.knob,P.back].forEach(im=> im.instanceMatrix.needsUpdate = true);
  }
}

function hideObstacle(o){
  const rec = obIM[o.kind]; if (!rec || !rec.parts) return;
  const i = rec.list.indexOf(o); if (i < 0) return;
  _mm.makeScale(0.0001, 0.0001, 0.0001);
  const P = rec.parts, kill=(im,idx)=>{ im.setMatrixAt(idx,_mm); im.instanceMatrix.needsUpdate = true; };
  if (o.kind === 'barrier'){
    kill(P.rail,i); kill(P.top,i); kill(P.leg,i*2); kill(P.leg,i*2+1);
    kill(P.foot,i*2); kill(P.foot,i*2+1); kill(P.lamp,i);
  } else if (o.kind === 'gate'){
    kill(P.beam,i);
    kill(P.board,i);
    kill(P.chain,i*2); kill(P.chain,i*2+1);
    kill(P.post,i);
    kill(P.lamp,i*2); kill(P.lamp,i*2+1);
  } else {
    [P.pallet,P.tv1,P.scr1,P.tv2,P.scr2,P.amp,P.grille,P.back].forEach(im=> kill(im,i));
    kill(P.knob,i*2); kill(P.knob,i*2+1);
  }
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
  camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 320);   // 天空球 240，务必留余量
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
  const fill2 = new THREE.DirectionalLight(0xffd0a0, 0.28);
  fill2.position.set(6, 3, -6);
  scene.add(fill2);
  scene.userData.fill = fill;
  scene.userData.fill2 = fill2;

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
  buildPair();
  buildRing();
  applyEra(0, 0, 1);
  pair.group.visible = false;
}

/* 结局用的环形轨道 */
function buildRing(){
  ringGroup = new THREE.Group();
  ringGroup.visible = false;
  const R = 46;

  // 轨道本体：亮一点，不然俯视时只剩几条暗线
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.85, 8, 120),
    new THREE.MeshBasicMaterial({ color:0xd0c0f0, fog:false })
  );
  torus.rotation.x = Math.PI/2;
  ringGroup.add(torus);

  // 轨道的加色光晕（略大一圈）
  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(R, 1.9, 8, 120),
    new THREE.MeshBasicMaterial({ color:0x6a5f8a, transparent:true, opacity:0.22,
      blending:THREE.AdditiveBlending, depthWrite:false, fog:false })
  );
  glowRing.rotation.x = Math.PI/2;
  ringGroup.add(glowRing);

  // 轨枕：一圈短线
  const tieGeo = new THREE.BoxGeometry(0.5, 0.12, 4.2);
  const tieMat = new THREE.MeshBasicMaterial({ color:0x5a5270, fog:false });
  const tieIM = new THREE.InstancedMesh(tieGeo, tieMat, 72);
  tieIM.frustumCulled = false;
  for (let i=0;i<72;i++){
    const a = i/72*Math.PI*2;
    const D = new THREE.Vector3(Math.cos(a)*R, 0, Math.sin(a)*R);
    const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0));
    _mm.compose(D, Q, new THREE.Vector3(1,1,1));
    tieIM.setMatrixAt(i, _mm);
  }
  tieIM.instanceMatrix.needsUpdate = true;
  ringGroup.add(tieIM);

  // 轨道上的小车厢
  const dots = new THREE.Group();
  for (let i=0;i<9;i++){
    const a = i/9*Math.PI*2;
    const d = new THREE.Mesh(new THREE.BoxGeometry(2.4,1.4,5.0),
      new THREE.MeshBasicMaterial({ color:0xffd479, fog:false }));
    d.position.set(Math.cos(a)*R, 0.75, Math.sin(a)*R);
    d.rotation.y = -a;
    dots.add(d);
    const s = makeGlowSprite('#ffd479', 7.5, 0.34);
    s.position.set(Math.cos(a)*R, 0.9, Math.sin(a)*R);
    dots.add(s);
  }
  ringGroup.add(dots);
  ringGroup.userData.dots = dots;

  // 星点：让俯视图不是纯黑
  const N = 420, pos = new Float32Array(N*3);
  for (let i=0;i<N;i++){
    const a = Math.random()*Math.PI*2, r = 60 + Math.random()*90;
    pos[i*3] = Math.cos(a)*r;
    pos[i*3+1] = -20 + Math.random()*60;
    pos[i*3+2] = Math.sin(a)*r;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({
    color:0xb8a8e0, size:0.9, transparent:true, opacity:0.7, depthWrite:false, fog:false,
    map: glowTex(), alphaTest: 0.05, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  ringGroup.add(stars);

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

  skyMat.uniforms.uTop.value.copy(col(A.skyTop, B.skyTop));
  skyMat.uniforms.uBot.value.copy(col(A.skyBot, B.skyBot));
  skyMat.uniforms.uSun.value.copy(col(A.sun, B.sun));
  skyMat.uniforms.uSunI.value = L(A.sunI, B.sunI);

  ambLight.color.copy(col(A.amb, B.amb));
  ambLight.intensity = L(A.ambI, B.ambI);
  sunLight.color.copy(col(A.dir, B.dir));
  sunLight.intensity = L(A.dirI, B.dirI);
  scene.userData.fill.color.copy(col(A.amb, B.amb));
  scene.userData.fill.intensity = L(A.dirI, B.dirI) * 0.26;
  scene.userData.fill2.color.copy(col(A.sun, B.sun));
  scene.userData.fill2.intensity = L(A.sunI, B.sunI) * 0.30;

  pMat.color.copy(col(A.pcol, B.pcol));
  renderer.toneMappingExposure = L(1.12, 1.0);

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
    if (e.code === 'KeyM'){ e.preventDefault(); MUSIC.toggleMute(); }
  });
  window.addEventListener('blur', () => { player.slideHold = 0; for (const k in keys) keys[k] = false; });
  window.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') player.slideHold = 0;
  });

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
    else tapSlide();
    touchStart = null;
  }, { passive:true });
}

function tryLane(d){
  if (G.state !== 'playing') return;
  const n = Math.max(0, Math.min(2, player.lane + d));
  if (n !== player.lane){ player.lane = n; player.lean = -d*0.5; }
}
let jumpBuf = 0, slideBuf = 0;   // 提前按下的键，落地后自动补上

function tryJump(){
  if (G.state !== 'playing') return;
  if (!player.jumping){
    // 起跳永远优先：正在滑铲也能立刻打断，不再锁住
    player.jumping = true; player.vy = JUMP_V;
    player.slide = 0; player.slideT = 0; player.slideHold = 0;
    sfxJump();
    trauma = Math.min(1, trauma + 0.10);
  } else {
    jumpBuf = 0.18;
  }
}
function tapSlide(){
  if (G.state !== 'playing') return;
  if (!player.jumping){
    player.slide = Math.max(player.slide, 0.85);
    player.slideT = 0; player.slideHold = 0;
  } else {
    player.vy = Math.min(player.vy, -9);
    slideBuf = 0.18;
  }
}
function trySlide(){
  if (G.state !== 'playing') return;
  if (!player.jumping){
    player.slide = Math.max(player.slide, 0.55);
    player.slideT = 0; player.slideHold = 1;   // 按住就一直滑
  } else {
    player.vy = Math.min(player.vy, -9);        // 空中按下：快速下坠
    slideBuf = 0.18;                            // 落地瞬间接滑铲
  }
}

/* ══════════ 主循环 ══════════ */
function update(dt){
  if (G.state === 'title'){ renderIdle(dt); return; }
  if (G.state === 'reveal'){ updateReveal(dt); return; }
  if (G.state === 'result'){ return; }

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
    MUSIC.setEra(newEra);
    eraMix = { from: eraMix.to, to: newEra, t: 0 };
    sfxEra(); G.flash = 0.9;
    showCaption(ERAS[newEra].year, ERAS[newEra].tag);
    st.perEra[newEra] = true;
    enterPairEra(newEra);
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
  if (jumpBuf > 0) jumpBuf -= dt;
  if (slideBuf > 0) slideBuf -= dt;
  if (player.jumping){
    player.vy -= GRAV * dt;
    player.y += player.vy * dt;
    if (player.y <= 0){
      player.y = 0; player.vy = 0; player.jumping = false;
      trauma = Math.min(1, trauma + 0.22);
      if (slideBuf > 0){ slideBuf = 0; player.slide = 0.55; player.slideT = 0; }
      else if (jumpBuf > 0){ jumpBuf = 0; player.jumping = true; player.vy = JUMP_V; sfxJump(); }
    }
  }
  // 按住下键就保持滑铲（最长 1.6 秒），松开才站起来
  if (player.slideHold && !player.jumping){
    player.slideT += dt;
    if (player.slideT < 1.6) player.slide = Math.max(player.slide, 0.10);
  }
  if (player.slide > 0){
    player.slide -= dt;
    if (player.slide <= 0){
      player.slide = 0;
      if (!player.slideHold) player.slideT = 0;   // 按住时不清零，避免无限滑
    }
  }

  // 跑步动画
  player.runPhase += dt * (G.speed * 0.72);
  animatePlayer(dt);
  updatePair(dt);

  // 碰撞
  collide();
  if (G.state !== 'playing') return;   // 撞到第三次，这一局结束了

  // 相机
  const shakeAmt = trauma * trauma;
  const sx = (Math.random()-0.5) * 0.35 * shakeAmt;
  const sy = (Math.random()-0.5) * 0.35 * shakeAmt;
  const camTargetX = player.x * 0.55;
  camX += (camTargetX - camX) * Math.min(1, 9*dt);
  camY += ((ROOF_Y + 2.70 + player.y*0.42) - camY) * Math.min(1, 6*dt);
  const camBack = 6.4 + (camera.aspect < 1 ? (1-camera.aspect)*2.4 : 0);
  camera.position.set(camX + sx, camY + sy, player.z + camBack);
  const lx = player.x * 0.42;
  camLookX += (lx - camLookX) * Math.min(1, 14*dt);
  camera.lookAt(camLookX, ROOF_Y + 1.00 + player.y*0.35, player.z - 15);
  camera.rotation.z += player.lean * 0.06 + (Math.random()-0.5)*0.02*shakeAmt;
  if (pair.bond < 22 && pair.mode !== 'none') camera.rotation.z += (Math.random()-0.5)*0.006;

  const asp = camera.aspect;
  const portBoost = asp < 1 ? (1 + (1-asp)*0.18) : 1;
  const fovTarget = (58 + 18 * (G.speed - SPEED0) / (SPEED1 - SPEED0)) * portBoost;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, 3*dt);
  camera.updateProjectionMatrix();

  // 天空跟随
  skyMesh.position.copy(camera.position);

  // 粒子
  updateParticles(dt);
  updateRumor(dt);
  trauma = Math.max(0, trauma - 1.8*dt);
  G.flash = Math.max(0, G.flash - dt*2.6);

  checkTimeline();

  // 分数：同框越紧，里程越值钱
  st.score += G.speed * dt * 10 * bondMult();
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
    // 跪滑：光把上身压下去，腿还是直的，看着像"弯腰站着"。
    // 髋部一起下沉、双腿折叠，整体剪影才矮得下来。
    v.root.rotation.x = -0.95;
    v.root.position.y = -0.20;
    v.torso.rotation.x = -0.06;
    v.legL.hip.rotation.x = 1.62; v.legR.hip.rotation.x = 1.38;
    v.legL.kn.rotation.x  = 2.20; v.legR.kn.rotation.x  = 2.00;
    v.legL.hip.rotation.z = -0.20; v.legR.hip.rotation.z = 0.18;
    v.armL.sh.rotation.x = 0.42; v.armR.sh.rotation.x = 0.26;   // 手臂往后贴地，不是举手
    v.armL.sh.rotation.z = -0.16; v.armR.sh.rotation.z = 0.16;
    v.armL.el.rotation.x = -0.30; v.armR.el.rotation.x = -0.22;
  } else {
    v.root.rotation.x = 0;
    v.legL.kn.rotation.x = 0; v.legR.kn.rotation.x = 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    v.legL.hip.rotation.x = s * 0.95;
    v.legR.hip.rotation.x = -s * 0.95;
    v.legL.kn.rotation.x = Math.max(0, -c) * 1.15;
    v.legR.kn.rotation.x = Math.max(0,  c) * 1.15;
    // 从正后方看，前后摆腿几乎看不出来 —— 给一点外撇和胯部侧摆，剪影才像在跑
    v.legL.hip.rotation.z = -0.06 - Math.max(0,  s)*0.10;
    v.legR.hip.rotation.z =  0.06 + Math.max(0, -s)*0.10;
    v.armL.sh.rotation.x = -s * 0.8;
    v.armR.sh.rotation.x = s * 0.8;
    v.armL.sh.rotation.z = -0.10 - Math.max(0, s)*0.10;
    v.armR.sh.rotation.z =  0.10 + Math.max(0,-s)*0.10;
    v.armL.el.rotation.x = -0.5 - Math.max(0,s)*0.5;
    v.armR.el.rotation.x = -0.5 - Math.max(0,-s)*0.5;
    v.torso.rotation.x = 0.10;
    v.torso.rotation.y = s * 0.08;
    v.root.rotation.z = Math.sin(ph) * 0.035;
  }

  v.shadow.position.y = 0.02 - player.y;
  const sc = Math.max(0.35, 1 - player.y*0.32);
  v.shadow.scale.set(sc, sc, sc);
  v.shadow.material.opacity = 0.44 * sc;
}

/* ══════════ 同框：两个人在前面跑，你在不在他们中间 ══════════ */
function enterPairEra(e){
  const cfg = PAIR_ERA[e];
  pair.mode = cfg.mode;
  pair.gap = cfg.gap;
  pair.lane = 1;
  pair.cx = 0;
  pair.laneT = 2.6 + Math.random()*1.4;
  if (cfg.mode === 'both' && e === 4) pair.bond = Math.min(BOND_MAX, pair.bond + 6);
  if (cfg.mode === 'none'){
    pair.group.visible = false;
    toast('这一站，站台是空的');
  } else {
    pair.group.visible = true;
  }
  updateHUD();
}

function pairThink(dt){
  if (pair.mode === 'none') return;
  pair.laneT -= dt;
  if (pair.laneT > 0) return;
  pair.laneT = 2.2 + Math.random()*1.8;
  const pz = player.z - PAIR_AHEAD;
  const safe = [];
  for (let l=0;l<3;l++){
    let ok = true;
    for (let i=0;i<obstacles.length;i++){
      const o = obstacles[i];
      if (o.lane !== l) continue;
      const dz = o.z - pz;
      if (dz > -4 && dz < 18){ ok = false; break; }
    }
    if (ok) safe.push(l);
  }
  if (!safe.length) return;
  safe.sort((a,b)=> Math.abs(a-pair.lane) - Math.abs(b-pair.lane));
  // 大多数时候就近躲一下；偶尔她也说不清要往哪边
  pair.lane = (Math.random() < 0.24 && safe.length > 1) ? safe[(Math.random()*safe.length)|0] : safe[0];
}

/* 剪影不会穿模：眼前 12 米内那条道上有东西，她立刻换一条 */
function pairDodgeNow(){
  const pz = player.z - PAIR_AHEAD;
  let block = false;
  for (let i=0;i<obstacles.length;i++){
    const o = obstacles[i];
    if (o.hit || o.passed) continue;
    if (o.lane !== pair.lane) continue;
    const dz = o.z - pz;
    if (dz > -2.5 && dz < 12){ block = true; break; }
  }
  if (!block) return;
  for (let l=0;l<3;l++){
    if (l === pair.lane) continue;
    let ok = true;
    for (let i=0;i<obstacles.length;i++){
      const o = obstacles[i];
      if (o.hit || o.passed) continue;
      if (o.lane !== l) continue;
      const dz = o.z - pz;
      if (dz > -2.5 && dz < 14){ ok = false; break; }
    }
    if (ok){ pair.lane = l; pair.laneT = 2.0 + Math.random()*1.2; return; }
  }
}

function updatePair(dt){
  if (!pair.group) return;
  const cfg = PAIR_ERA[G.era];
  pair.mode = cfg.mode;

  if (pair.mode === 'none'){
    pair.group.visible = false;
    pair.inFrame = false;
    return;
  }
  pair.group.visible = true;
  // 她俩不是钉在轨道上的：偶尔抢半步、偶尔被甩开一点
  const surge = Math.sin(G.t*1.15)*0.26 + Math.sin(G.t*2.55 + 1.1)*0.09;
  pair.z = player.z - PAIR_AHEAD - surge;
  pairThink(dt);
  pairDodgeNow();

  // 间距：你在，线就收一点；你不在，它自己撕开；时代本身也在撕
  if (pair.mode === 'both'){
    pair.gap -= (pair.inFrame ? 0.16 : -0.055) * dt;     // 帧内收，帧外慢慢开
    pair.gap += cfg.drift * dt * (pair.inFrame ? 1.15 : 2.15);
  } else {
    pair.gap = Math.max(0.55, pair.gap - 0.10*dt);
  }
  pair.gap = Math.max(0.55, Math.min(cfg.gapMax, pair.gap));

  // 两人中点：间距越小，越可以待在任意一条道上；间距越大，越被压回中线
  const k = Math.max(0, 1 - pair.gap/4.2);
  const targetCx = LANE_X[pair.lane] * k;
  pair.cx += (targetCx - pair.cx) * Math.min(1, 2.6*dt);

  const tol = pairTol(pair.gap);
  const wasFrame = pair.inFrame;
  pair.inFrame = Math.abs(player.x - pair.cx) <= tol;

  // 同框值
  if (pair.mode === 'both'){
    pair.bond += (pair.inFrame ? cfg.inRate : -cfg.outRate) * dt;
  } else {
    pair.bond += (pair.inFrame ? -2.0 : -cfg.outRate) * dt;
  }
  pair.bond -= cfg.extra * dt;
  const before = pair.bond;
  pair.bond = Math.max(0, Math.min(BOND_MAX, pair.bond));

  // 阈值提示
  if (wasFrame !== pair.inFrame){
    if (pair.inFrame) sfxNear(); else sfxBondBreak();
  }
  if (before >= 88 && pair.bond < 88) toast('线松了');
  if (before >= 20 && pair.bond < 20) toast('画面散了');
  if (before < 88 && pair.bond >= 88 && !pair.used) toast('线是紧的 · 可以挡一下');

  pair.armed = pair.bond >= 88 && !pair.used;
  if (pair.bond < 20 && pair.flash <= 0){ pair.flash = 0.9; }

  placePair(dt);
}

function placePair(dt){
  const A = pair.a, B = pair.b;
  pair.runT += dt * Math.max(3.0, G.speed * 0.68);

  const cx = pair.cx, g = pair.gap;
  const x1 = cx - g/2, x2 = cx + g/2;
  const z = pair.z;

  A.g.position.set(x1, ROOF_Y, z);
  B.g.position.set(x2, ROOF_Y, z);
  A.g.rotation.y = 0; B.g.rotation.y = 0;
  A.g.visible = true;
  B.g.visible = pair.mode === 'both';

  const ph = pair.runT;
  const ph2 = pair.runT + 1.7;
  const pose = (F, p) => {
    const s = Math.sin(p), c = Math.cos(p);
    F.legL.hip.rotation.x = s*1.08;
    F.legR.hip.rotation.x = -s*1.08;
    F.legL.kn.rotation.x = Math.max(0,-c)*1.32;
    F.legR.kn.rotation.x = Math.max(0, c)*1.32;
    F.armL.rotation.x = -s*0.98;
    F.armR.rotation.x = s*0.98;
    F.root.position.y = Math.abs(s)*0.078;
    F.root.position.x = s*0.016;
    F.torso.rotation.x = -0.16;          // 朝 -z 跑，负角度才是往前压
    F.torso.rotation.y = s*0.10;
    F.head.rotation.x = -0.06;
  };
  pose(A, ph);
  if (B.g.visible) pose(B, ph2);

  // 光晕 / 脚下软光：同框越紧越亮
  const glow = 0.30 + pair.bond/100*0.40;
  A.halo.material.opacity = glow;
  B.halo.material.opacity = glow;
  A.foot.material.opacity = 0.14 + pair.bond/100*0.18;
  B.foot.material.opacity = A.foot.material.opacity;
  A.foot.visible = pair.mode !== 'none';
  B.foot.visible = pair.mode === 'both';

  // 那根线：从一个人腰上挂到另一个人腰上，松了就垂下去、断成虚线
  const segOn = pair.mode === 'both';
  const tight = 1 - pair.bond/100;
  const sag = 0.03 + tight*0.12;
  const baseY = ROOF_Y + 1.34;
  const ac = new THREE.Color(curPal ? curPal.accent : '#ffb35c');
  const N = pair.segs.length;
  for (let i=0;i<N;i++){
    const m = pair.segs[i], sh = pair.shadowSegs[i];
    if (!segOn){ m.visible = false; sh.visible = false; continue; }
    const t0 = i/N, t1 = (i+1)/N;
    const px0 = x1 + g*t0, px1 = x1 + g*t1;
    const py0 = baseY - Math.sin(Math.PI*t0)*sag;
    const py1 = baseY - Math.sin(Math.PI*t1)*sag;
    const broken = pair.bond < 44 && (i % 2 === 1) && (Math.sin(pair.runT*0.7 + i*1.9) > 0.0);
    m.visible = !broken; sh.visible = !broken;
    if (broken) continue;
    const mx = (px0+px1)/2, my = (py0+py1)/2, len = Math.hypot(px1-px0, py1-py0)*1.01;
    const rz = Math.atan2(py1-py0, px1-px0);
    m.position.set(mx, my, z); m.rotation.z = rz; m.scale.set(len, 1, 1);
    sh.position.set(mx, my, z); sh.rotation.z = rz; sh.scale.set(len, 1, 1);
    m.material.opacity = (0.52 + pair.bond/100*0.42) * (pair.bond < 22 ? 0.55 : 1);
    m.material.color.set(0xfff0d6);
  }
  pair.knots.forEach((k, i)=>{
    k.visible = segOn;
    if (!segOn) return;
    k.position.set(i === 0 ? x1 : x2, baseY - 0.01, z);
    k.rotation.y = pair.runT*1.3;
    k.material.opacity = 0.55 + pair.bond/100*0.4;
    k.material.color.copy(ac);
    k.scale.setScalar(0.9 + 0.18*Math.sin(pair.runT*1.8 + i*2.1));
  });
}

/* ══════════ 碰撞 ══════════ */
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
      // 已经跑过去了（z 减小，dz>0）：判定「擦身 / 越杆 / 压线」
      if (!o.passed && dz > 1.20){
        o.passed = true;
        onPass(o);
        continue;
      }
      if (dz > 3.0){ continue; }
      if (dz < -2.2){ continue; }
      const dx = Math.abs(LANE_X[o.lane] - player.x);
      if (dx > 1.30) continue;
      let hits = false;
      if (o.kind === 'barrier') hits = feet < 1.00;
      else if (o.kind === 'gate') hits = (feet + headY) > 1.55;
      else hits = (feet+headY) > 0.2;
      if (hits && Math.abs(dz) < 1.15){
        o.hit = true; o.passed = true; hideObstacle(o);
        onHit();
        if (G.state !== 'playing') return;
      }
    }
  }

  // 磁带（同框高的时候会吸过来）
  if (tapeIM){
    const magnet = pair.bond >= 70 ? 1.35 : 0;
    const lateral = 1.20 + magnet;
    for (let i=0;i<tapeData.length;i++){
      const t = tapeData[i];
      if (t.taken) continue;
      if (Math.abs(t.z - pz) < 1.3){
        if (Math.abs(LANE_X[t.lane] - player.x) < lateral &&
            Math.abs((ROOF_Y+t.y) - (ROOF_Y+feet+0.8)) < 1.45){
          t.taken = true; onPick(i);
        }
      }
    }
  }

  // 三种说法：同一道线，你只能带走一种
  if (rumorIM && pair.mode !== 'none'){
    let best = -1, bestDx = 1.15;
    for (let i=0;i<rumorData.length;i++){
      const r = rumorData[i];
      if (r.taken) continue;
      const dz = r.z - pz;
      if (dz > 1.4 || dz < -1.4) continue;
      const dx = Math.abs(LANE_X[r.lane] - player.x);
      if (dx < bestDx){ bestDx = dx; best = i; }
    }
    if (best >= 0) onRumor(rumorData[best]);
  }
}

function onHit(){
  if (G.state !== 'playing') return;
  // 同框拉满时，这条线替你挡一下
  if (pair.armed && !pair.used){
    pair.used = true; pair.armed = false;
    pair.bond = Math.max(0, pair.bond - 42);
    G.flash = 0.42; trauma = 0.75;
    st.shieldUsed++;
    sfxShield();
    toast('没散 · 挡了一下');
    updateHUD();
    return;
  }
  st.hearts--; st.combo = 0; st.hitAt = G.t;
  G.hits++; G.flash = 0.55; trauma = 1.0;
  sfxHit();
  G.pen = 0.7;
  pair.bond = Math.max(0, pair.bond - 14);
  updateHUD();
  if (st.hearts <= 0) endRun(false);
}

function onPass(o){
  const dx = Math.abs(LANE_X[o.lane] - player.x);
  let pts = 0, label = '';
  if (o.kind === 'barrier' && player.y > 0.55 && dx < 1.30){ pts = 45; label = '越杆'; }
  else if (o.kind === 'gate' && player.slide > 0 && dx < 1.30){ pts = 45; label = '压线'; }
  else if (dx > 0.90 && dx < 1.95){ pts = 28; label = '擦身'; }
  else return;

  st.combo++;
  st.bestCombo = Math.max(st.bestCombo, st.combo);
  const add = Math.round(pts * (1 + Math.min(2, st.combo*0.05)));
  st.score += add;
  if (label === '擦身') st.near++; else st.precise++;
  showPop(label + ' +' + add);
}

function onPick(i){
  st.tapes++; st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo);
  st.score += Math.round(80 * (1 + Math.min(2, st.combo*0.05)));
  // 磁带是一段记忆：拿到它，两个人会靠近一点
  pair.bond = Math.min(BOND_MAX, pair.bond + 1.2);
  pair.gap = Math.max(0.55, pair.gap - 0.08);
  sfxPick();
  _mm.makeScale(0.0001,0.0001,0.0001);
  tapeIM.setMatrixAt(i, _mm);
  tapeIM.instanceMatrix.needsUpdate = true;
  if (tapeHaloIM) tapeHaloIM.setMatrixAt(i, _mm);
  if (tapeHaloIM) tapeHaloIM.instanceMatrix.needsUpdate = true;
  toast(st.combo >= 4 ? ('磁带 +1 · 连 ×' + st.combo) : '磁带 +1');
}

function onRumor(r){
  r.taken = true;
  st.rumor = r.idx;
  st.rumorShort = RUMOR_VERSIONS[r.idx].short;
  st.score += 250;
  st.combo++;
  sfxRumor();
  const V = RUMOR_VERSIONS[r.idx];
  showTL({ y: V.y, t: V.t }, 7600);
  toast('带走了一种说法');
  updateHUD();
}

/* ══════════ 粒子 / 说法旋转 ══════════ */
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
      if (tapeHaloIM) tapeHaloIM.setMatrixAt(i, _mm);
    }
    tapeIM.instanceMatrix.needsUpdate = true;
    if (tapeHaloIM) tapeHaloIM.instanceMatrix.needsUpdate = true;
  }
}

function updateRumor(dt){
  if (!rumorIM) return;
  for (let i=0;i<rumorData.length;i++){
    const r = rumorData[i];
    const D = new THREE.Vector3(LANE_X[r.lane], ROOF_Y + 1.55 + Math.sin(G.t*1.8 + r.spin)*0.10, r.z);
    if (r.taken){ _mm.makeScale(0.0001,0.0001,0.0001); }
    else {
      _ee.set(G.t*1.2 + r.spin, G.t*2.0 + r.spin, 0.4);
      _qq.setFromEuler(_ee);
      _mm.compose(D, _qq, new THREE.Vector3(1,1,1));
    }
    rumorIM.setMatrixAt(i, _mm);
    if (rumorHalos[i]) rumorHalos[i].visible = !r.taken;
  }
  rumorIM.instanceMatrix.needsUpdate = true;
}

/* ══════════ HUD / 文案 ══════════ */
let popT = null;
function showPop(txt){
  const el = HUD.combo;
  if (!el) return;
  el.textContent = txt;
  el.classList.add('on');
  clearTimeout(popT);
  popT = setTimeout(()=> el.classList.remove('on'), 620);
  if (txt.indexOf('擦身') === 0) sfxNear();
}

function updateHUD(){
  if (HUD.score) HUD.score.textContent = Math.floor(st.score).toLocaleString('en-US');
  if (HUD.mult)  HUD.mult.textContent = '×' + bondMult();
  if (HUD.tape)  HUD.tape.textContent = st.tapes;
  if (HUD.comboMini) HUD.comboMini.textContent = '连 ' + st.combo;
  if (HUD.hearts) HUD.hearts.innerHTML = '<span>♥</span>'.repeat(Math.max(0,st.hearts)) +
    '<span class="off">♥</span>'.repeat(Math.max(0,3-st.hearts));
  if (HUD.bar) HUD.bar.style.width = Math.min(100, G.dist/(ERA_LEN*6)*100) + '%';

  if (HUD.bondFill){
    HUD.bondFill.style.width = (pair.mode === 'none' ? 0 : pair.bond) + '%';
    HUD.bondFill.classList.toggle('low', pair.bond < 22);
    HUD.bondFill.classList.toggle('armed', pair.armed);
  }
  if (HUD.bondNum){
    HUD.bondNum.textContent = pair.mode === 'none' ? '—' : Math.round(pair.bond);
  }
  if (HUD.bondGap){
    HUD.bondGap.textContent = (pair.mode === 'both') ? ('间距 ' + pair.gap.toFixed(1) + 'm') :
      (pair.mode === 'one' ? '一个人' : '空台');
  }
  if (HUD.bondTag) HUD.bondTag.textContent = pairLabel();
  if (HUD.bondWrap){
    HUD.bondWrap.classList.toggle('low', pair.bond < 22 || pair.mode === 'none');
    HUD.bondWrap.classList.toggle('out', pair.mode !== 'none' && G.state === 'playing' && !pair.inFrame);
  }
  if (HUD.rumor){
    if (st.rumor === null){ HUD.rumor.textContent = ''; HUD.rumor.classList.remove('on'); }
    else { HUD.rumor.textContent = '说法 · ' + st.rumorShort + '（未证实）'; HUD.rumor.classList.add('on'); }
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
  toastT = setTimeout(()=>el.classList.remove('on'), 950);
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
      st.tlCount++;
      st.perEra[e] = true;
    }
  }
}

function showTL(it, ms){
  const el = document.getElementById('tl');
  if (!el) return;
  el.querySelector('.tlY').textContent = it.y;
  el.querySelector('.tlT').textContent = it.t;
  el.classList.add('on');
  clearTimeout(tlT);
  tlT = setTimeout(()=> el.classList.remove('on'), ms || 5200);
  blip(1320, 0.06, 'sine', 0.03);
}

/* ══════════ 结局 ══════════ */
function startReveal(){
  G.state = 'reveal'; revealT = 0;
  st.bondEnd = pair.bond;
  st.gapEnd = pair.gap;
  const gen = RUN;
  document.getElementById('flash').classList.add('on');
  setTimeout(()=>{
    if (gen !== RUN) return;           // 上一局的定时器不许动新一局
    revealNow();
  }, 700);
}

// 把世界收掉、只留环形轨道。截图夹具要同步调到这一帧，不能再等 700ms 的闪白
function revealNow(){
  const hudEl = document.getElementById('hud');
  worldGroup.visible = false;
  particles.visible = false;
  player.model.g.visible = false;
  pair.group.visible = false;
  if (tapeIM) tapeIM.visible = false;
  if (tapeHaloIM) tapeHaloIM.visible = false;
  if (rumorIM) rumorIM.visible = false;
  rumorHalos.forEach(s=> s.visible = false);
  if (obGroup) obGroup.visible = false;
  ringGroup.visible = true;
  document.getElementById('flash').classList.remove('on');
  // 结局的天空：把 ???? 那一站的黑，换成一点凌晨的紫
  // 俯视时天空球正上方会占掉画面上缘：原来那团暖色太阳在那里糊成一块褐色污渍，
  // 结局不需要太阳，只留一点冷紫的凌晨
  skyMat.uniforms.uTop.value.set('#06050f');
  skyMat.uniforms.uBot.value.set('#1d1629');
  skyMat.uniforms.uSun.value.set('#8f7cc0');
  skyMat.uniforms.uSunI.value = 0.0;
  ambLight.color.set('#3a3048'); ambLight.intensity = 0.45;
  sunLight.color.set('#e8d4ff'); sunLight.intensity = 0.65;
  renderer.toneMappingExposure = 1.04;
  scene.fog = null;
  // 俯视要够高够远，否则环形轨道的近端会掉出画面
  camera.position.set(0, 74, 106);
  camera.fov = camera.aspect < 1 ? 64 : 50;
  camera.updateProjectionMatrix();
  camera.lookAt(0, -2, 0);
  skyMesh.position.copy(camera.position);
  // 竖屏的水平视角只有 16°，46 米的环会被左右裁成两条弧 —— 按水平夹角反推缩放
  const vHalf = camera.fov * Math.PI / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const ringFit = Math.max(0.42, Math.min(1, 0.88 * 129 * Math.tan(hHalf) / 52));
  ringGroup.scale.setScalar(ringFit);
  // 进了环形轨道就不再是「跑」了：HUD（同框/间距/磁带）收起来，
  // 否则左上角的「间距 --」会和画面中央的「间距 0.0m」互相打脸
  hudEl.classList.remove('on');
  sfxEnd();
  const rb = document.getElementById('revealBond');
  if (rb) rb.textContent = '同框 ' + Math.round(pair.bond) + ' · 间距 ' + pair.gap.toFixed(1) + 'm';
  document.getElementById('revealText').classList.add('on');
}

function updateReveal(dt){
  revealT += dt;
  const a = revealT * 0.10;
  ringGroup.userData.dots.rotation.y = a;
  skyMesh.position.copy(camera.position);
  ringGroup.rotation.z = Math.sin(revealT*0.2)*0.02;
  if (revealT > 6.2 && !document.getElementById('choiceRow').classList.contains('on')){
    // 底部选项目前和最后一站的时间线字幕共用同一块地方：按钮出现时收起字幕
    const tl = document.getElementById('tl');
    if (tl) tl.classList.remove('on');
    document.getElementById('choiceRow').classList.add('on');
  }
}

function endRun(crashed){
  G.state = 'result';
  MUSIC.setEnd();
  RUN++;
  document.getElementById('revealText').classList.remove('on');
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('endKick').textContent = 'EARLY OUT';
  document.getElementById('endTitle').textContent = '提前下车';
  document.getElementById('endLine').textContent = '你被流言撞了三次。列车没有停，只是你不再看窗外了。';
  document.getElementById('over').classList.add('on');
  st.bondEnd = pair.bond; st.gapEnd = pair.gap;
  showResult(true);
}

function pickEnding(off){
  G.state = 'result';
  MUSIC.setEnd();
  RUN++;
  G.endPick = off ? 'off' : 'stay';
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('revealText').classList.remove('on');
  ringGroup.visible = false;
  document.getElementById('endKick').textContent = 'ENDING';
  document.getElementById('endTitle').textContent = off ? '下车' : '不下车';
  const tight = st.bondEnd >= 60;
  const loose = st.bondEnd < 30;
  document.getElementById('endLine').textContent = off
    ? (loose
        ? '你下车的时候，那个画面已经散了。站台上风很大，你听见的每一个名字都像别人在说。'
        : (tight
            ? '你回到了 2026。你没有回头，但你知道身后那节车厢的灯还亮着，两个人还在同一个画面里。'
            : '你回到了 2026。站台很空，风把雪吹进轨道里。你没有确认那两个人还在不在。'))
    : (loose
        ? '你把自己留在了那节车厢里。窗外还是 2006 年的夏天。画面散了，你还在等它重新连上。'
        : (tight
            ? '你把自己留在了那节车厢里。窗外还是 2006 年的夏天，蝉在叫，两个人在前面跑，中间那根线没有断。'
            : '你把自己留在了那节车厢里。窗外还是 2006 年的夏天，有人在喊一个名字，你没听清是谁在喊。'));
  document.getElementById('over').classList.add('on');
  showResult(false);
  sfxEnd();
}

const TITLES = [
  [40000,'短信投票冠军','一人一票投出来的'],
  [30000,'二十年老粉，证件齐全','你连她的应援色都记得'],
  [22000,'磁带收藏家，感情贫困户','收得越多，越说不清'],
  [15000,'站票二十年','你一直在门外'],
  [9000,'路过青春，没投过票','但你都记得'],
  [4000,'上车是为了看她，下车是因为挤','很合理'],
  [0,'提前下车，情有可原',''],
];

function bondVerdict(){
  const b = st.bondEnd;
  if (pair.mode === 'none' && st.gapEnd === 0 && b <= 0) return '最后一站，台上是空的。';
  if (b >= 75) return '大部分时候，她们留在同一个画面里。你没看清的，比看清的多。';
  if (b >= 45) return '有时候在，有时候不在。像所有没被证实的事。';
  if (b >= 20) return '画面散过很多次，你又捡回来一点。';
  return '你没能把她们留在同一个画面里。';
}

function showResult(crashed){
  const s = Math.floor(st.score);
  let t = TITLES.find(x=> s >= x[0]) || TITLES[TITLES.length-1];
  let hidden = false;
  if (st.tapes >= 20 && st.hearts === 3){ t = [0,'你一次都没信过流言','']; hidden = true; }

  document.getElementById('rScore').textContent = s.toLocaleString('en-US');
  document.getElementById('rTitle').textContent = t[1];
  document.getElementById('rTitle').classList.toggle('gold', hidden);
  document.getElementById('rSub').textContent = crashed ? '你提前下车了。' : t[2];
  // 按这一局实际发生了什么挑一句，不能出现「磁带都收齐了」但其实只捡到一盘
  const pool = ['没下车，也没到站。','二十年，就换来一张站票。','你记得的比你以为的多。'];
  if (st.tapes >= 24) pool.push('磁带都快收齐了。');
  if (st.tapes <= 2) pool.push('只有一两盘磁带，和一点没拼上的画面。');
  if (st.bondEnd < 30) pool.push('画面散过很多次，这次没捡回来。');
  if (st.bondEnd >= 70) pool.push('你跑完了，而且把她们留在了同一个画面里。');
  if (st.near >= 10) pool.push('那么多次擦身而过，你都数着。');
  if (st.perEra[2]) pool.push('2014 那站，你差点睡着。');
  document.getElementById('rQuote').textContent = pool[(s + st.tapes*3) % pool.length];
  document.getElementById('rDetail').textContent =
    `距离 ${Math.floor(G.dist)}m · 磁带 ${st.tapes} · 擦身 ${st.near} · 精准 ${st.precise} · 最高连击 ×${st.bestCombo}`;

  // —— 同框结算：这是这一局你唯一能保住 / 弄丢的东西 ——
  const bEnd = Math.round(st.bondEnd);
  const bf = document.getElementById('rBondFill');
  if (bf){ bf.style.width = Math.max(0, Math.min(100, st.bondEnd)) + '%'; bf.classList.toggle('low', bEnd < 22); }
  const bt = document.getElementById('rBond');
  if (bt) bt.textContent = '同框 ' + bEnd + ' · 间距 ' + (pair.mode === 'both' ? st.gapEnd.toFixed(1) + 'm' : '—');
  const bv = document.getElementById('rBondTxt');
  if (bv) bv.textContent = bondVerdict();

  // 磁带条：一排 30 格
  const strip = document.getElementById('rTapeStrip');
  if (strip){
    const n = Math.min(30, st.tapes);
    strip.textContent = '▮'.repeat(n) + '▯'.repeat(30-n);
  }
  // 六个时代，走过哪几个
  const eras = document.getElementById('rEras');
  if (eras){
    const years = ERAS.map(e=> e.id);
    eras.textContent = years.map((y,i)=> y + ' ' + (st.perEra[i] ? '●' : '○')).join('   ');
  }
  // 2007 那三种说法：只带走一种
  const rr = document.getElementById('rRumor');
  if (rr){
    if (st.rumor === null){
      rr.textContent = (G.dist >= 277)
        ? '2007 那一站有三种说法，你一种都没带走。'
        : '你没能跑到 2007 那一站。三种说法都还在那里，谁也没证实。';
    } else {
      rr.textContent = '2007 那一站你带走了一种说法：' + st.rumorShort +
        '。另外两种，你没能同时带走——三种都没有第三方证据。';
    }
  }
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

/* ══════════ 重置（真正的 reset，不 reload） ══════════ */
function resetRun(){
  RUN++;
  clearTimeout(capT); clearTimeout(toastT); clearTimeout(tlT); clearTimeout(popT);

  // 可见性
  worldGroup.visible = true;
  particles.visible = true;
  player.model.g.visible = true;
  if (ringGroup) ringGroup.visible = false;
  if (tapeIM) tapeIM.visible = true;
  if (tapeHaloIM) tapeHaloIM.visible = true;
  if (rumorIM) rumorIM.visible = true;
  rumorHalos.forEach(s=> s.visible = true);
  if (obGroup) obGroup.visible = true;
  pair.group.visible = true;

  // 状态
  G.state = 'title'; G.t = 0; G.dist = 0; G.speed = SPEED0;
  G.era = 0; G.hits = 0; G.pen = 0; G.flash = 0; G.endPick = null;
  player.z = 0; player.x = 0; player.lane = 1; player.y = 0; player.vy = 0;
  player.jumping = false; player.slide = 0; player.slideT = 0; player.slideHold = 0; jumpBuf = 0; slideBuf = 0; player.lean = 0; player.runPhase = 1.35;
  player.model.g.rotation.set(0,0,0);
  player.model.root.rotation.set(0,0,0);
  player.model.root.position.set(0,0,0);

  st.score = 0; st.tapes = 0; st.hearts = 3; st.combo = 0; st.bestCombo = 0;
  st.perEra = []; st.near = 0; st.precise = 0; st.tlCount = 0;
  st.rumor = null; st.rumorShort = ''; st.shieldUsed = 0;
  st.bondEnd = 48; st.gapEnd = 1.0;

  pair.bond = 48; pair.gap = PAIR_ERA[0].gap; pair.lane = 1; pair.cx = 0;
  pair.mode = PAIR_ERA[0].mode; pair.used = false; pair.armed = false;
  pair.inFrame = false; pair.laneT = 3.0; pair.flash = 0; pair.bond = 48;

  tlShown = {};
  eraMix = { from:0, to:0, t:1 };
  camX = 0; camY = ROOF_Y + 2.70; camLookX = 0; trauma = 0; revealT = 0;
  applyEra(0,0,1);

  memsetTapes();
  resetRumor();

  // UI
  document.getElementById('over').classList.remove('on');
  document.getElementById('revealText').classList.remove('on');
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('flash').classList.remove('on');
  document.getElementById('caption').classList.remove('on');
  document.getElementById('tl').classList.remove('on');
  document.getElementById('toast').classList.remove('on');
  document.getElementById('title').classList.add('gone');
  document.getElementById('hud').classList.add('on');

  camera.position.set(0, ROOF_Y + 2.70, 6.4);
  camera.fov = 58; camera.updateProjectionMatrix();
  camera.lookAt(0, ROOF_Y + 1.0, -15);
  updateHUD();
  renderer.render(scene, camera);
}

function resetRumor(){
  for (const r of rumorData) r.taken = false;
  if (rumorIM){
    rumorData.forEach((r,i)=>{
      _mm.compose(new THREE.Vector3(LANE_X[r.lane], ROOF_Y+1.55, r.z),
                  new THREE.Quaternion(), new THREE.Vector3(1,1,1));
      rumorIM.setMatrixAt(i,_mm);
    });
    rumorIM.instanceMatrix.needsUpdate = true;
  }
  rumorHalos.forEach(s=> s.visible = true);
}

/* ══════════ 启动 ══════════ */
function makeGrain(){          // 真噪点贴图：规则渐变棋盘会变成"屏幕门"，随机噪点才像胶片
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (!x || typeof x.createImageData !== 'function') return;      // 无头测试里的假 canvas 直接跳过
  const im = x.createImageData(128,128);
  if (!im || !im.data) return;
  const d = im.data;
  for (let i=0;i<d.length;i+=4){ const v = Math.random()*255|0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
  x.putImageData(im,0,0);
  const g = document.getElementById('grain');
  if (g) g.style.backgroundImage = 'url(' + c.toDataURL() + ')';
}
function boot(){
  HUD.year = document.getElementById('hudYear');
  HUD.tag = document.getElementById('hudTag');
  HUD.score = document.getElementById('hudScore');
  HUD.mult = document.getElementById('hudMult');
  HUD.tape = document.getElementById('hudTape');
  HUD.hearts = document.getElementById('hudHearts');
  HUD.combo = document.getElementById('combo');
  HUD.comboMini = document.getElementById('hudCombo');
  HUD.bar = document.getElementById('eraBar');
  HUD.bondFill = document.getElementById('bondFill');
  HUD.bondGap = document.getElementById('bondGap');
  HUD.bondNum = document.getElementById('bondNum');
  HUD.bondTag = document.getElementById('bondTag');
  HUD.bondWrap = document.getElementById('bondWrap');
  HUD.rumor = document.getElementById('hudRumor');

  try {
    initScene();
  } catch (e) {
    showErr('WebGL 初始化失败：' + (e && e.message ? e.message : e) + '\n请换一个支持 WebGL 的浏览器');
    return;
  }
  bindInput();

  makeGrain();
  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnOff').addEventListener('click', ()=> pickEnding(true));
  document.getElementById('btnStay').addEventListener('click', ()=> pickEnding(false));
  document.getElementById('btnAgain').addEventListener('click', ()=>{ resetRun(); startGame(); });
  const muteBtn = document.getElementById('mute');
  if (muteBtn) muteBtn.addEventListener('click', e => { e.preventDefault(); MUSIC.toggleMute(); });
  MUSIC.syncBtn();

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
  MUSIC.attach(AC);
  MUSIC.start();
  if (AC && AC.resume) { try { AC.resume(); } catch(e){} }
  document.getElementById('title').classList.add('gone');
  document.getElementById('hud').classList.add('on');
  document.getElementById('over').classList.remove('on');
  G.state = 'playing';
  player.runPhase = 0.55;   // 夹具只跑 4 帧，先给一个迈步相位，别拍成站着
  if (player.model) player.model.g.visible = true;
  G.t = 0; G.speed = SPEED0; G.era = 0;
  player.z = 0; player.x = 0; player.lane = 1; player.y = 0; player.vy = 0;
  player.jumping = false; player.slide = 0; player.slideT = 0; player.slideHold = 0; jumpBuf = 0; slideBuf = 0; player.lean = 0; G.pen = 0;
  st.score = 0; st.tapes = 0; st.hearts = 3; st.combo = 0; st.bestCombo = 0;
  st.perEra = []; st.near = 0; st.precise = 0; st.tlCount = 0;
  st.rumor = null; st.rumorShort = ''; st.shieldUsed = 0;
  pair.bond = 48; pair.gap = PAIR_ERA[0].gap; pair.lane = 1; pair.cx = 0;
  pair.mode = PAIR_ERA[0].mode; pair.used = false; pair.armed = false; pair.inFrame = false;
  pair.laneT = 3.0;
  memsetTapes();
  resetRumor();
  tlShown = {};
  document.getElementById('tl').classList.remove('on');
  document.getElementById('revealText').classList.remove('on');
  document.getElementById('choiceRow').classList.remove('on');
  document.getElementById('flash').classList.remove('on');
  document.getElementById('toast').classList.remove('on');
  eraMix = { from:0, to:0, t:1 };
  applyEra(0,0,1);
  showCaption(ERAS[0].year, ERAS[0].tag);
  updateHUD();
}

function memsetTapes(){
  if (!tapeIM) return;
  tapeData.forEach((t)=>{ t.taken = false; });
  for (let i=0;i<tapeData.length;i++){
    _mm.compose(new THREE.Vector3(LANE_X[tapeData[i].lane], ROOF_Y+tapeData[i].y, tapeData[i].z),
                new THREE.Quaternion(), new THREE.Vector3(1,1,1));
    tapeIM.setMatrixAt(i,_mm);
    if (tapeHaloIM) tapeHaloIM.setMatrixAt(i,_mm);
  }
  tapeIM.instanceMatrix.needsUpdate = true;
  if (tapeHaloIM) tapeHaloIM.instanceMatrix.needsUpdate = true;
  obstacles.forEach(o=>{ o.hit = false; o.passed = false; });
  placeObstacles();
}

function renderIdle(dt){
  const t = performance.now()*0.001;
  camera.position.set(Math.sin(t*0.07)*0.9, ROOF_Y + 2.05, 7.4);
  camera.lookAt(0, ROOF_Y + 1.30, -16);
  camera.fov = 56; camera.updateProjectionMatrix();
  skyMesh.position.copy(camera.position);
  updateParticles(dt);
  if (player.model) player.model.g.visible = false;

  // 标题里的两个人：站在一起，慢慢分开一点，又靠近
  if (pair.group){
    pair.group.visible = true;
    pair.z = -5.6;
    pair.cx = Math.sin(t*0.19) * 0.62;
    pair.gap = 1.02 + Math.sin(t*0.19 + 1.15) * 0.22;
    pair.mode = 'both';
    placePair(0.016);
    // 待机时不跑，轻轻晃
    const A = pair.a, B = pair.b;
    A.g.visible = B.g.visible = true;
    A.legL.hip.rotation.x = A.legR.hip.rotation.x = 0;
    B.legL.hip.rotation.x = B.legR.hip.rotation.x = 0;
    A.legL.kn.rotation.x = A.legR.kn.rotation.x = 0;
    B.legL.kn.rotation.x = B.legR.kn.rotation.x = 0;
    A.armL.rotation.x = Math.sin(t*0.8)*0.06;
    A.armR.rotation.x = -Math.sin(t*0.8)*0.06;
    B.armL.rotation.x = Math.sin(t*0.8+1.2)*0.06;
    B.armR.rotation.x = -Math.sin(t*0.8+1.2)*0.06;
    A.root.position.y = 0; B.root.position.y = 0;
    A.g.rotation.z = Math.sin(t*0.35)*0.015;
    B.g.rotation.z = -Math.sin(t*0.35)*0.015;
    A.halo.material.opacity = 0.52;
    B.halo.material.opacity = 0.52;
  }
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
  // 截图模式不等标题淡出，否则夹具会拍到半透明的标题字压在场景上
  const tEl = document.getElementById('title');
  tEl.style.transition = 'none';
  tEl.classList.add('gone');
  document.getElementById('hud').classList.add('on');
  G.state = 'playing';
  player.runPhase = 0.55;   // 夹具只跑 4 帧，先给一个迈步相位，别拍成站着
  if (player.model) player.model.g.visible = true;
  G.t = 0; G.speed = SPEED0; G.era = 0;
  player.z = -d; player.lane = 1; player.x = 0;
  G.dist = d;
  const e = Math.min(5, Math.floor(d / ERA_LEN));
  G.era = e; eraMix = { from:e, to:e, t:1 };
  pair.mode = PAIR_ERA[e].mode;
  pair.gap = PAIR_ERA[e].gap;
  pair.lane = 1; pair.cx = 0;
  pair.group.visible = pair.mode !== 'none';
  applyEra(e,e,1);
  camX = 0; camY = ROOF_Y + 2.70;
  for (let i=0;i<4;i++){ update(1/60); }
  const asp0 = camera.aspect;
  camera.fov = (58 + 18*(G.speed-SPEED0)/(SPEED1-SPEED0)) * (asp0 < 1 ? (1+(1-asp0)*0.18) : 1);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  // d 到终点时直接进反转镜头，截图夹具才能拍到环形轨道
  if (d >= ERA_LEN*6 - 40){
    try{
      // 夹具没有主循环：同步收世界、切到环形轨道、把文字/按钮直接摆到最终态，
      // 否则 __shotDone 先到，截图拍到的是 700ms 闪白
      G.state = 'reveal'; revealT = 6.25;
      st.bondEnd = pair.bond; st.gapEnd = pair.gap;
      const fl = document.getElementById('flash');
      fl.style.transition = 'none'; fl.style.opacity = '0';
      document.getElementById('hud').style.transition = 'none';
      const rt = document.getElementById('revealText');
      rt.style.transition = 'none'; rt.style.opacity = '1';
      const cr = document.getElementById('choiceRow');
      cr.style.transition = 'none';
      revealNow();
      revealT = 6.25;
      updateReveal(1/60);
      cr.classList.add('on'); cr.style.opacity = '1';
      renderer.render(scene, camera);
    }catch(e){}
  }
  window.__shotDone = true;
  document.title = 'shot ok ' + d;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
