/* 整机冒烟测试：DOM shim + 假 WebGLRenderer，把游戏从启动跑到结局 */
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');

/* ───── 极简 DOM ───── */
class TNode{ constructor(t){this.nodeType=3;this._t=t;this.parentNode=null;}
  get textContent(){return this._t;} set textContent(v){this._t=String(v);} }
class El{
  constructor(tag){
    this.nodeType=1; this.tagName=(tag||'div').toUpperCase(); this.children=[];
    this.parentNode=null; this._cls=new Set();
    this.style={ setProperty(){}, getPropertyValue(){return '';}, removeProperty(){} }; this.dataset={};
    this.attrs={}; this._text=''; this._ev={}; this.width=0; this.height=0;
    const self=this;
    this.classList={ add:(...c)=>c.forEach(x=>self._cls.add(x)), remove:(...c)=>c.forEach(x=>self._cls.delete(x)),
      contains:c=>self._cls.has(c), toggle:(c,v)=>{const on=v===undefined?!self._cls.has(c):v; on?self._cls.add(c):self._cls.delete(c);} };
  }
  get className(){ return [...this._cls].join(' '); }
  set className(v){ this._cls=new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent(){ return this.children.length?this.children.map(c=>c.textContent).join(''):this._text; }
  set textContent(v){ this.children=[]; this._text=String(v); }
  get innerHTML(){ return this._text; }
  set innerHTML(v){
    this.children=[]; this._text=String(v);
    if(this._text.includes('<')) parseInto(this, this._text);
  }
  appendChild(n){ n.parentNode=this; this.children.push(n); return n; }
  addEventListener(e,f){ (this._ev[e]=this._ev[e]||[]).push(f); }
  dispatch(e,a){ (this._ev[e]||[]).forEach(f=>f(a||{preventDefault(){}})); }
  click(){ this.onclick && this.onclick(); this.dispatch('click'); }
  getContext(){ return new Proxy({}, {get:(t,k)=> k in t? t[k] : ()=>{} }); }
  getBoundingClientRect(){ return {width:900,height:600,top:0,left:0,right:900,bottom:600}; }
  matches(sel){
    const m=sel.match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
    if(!m) return false;
    if(m[1] && this.tagName!==m[1].toUpperCase()) return false;
    for(const t of (m[2]||'').match(/[.#][\w-]+/g)||[]){
      if(t[0]==='.'&&!this._cls.has(t.slice(1))) return false;
      if(t[0]==='#'&&this.attrs.id!==t.slice(1)) return false;
    }
    return true;
  }
  querySelectorAll(sel){
    const parts=sel.trim().split(/\s+/); const out=[]; const all=[];
    const flat=n=>{ for(const c of n.children){ if(c.nodeType===1){ all.push(c); flat(c); } } };
    flat(this);
    for(const e of all){
      let i=parts.length-1,n=e;
      if(!n.matches(parts[i])) continue;
      i--;
      while(i>=0&&n){ n=n.parentNode; while(n&&!(n.nodeType===1&&n.matches(parts[i]))) n=n.parentNode; i--; }
      if(i<0) out.push(e);
    }
    return out;
  }
  querySelector(sel){ return this.querySelectorAll(sel)[0]||null; }
}
const VOID=new Set(['br','hr','img','input','meta','link']);
const dec=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
function parseInto(root,html){
  const re=/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m,stack=[root],last=0;
  while((m=re.exec(html))){
    const txt=html.slice(last,m.index); if(txt) stack[stack.length-1].appendChild(new TNode(dec(txt)));
    last=re.lastIndex;
    const tag=m[1].toLowerCase(), attr=m[2]||'', closing=m[0][1]==='/';
    if(closing){ if(stack.length>1) stack.pop(); continue; }
    const el=new El(tag);
    const ar=/([\w-]+)\s*=\s*"([^"]*)"/g; let am;
    while((am=ar.exec(attr))){ el.attrs[am[1]]=am[2];
      if(am[1]==='class') el.className=am[2];
      if(am[1]==='id') el.attrs.id=am[2];
      if(am[1].startsWith('data-')) el.dataset[am[1].slice(5)]=am[2]; }
    stack[stack.length-1].appendChild(el);
    if(!VOID.has(tag)) stack.push(el);
  }
  const tail=html.slice(last); if(tail) stack[stack.length-1].appendChild(new TNode(dec(tail)));
}

const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const b0=html.indexOf('<body'), b1=html.indexOf('<script');
const body=new El('body');
body.innerHTML = html.slice(b0,b1).replace(/^<body[^>]*>/,'');

const document={
  body, documentElement:new El('html'), readyState:'complete', title:'',
  createElement:t=>new El(t), createTextNode:t=>new TNode(t),
  addEventListener(){}, getElementById(id){ return body.querySelector('#'+id); },
  querySelector(s){ return body.querySelector(s); }, querySelectorAll(s){ return body.querySelectorAll(s); },
};

const errors=[];
const sandbox={
  document, console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, Date, RegExp,
  Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, isNaN, parseFloat, parseInt, Infinity, NaN,
  performance:{ now:()=>Date.now() },
  requestAnimationFrame:()=>1, cancelAnimationFrame(){},
  setTimeout, clearTimeout, setInterval, clearInterval,
  devicePixelRatio:2, innerWidth:900, innerHeight:600,
  location:{ search:'', reload(){ sandbox.__reloaded=true; } },
  URLSearchParams: class{ constructor(){} get(){ return null; } },
  AudioContext: class{ constructor(){ this.currentTime=0; this.destination={}; }
    createOscillator(){ return { type:'', frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
      connect(){}, start(){}, stop(){} }; }
    createGain(){ return { gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}, connect(){} }; } },
};
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;
sandbox.addEventListener=(e,f)=>{ (sandbox.__w=e==='resize'?(sandbox.__r=(sandbox.__r||[]),sandbox.__r):null); };
const ctx=vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor-three.min.js'),'utf8'),ctx,{filename:'three'});
// 假渲染器
vm.runInContext(`
  THREE.WebGLRenderer = class {
    constructor(){ this.domElement = document.createElement('canvas'); this.info={render:{calls:0}}; }
    setPixelRatio(){} setSize(){} render(){} setClearColor(){} dispose(){}
    get outputColorSpace(){return this._o;} set outputColorSpace(v){this._o=v;}
  };
`, ctx, {filename:'stub-renderer'});

vm.runInContext(fs.readFileSync(path.join(ROOT,'src/world.js'),'utf8'),ctx,{filename:'world'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'src/game.js'),'utf8'),ctx,{filename:'game'});

const G=()=>vm.runInContext('G',ctx);
const st=()=>vm.runInContext('st',ctx);
const player=()=>vm.runInContext('player',ctx);

let bad=0;
const chk=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) bad++; };

console.log('— 启动 —');
chk(ctx.document.title!==undefined, 'boot() 跑完没有抛错');
chk(G().state==='title', '初始状态 = title');

console.log('— 开局 —');
ctx.startGame();
chk(G().state==='playing', 'startGame → playing');
chk(document.getElementById('hud').classList.contains('on'), 'HUD 显示');

// 无敌，跑到终点
const realOnHit = ctx.onHit;
vm.runInContext('onHit = function(){};', ctx);
const DT=1/60;
let frames=0, timelineSeen=0, picks=0;
const seenEra=new Set();
while (G().state==='playing' && frames<20000){
  ctx.update(DT);
  frames++;
  if (frames%37===0) ctx.tryLane(Math.random()<0.5?-1:1);
  if (frames%53===0) ctx.tryJump();
  if (frames%71===0) ctx.trySlide();
  seenEra.add(G().era);
  if (frames%600===0) vm.runInContext('renderer.render(scene,camera)', ctx);
}
console.log(`  跑了 ${frames} 帧（${(frames*DT).toFixed(1)}s），距离 ${Math.floor(G().dist)}m，分数 ${Math.floor(st().score)}，磁带 ${st().tapes}`);
chk(seenEra.size===6, `经过了全部 6 个时代（实到 ${seenEra.size}）`);
chk(G().dist > 1000, '跑完了全程');
chk(st().tapes>0, `吃到磁带 ${st().tapes} 个`);
chk((st().tlCount||0)>=6, `触发时间线 ${st().tlCount} 次`);
chk(G().state==='reveal'||G().state==='result', '进入反转/结算');

console.log('— 结局 —');
if (G().state==='reveal'){
  for (let i=0;i<700;i++) ctx.updateReveal(DT);
  document.getElementById('choiceRow').classList.add('on');
  document.getElementById('btnStay').click();
}
chk(G().state==='result', '选择后进入 result');
chk(document.getElementById('over').classList.contains('on'), '结算页显示');
const title=document.getElementById('rTitle').textContent;
const sc=document.getElementById('rScore').textContent;
console.log('  称号:', title, ' 分数:', sc);
chk(!!title && title.length>0, '称号已填充');
chk(/[0-9]/.test(sc), '分数已填充');
chk(document.getElementById('endTitle').textContent.length>0, '结局标题已填充');

console.log('— 失败路径 —');
const ctx2=vm.createContext(Object.assign({},sandbox,{}));
Object.assign(sandbox,{});
// 复用同一上下文重开一局
ctx.onHit = realOnHit;   // 恢复真实碰撞
ctx.startGame();
chk(G().state==='playing', '可以重开');
let n=0;
while(n<400 && G().state==='playing'){ ctx.update(DT); n++; if(n%20===0) ctx.onHit(); }
chk(G().state==='result'||G().state==='reveal', `撞三次后结束（${n} 帧）`);
console.log('  结束状态:', G().state);

console.log(bad===0 ? '\n=== SMOKE PASS ===' : `\n=== FAIL ${bad} ===`);
process.exit(bad?1:0);
