/* 无头测试台：模拟 DOM + Canvas，跑通全部剧情与战斗 */
const fs = require('fs');
const vm = require('vm');

/* ── 极简 DOM ── */
class TextNode{
  constructor(t){ this.nodeType=3; this._t=t; this.parentNode=null; }
  get textContent(){ return this._t; }
  set textContent(v){ this._t=String(v); }
}
function mockCtx(){
  const grad={addColorStop(){}};
  const base={
    canvas:{width:320,height:180},
    createRadialGradient:()=>grad, createLinearGradient:()=>grad,
    createPattern:()=>null, measureText:()=>({width:10}),
    getImageData:()=>({data:new Uint8ClampedArray(4)}),
    putImageData(){}, drawImage(){}, setTransform(){}, resetTransform(){},
  };
  return new Proxy(base,{
    get(t,k){ if(k in t) return t[k]; return ()=>{}; },
    set(t,k,v){ t[k]=v; return true; },
  });
}
class El{
  constructor(tag){
    this.nodeType=1; this.tagName=(tag||'div').toUpperCase(); this.children=[];
    this.parentNode=null; this._cls=new Set(); this.style={}; this.dataset={};
    this.attrs={}; this._text=''; this._html=''; this._ev={}; this.disabled=false;
    this.classList={ add:(...c)=>c.forEach(x=>this._cls.add(x)), remove:(...c)=>c.forEach(x=>this._cls.delete(x)),
      contains:c=>this._cls.has(c), toggle:(c,v)=>{ const on=v===undefined?!this._cls.has(c):v; on?this._cls.add(c):this._cls.delete(c); } };
  }
  get className(){ return [...this._cls].join(' '); }
  set className(v){ this._cls=new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent(){ return this.children.length?this.children.map(c=>c.textContent).join(''):this._text; }
  set textContent(v){ this.children=[]; this._text=String(v); }
  get innerHTML(){ return this._html; }
  set innerHTML(v){ this._html=String(v); this.children=[]; this._text=''; parseInto(this,String(v)); }
  appendChild(n){ n.parentNode=this; this.children.push(n); return n; }
  removeChild(n){ const i=this.children.indexOf(n); if(i>=0)this.children.splice(i,1); return n; }
  addEventListener(e,f){ (this._ev[e]=this._ev[e]||[]).push(f); }
  dispatch(e,a){ (this._ev[e]||[]).forEach(f=>f(a||{preventDefault(){}})); }
  click(){ this.onclick && this.onclick(); this.dispatch('click'); }
  getContext(){ return mockCtx(); }
  getBoundingClientRect(){ return {width:960,height:540,top:0,left:0,right:960,bottom:540}; }
  matches(sel){
    if (sel.startsWith('[')){
      const m=sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if(!m) return false;
      const v=this.attrs[m[1]]??this.dataset[m[1]];
      if(v===undefined) return false;
      return m[2]===undefined || v===m[2];
    }
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
function dec(s){ return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'); }
function parseInto(root,html){
  const re=/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m,stack=[root],last=0;
  while((m=re.exec(html))){
    const txt=html.slice(last,m.index); if(txt) stack[stack.length-1].appendChild(new TextNode(dec(txt)));
    last=re.lastIndex;
    const tag=m[1].toLowerCase(), attr=m[2]||'', closing=m[0][1]==='/';
    if(closing){ if(stack.length>1) stack.pop(); continue; }
    const el=new El(tag);
    const ar=/([\w-]+)\s*=\s*"([^"]*)"/g; let am;
    while((am=ar.exec(attr))){
      el.attrs[am[1]]=am[2];
      if(am[1]==='class') el.className=am[2];
      if(am[1]==='id') el.attrs.id=am[2];
      if(am[1].startsWith('data-')) el.dataset[am[1].slice(5)]=am[2];
      if(am[1]==='style') am[2].split(';').forEach(pp=>{ const [k,v]=pp.split(':'); if(k&&v) el.style[k.trim()]=v.trim(); });
    }
    stack[stack.length-1].appendChild(el);
    if(!VOID.has(tag)) stack.push(el);
  }
  const tail=html.slice(last); if(tail) stack[stack.length-1].appendChild(new TextNode(dec(tail)));
}

const DIR='/home/xiaodongye/games/buxiache-rpg';
/* 交付物必须是一个自包含的 index.html：构建过期、引用了外部文件、或偷偷 reload，都直接失败 */
try{
  require('child_process').execFileSync(process.execPath,[DIR+'/build.js','--check'],{stdio:'pipe'});
}catch(e){
  console.error('!!! index.html 与 src/ 不同步，先跑 node build.js');
  process.exit(1);
}
const html=fs.readFileSync(DIR+'/index.html','utf8');
const markup=html.replace(/<script>[\s\S]*?<\/script>/g,'');
const ext=(markup.match(/(?:src|href)\s*=\s*["'](?!#)[^"']+/gi)||[]);
if (ext.length){ console.error('!!! index.html 引用了外部资源：'+ext.join(', ')); process.exit(1); }
if (/location\.reload/.test(html)){ console.error('!!! 还在用 location.reload 重开'); process.exit(1); }
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if (inline.length!==3){ console.error('!!! 期望 3 段内联脚本，实际 '+inline.length); process.exit(1); }

const bodyStart=html.indexOf('<body'), bodyEnd=html.indexOf('<script');
const document={
  body:new El('body'), hidden:false,
  documentElement:{ style:{ setProperty(){}, removeProperty(){} } },
  createElement:t=>new El(t), createTextNode:t=>new TextNode(t),
  addEventListener(){}, querySelector(s){ return this.body.querySelector(s); },
  querySelectorAll(s){ return this.body.querySelectorAll(s); },
};
document.body.innerHTML = html.slice(bodyStart,bodyEnd).replace(/^<body[^>]*>/,'');

/* ── 定时器 / rAF ── */
const rafQ=[];
const sandbox={
  document, console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, Date, RegExp,
  performance:{ now:()=>Date.now() },
  requestAnimationFrame:f=>{ rafQ.push(f); return rafQ.length; },
  cancelAnimationFrame(){},
  setTimeout, clearTimeout, setInterval, clearInterval,
  devicePixelRatio:1,
};
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.location={search:''};
sandbox.addEventListener=(e,f)=>{ if(e==='keydown') sandbox.__kd=sandbox.__kd||[]; if(e==='keydown') sandbox.__kd.push(f); };
const ctx=vm.createContext(sandbox);

for (let i=0;i<inline.length;i++){
  vm.runInContext(inline[i], ctx, {filename:'inline#'+(i+1)});
}

console.log('[boot] scripts loaded');
/* ── 自动驾驶 ── */
const $=s=>document.body.querySelector(s);
const G = n => vm.runInContext(n, ctx);   // const/let 不在沙箱对象上
let guard=0;
function tick(){
  guard++;
  if(guard>200000) throw new Error('autopilot runaway');
  const C=ctx;
  const cq=G('confirmQ');
  if (cq && cq.length){ cq.shift()(); return; }
  const ch=$('#choices');
  if (ch && ch.classList.contains('on')){
    const opts=ch.querySelectorAll('.opt');
    if (opts.length){ const pick=process.env.PICK==='last'?opts[opts.length-1]:opts[0]; pick.click(); return; }
  }
  if (G('battleActive')){
    const cmds=$('#bCmds').querySelectorAll('.bcmd');
    if (cmds.length){
      const hp=G('S').hp;
      const idx = hp<=12 ? 2 : 0;
      (cmds[Math.min(idx,cmds.length-1)]).click();
    }
  }
}
let autoErr=null;
setInterval(()=>{
  if(autoErr) return;
  try{ for(let i=0;i<10;i++) tick(); }catch(e){ autoErr=e; }
},8);
const pump = ms => new Promise(r=>setTimeout(r,ms));

(async ()=>{
  console.log('[run] start');
  const C=ctx;
  const S=()=>G('S');
  $('#startBtn').click();
  await pump(900);
  console.log('[run] intro done');
  if(autoErr) throw autoErr;

  const log=[];
  const say=n=>{ log.push(n); };

  // 逐个时代把 NPC / 物件跑一遍
  const runAll = async (era)=>{
    C.jumpTo(era);
    await pump(700);
    const npcs = C.eraNPCs(), objs = C.eraObjs();
    for (const n of npcs){
      await C.runScript(()=>n.script());
      await pump(500);
      log.push(era+' NPC '+n.name+' ok');
    }
    for (const o of objs){
      await C.runScript(()=>C.pickObj(o));
      await pump(500);
      log.push(era+' OBJ '+o.id+' ok');
    }
  };

  await runAll('2026');
  await runAll('2006');
  if (!G('S').tapes.includes('2007')) throw new Error('2006 没拿到 2007 磁带');
  await runAll('2007');
  if (!G('S').tapes.includes('2014')) throw new Error('2007 没拿到 2014 磁带');
  await runAll('2014');
  if (!G('S').tapes.includes('2020')) throw new Error('2014 没拿到 2020 磁带');
  await runAll('2020');
  if (!G('S').tapes.includes('2026')) throw new Error('2020 没拿到 2026 磁带');
  await runAll('2026');   // 站台 → BOSS → ???? 磁带
  if (!G('S').tapes.includes('????')) throw new Error('BOSS 后没拿到 ???? 磁带');
  await runAll('????');
  // ???? 里先跟「灰」说话再开门
  await C.runScript(()=>C.objDoor());
  await pump(800);

  console.log('\n=== 流程日志 ===');
  log.forEach(x=>console.log(' •',x));
  console.log('\ntapes:', G('S').tapes.join(','));
  console.log('zhi/qing:', G('S').zhi, '/', G('S').qing, ' hp:', G('S').hp);
  console.log('items:', G('S').items.join(' | ')||'(none)');
  const et=$('#ending h2');
  console.log('ending:', et?et.textContent:'(未触发)');
  console.log('ending on:', $('#ending').classList.contains('on'));

  // 「再来一次」必须是真的重置，不是 location.reload
  const replay=$('#replay');
  if (!replay) throw new Error('结局页没有「再来一次」按钮');
  if (!G('S').tapes.includes('????')) throw new Error('通关后磁带数不对');
  replay.click();
  await pump(1400);
  if (G('S').tapes.length!==0) throw new Error('重开后磁带没清空: '+G('S').tapes.join(','));
  if (G('S').zhi!==0 || G('S').qing!==0) throw new Error('重开后执念/清醒没归零');
  if (G('titleMode')) throw new Error('重开后还停在标题画面');
  if ($('#ending').classList.contains('on')) throw new Error('重开后结局页没关');
  if (!G('started') || G('paused')) throw new Error('重开后没有回到可操作状态');
  if (G('S').era!=='2026' || G('S').hp!==32) throw new Error('重开后状态没回到 2026 / 满心力');
  console.log('replay 重置:', 'ok  tapes='+G('S').tapes.length, 'ending='+$('#ending').classList.contains('on'),
    'era='+G('S').era, 'paused='+G('paused'), 'introText='+($('#dtext').textContent||'(已播完)'));

  console.log('\n=== PASS ===');
  process.exit(0);
})().catch(e=>{
  console.error('\n!!! FAIL:', e.message);
  console.error(e.stack.split('\n').slice(1,6).join('\n'));
  try{
    console.error('era:', G('S') && G('S').era, 'tapes:', G('S') && G('S').tapes);
    console.error('text:', $('#dtext') && $('#dtext').textContent.slice(-120));
  }catch(_){}
  process.exit(1);
});
