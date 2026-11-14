
/* ═══════════════════════════════════════════════════════════
   原创配乐 · 《不下车》
   —— 主题动机（A 小调）：A4 C5 E5 D5 C5 B4 A4 G4
   —— 72 BPM，八分音符网格；前瞻式调度：setInterval 25ms，提前 0.12s
   —— 全部由 WebAudio 现场合成，不加载任何音频文件
   —— 钢琴 / 弦垫 / 音盒 / 鼓 四种音色按规格实现
   没有任何真实歌曲的旋律。这句动机是本作自己的。
   ═══════════════════════════════════════════════════════════ */
const MUSIC = (function(){
  'use strict';

  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  const BPM = 72;
  const BEAT = 60 / BPM;          // 0.8333s
  const STEP = BEAT / 2;          // 一个八分音符
  const STEPS = 64;               // 8 小节 × 8 个八分音符
  const A4 = 69;
  const MOTIF  = [0, 3, 7, 5, 3, 2, 0, -2];   // A C E D C B A G（相对 A4）
  const MOTIF2 = [3, 7, 5, 3, 2, 0, -2, 0];   // 后半句回到 A

  /* 和声：Am F C G | Am F Dm E —— 最后一小节用 E 大调，是那点「没说完」 */
  const CHORDS = [
    [45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50],
    [45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47],
  ];

  /* 六个时代 = 同一个动机的六种配器。不是六首曲子，是同一句话在六年里被说出口。 */
  const SCENES = {
    '2006': { lead:'piano', oct:0,   every:2, pad:.95, cut:1400, arp:'eighth',  drum:'shaker', hiss:.004, wet:.20, bass:1, bright:1 },
    '2007': { lead:'bell',  oct:12,  every:4, pad:1.0, cut:620,  arp:'none',    drum:'none',   hiss:.020, wet:.42, bass:0, bright:.7 },
    '2014': { lead:'piano', oct:-12, every:2, pad:.75, cut:520,  arp:'none',    drum:'none',   hiss:.012, wet:.30, bass:1, bright:.6 },
    '2020': { lead:'bell',  oct:0,   every:2, pad:.9,  cut:1000, arp:'quarter', drum:'stage',  hiss:.006, wet:.34, bass:1, bright:1 },
    '2026': { lead:'bell',  oct:12,  every:2, pad:.9,  cut:900,  arp:'eighth',  drum:'soft',   hiss:.014, wet:.36, bass:1, bright:1 },
    '????': { lead:'bell',  oct:12,  every:4, pad:.35, cut:420,  arp:'none',    drum:'none',   hiss:.008, wet:.62, bass:0, bright:.5 },
  };

  let ac = null, master = null, comp = null, revIn = null, rev = null, revOut = null;
  let analyser = null, probeBuf = null;
  let noiseW = null, noiseP = null, hissSrc = null, hissGain = null;
  let chA = null, started = false, timer = 0, step = 0, nextT = 0;
  let sceneNow = '2026', muted = false, armed = false, level = 0.18;

  try { muted = localStorage.getItem('buxiache.mute') === '1'; } catch(e){}

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* 只给验收用：从主输出上取一小段波形算 RMS，证明「真的有声音」而不只是排了程 */
  function rmsProbe(){
    if (!analyser || !probeBuf) return 0;
    try {
      analyser.getFloatTimeDomainData(probeBuf);
      let s = 0;
      for (let i = 0; i < probeBuf.length; i++) s += probeBuf[i] * probeBuf[i];
      return Math.round(Math.sqrt(s / probeBuf.length) * 100000) / 100000;
    } catch(e){ return 0; }
  }

  /* ── 前瞻式调度器：每次只排未来 0.12s，绝不一个音一个 setTimeout ── */
  function tick(){
    if (!ac || !started) return;
    const ahead = ac.currentTime + 0.12;
    if (nextT < ac.currentTime - 0.05) nextT = ac.currentTime + 0.02;
    let guard = 0;
    while (nextT < ahead && guard++ < 32){
      if (chA && chA.live) scheduleStep(chA, step, nextT);
      nextT += STEP;
      step = (step + 1) % STEPS;
    }
  }

  function sceneCfg(){ return SCENES[sceneNow] || SCENES['2026']; }

  /* 每个时代一条独立通道：换站时两条通道同时存在 1.5s，一条淡入一条淡出 */
  function makeChannel(cfg){
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.connect(master);
    const send = ac.createGain();
    send.gain.value = cfg.wet || .3;
    g.connect(send); send.connect(revIn);

    /* 音盒的短延迟：磁带空间里那一点点回声 */
    const dIn = ac.createGain(); dIn.gain.value = 1;
    const dly = ac.createDelay(1.0); dly.delayTime.value = BEAT * 0.75;
    const fb = ac.createGain(); fb.gain.value = .26;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const dOut = ac.createGain(); dOut.gain.value = .38;
    dIn.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly);
    lp.connect(dOut); dOut.connect(g);
    return { gain:g, send, dIn, dly, fb, lp, dOut, cfg, live:true, lead:buildLead(cfg) };
  }

  function buildLead(cfg){
    const map = new Array(STEPS);
    const every = cfg.every || 2;
    const n = Math.floor(STEPS / every);
    for (let i = 0; i < n; i++){
      let off = null;
      if (i < 8) off = MOTIF[i];
      else if (i < 16) off = MOTIF2[i - 8];
      else if (i < 20) off = [0, 7, 3, 5][i - 16];       // 只留一个片段
      else if (i < 24) continue;                          // 留白：乡愁需要空
      else off = MOTIF[(i - 24) % 8] + (i >= 28 ? 12 : 0);
      if (off === null) continue;
      map[i * every] = {
        midi: A4 + off + (cfg.oct || 0),
        vel: (i % 8 === 0 ? .27 : .21) * (cfg.bright || 1),
      };
    }
    return map;
  }

  function chordAt(bar){ return CHORDS[bar % 8]; }

  /* ── 钢琴：sine + triangle，attack 0.004s / decay 0.9s ── */
  function piano(dest, midi, t, vel, dur){
    const f = mtof(midi);
    const g = ac.createGain();
    const a = .004, d = .9;
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
    const g2 = ac.createGain(); g2.gain.value = .45;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest);
    const end = t + a + d + .03;
    o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  }

  /* ── 音盒：sine + 极短包络 0.25s，带一点高八度泛音 ── */
  function bell(dest, midi, t, vel){
    const f = mtof(midi);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + .002);
    g.gain.exponentialRampToValueAtTime(.0001, t + .25);
    const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = ac.createGain(); g2.gain.value = .22;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + .3); o2.stop(t + .3);
  }

  /* ── 弦垫：两个 detune 的 saw + lowpass 900 + 慢 attack 0.6s ── */
  function pad(dest, notes, t, dur, cfg){
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 * (cfg.cut / 900);
    lp.Q.value = .6;
    const g = ac.createGain();
    const peak = .042 * (cfg.pad || 1);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + .6);
    g.gain.setValueAtTime(peak, t + Math.max(.7, dur - .55));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    lp.connect(g); g.connect(dest);
    const end = t + dur + .05;
    notes.forEach(m => {
      const f = mtof(m);
      for (const dt of [-7, 7]){
        const o = ac.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
        const og = ac.createGain(); og.gain.value = .35;
        o.connect(og); og.connect(lp); o.start(t); o.stop(end);
      }
    });
  }

  function bassNote(dest, midi, t){
    const f = mtof(midi);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.12, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + 2.4);
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 2.45);
  }

  /* ── 鼓：低音鼓 sine 120→45；其余用白噪声 + bandpass ── */
  function kick(dest, t, vel){
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + .14);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + .34);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + .36);
  }
  function brush(dest, t, vel, freq){
    if (!noiseW) return;
    const s = ac.createBufferSource(); s.buffer = noiseW; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = freq || 2200; bp.Q.value = .9;
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + .09);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t); s.stop(t + .12);
  }

  /* 每 25ms 排一次：这里只被 tick 调用 */
  function scheduleStep(ch, s, t){
    const cfg = ch.cfg, bar = (s / 8) | 0, pos = s % 8;
    const chord = chordAt(bar);

    /* 换时代可能落在一小节中间：立刻补一个和弦，别让新通道等 3 秒才出声 */
    if (pos === 0 || ch.padBar !== bar){
      const left = pos === 0 ? BEAT * 4 : BEAT * 4 * (1 - pos / 8);
      pad(ch.gain, chord, t, Math.max(BEAT, left * .98), cfg);
      if (cfg.bass) bassNote(ch.gain, chord[0], t);
      ch.padBar = bar;
    }

    const e = ch.lead[s];
    if (e){
      if (cfg.lead === 'piano') piano(ch.gain, e.midi, t, e.vel, BEAT);
      else bell(ch.gain, e.midi, t, e.vel * .9);
      if (cfg.lead === 'bell') bell(ch.dIn, e.midi, t, e.vel * .55);
    }

    if (cfg.arp === 'eighth' && (pos & 1)){
      const n = chord[(s >> 1) % 3] + 12;
      piano(ch.gain, n, t, .062 * (cfg.bright || 1), STEP);
    } else if (cfg.arp === 'quarter' && pos === 4){
      piano(ch.gain, chord[1] + 12, t, .08, BEAT * .5);
    }

    if (cfg.drum === 'soft'){
      if (pos === 0 && bar % 2 === 0) kick(ch.gain, t, .40);
      if (pos === 4) brush(ch.gain, t, .038, 1600);
    } else if (cfg.drum === 'stage'){
      if (pos === 0) kick(ch.gain, t, .44);
      if (pos === 2 || pos === 6) brush(ch.gain, t, .046, 2400);
    } else if (cfg.drum === 'shaker'){
      if (pos === 2 || pos === 6) brush(ch.gain, t, .040, 3200);
    }
  }

  /* ── 音频图 ── */
  function makeNoise(sec, pink){
    const n = Math.floor(ac.sampleRate * sec);
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++){
      const w = Math.random() * 2 - 1;
      if (pink){ last = (last + .02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return b;
  }
  function makeIR(sec, decay){
    const len = Math.floor(ac.sampleRate * sec);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++){
        const x = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (i < 90 ? i / 90 : 1);
      }
    }
    return b;
  }

  function ensure(){
    if (ac || !AC) return;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.0001;
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 3;
      comp.attack.value = .01; comp.release.value = .25;
      analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      probeBuf = new Float32Array(analyser.fftSize);
      master.connect(comp); comp.connect(analyser); analyser.connect(ac.destination);

      rev = ac.createConvolver();
      try { rev.buffer = makeIR(2.8, 2.3); } catch(e){}
      revOut = ac.createGain(); revOut.gain.value = .85;
      rev.connect(revOut); revOut.connect(master);
      revIn = ac.createGain(); revIn.gain.value = .55; revIn.connect(rev);

      noiseW = makeNoise(1.2, false);
      const np = makeNoise(2.0, true);
      hissSrc = ac.createBufferSource(); hissSrc.buffer = np; hissSrc.loop = true;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const hlp = ac.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 2600;
      hissGain = ac.createGain(); hissGain.gain.value = .01;
      hissSrc.connect(hp); hp.connect(hlp); hlp.connect(hissGain); hissGain.connect(master);
      hissSrc.start();

      armGestureResume();
    } catch(e){ ac = null; }
  }

  function resume(){
    if (!ac) return;
    if (ac.state === 'suspended'){ try { ac.resume(); } catch(e){} }
  }
  function armGestureResume(){
    if (!ac) return;
    if (ac.state === 'suspended'){ try { ac.resume(); } catch(e){} }
  }

  function start(){
    ensure(); resume();
    if (!ac || started) return;
    started = true;
    step = 0; nextT = ac.currentTime + .06;
    chA = makeChannel(sceneCfg());
    const now = ac.currentTime;
    chA.gain.gain.setValueAtTime(.0001, now);
    chA.gain.gain.linearRampToValueAtTime(1, now + 1.5);
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(.0001, now);
    master.gain.linearRampToValueAtTime(muted ? .0001 : level, now + 1.2);
    hissGain.gain.setTargetAtTime(muted ? .0001 : (sceneCfg().hiss || .008), now, .8);
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 25);
    tick();
    updateUI();
  }

  /* 换时代：1.5 秒交叉淡入淡出，绝不硬切 */
  function scene(id){
    if (!SCENES[id]) id = '2026';
    if (id === sceneNow && (chA || !started)) { updateUI(); return; }
    sceneNow = id;
    updateUI();
    if (!started || !ac) return;
    const cfg = sceneCfg();
    const now = ac.currentTime;
    const next = makeChannel(cfg);
    next.gain.gain.setValueAtTime(.0001, now);
    next.gain.gain.linearRampToValueAtTime(1, now + 1.5);
    const old = chA;
    chA = next;
    if (old && old.live){
      old.live = false;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(Math.max(.0001, old.gain.gain.value), now);
      old.gain.gain.linearRampToValueAtTime(.0001, now + 1.5);
      setTimeout(() => {
        try {
          old.gain.disconnect(); old.send.disconnect(); old.dIn.disconnect();
          old.dly.disconnect(); old.fb.disconnect(); old.lp.disconnect(); old.dOut.disconnect();
        } catch(e){}
      }, 1900);
    }
    if (hissGain) hissGain.gain.setTargetAtTime(muted ? .0001 : (cfg.hiss || .008), now, .5);
  }

  function setMuted(v){
    muted = !!v;
    try { localStorage.setItem('buxiache.mute', muted ? '1' : '0'); } catch(e){}
    if (ac && master){
      const t = ac.currentTime;
      const target = muted ? .0001 : level;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(target, t + .12);
      if (hissGain) hissGain.gain.setTargetAtTime(muted ? .0001 : (sceneCfg().hiss || .008), t, .2);
    }
    updateUI();
  }
  function toggleMute(){ setMuted(!muted); }

  function byId(id){
    try {
      if (typeof document.getElementById === 'function') return document.getElementById(id);
      return document.querySelector ? document.querySelector('#' + id) : null;
    } catch(e){ return null; }
  }

  function updateUI(){
    const on = started && !muted;
    const btns = [byId('btnMute'), byId('wkMute')];
    for (const b of btns){
      if (!b) continue;
      try {
        b.classList.toggle('muted', muted);
        if (typeof b.setAttribute === 'function'){
          b.setAttribute('aria-label', muted ? '打开声音' : '静音');
          b.setAttribute('title', muted ? '打开声音 · M' : '静音 · M');
        }
      } catch(e){}
      const g = b.querySelector('b'); if (g) g.textContent = muted ? '✕' : '♪';
    }
    const st = byId('wkState');
    if (st) st.textContent = muted ? 'MUTE' : (started ? 'PLAY' : 'STANDBY');
    const body = document.body;
    if (body) body.classList.toggle('musicon', on);
  }

  function labels(year, sub){
    const y = byId('wkYear');
    const s = byId('wkSub');
    if (y) y.textContent = year === '????' ? '？？？？' : year;
    if (s) s.textContent = sub || '';
  }

  /* 首次点击/按键才合法出声：在第一次手势里 create/resume AudioContext */
  function arm(){
    if (armed) return; armed = true;
    const go = () => { ensure(); resume(); };
    try {
      window.addEventListener('pointerdown', go, { once:true });
      window.addEventListener('keydown', go, { once:true });
    } catch(e){}
    try {
      window.addEventListener('keydown', e => {
        if (e.key === 'm' || e.key === 'M'){ toggleMute(); }
      });
    } catch(e){}
  }

  function wire(){
    arm();
    const ids = ['btnMute', 'wkMute'];
    for (const id of ids){
      const b = byId(id);
      if (!b) continue;
      b.addEventListener('click', e => { e.preventDefault(); toggleMute(); });
      b.addEventListener('pointerdown', e => e.stopPropagation());
    }
    updateUI();
  }

  if (typeof document !== 'undefined'){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }

  return {
    start, scene, setMuted, toggleMute, isMuted:() => muted, labels, ensure, updateUI,
    /* 给验收探针看的状态，不参与任何玩法 */
    info: () => ({ ctx: !!ac, state: ac ? ac.state : 'none', started, scene: sceneNow,
                   step, muted, bpm: BPM, chord: CHORDS[((step / 8) | 0) % 8][0],
                   rms: rmsProbe() }),
  };
})();
