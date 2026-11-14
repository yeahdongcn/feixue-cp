/* 共用几何：凸包 + "贴着物件绕一圈"的等距外扩路径 */
function hull(pts){
  const p = pts.slice().sort((a,b)=> a.x-b.x || a.y-b.y);
  if (p.length < 3) return p;
  const cross = (o,a,b)=> (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo = []; for (const q of p){ while (lo.length>=2 && cross(lo[lo.length-2],lo[lo.length-1],q)<=0) lo.pop(); lo.push(q); }
  const up = []; for (let i=p.length-1;i>=0;i--){ const q=p[i]; while (up.length>=2 && cross(up[up.length-2],up[up.length-1],q)<=0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function loopAround(objs, r){
  const H = hull(objs);
  if (H.length < 3){
    const c = objs.reduce((a,o)=>({x:a.x+o.x/objs.length, y:a.y+o.y/objs.length}), {x:0,y:0});
    const R = r + Math.max(...objs.map(o=>Math.hypot(o.x-c.x,o.y-c.y)));
    const out=[]; for(let i=0;i<72;i++){ const a=i/72*Math.PI*2; out.push({x:c.x+Math.cos(a)*R, y:c.y+Math.sin(a)*R}); }
    return out;
  }
  const cen = H.reduce((a,o)=>({x:a.x+o.x/H.length, y:a.y+o.y/H.length}), {x:0,y:0});
  const nrm = (a,b)=>{
    let nx=b.y-a.y, ny=-(b.x-a.x);
    const L=Math.hypot(nx,ny); nx/=L; ny/=L;
    const mx=(a.x+b.x)/2-cen.x, my=(a.y+b.y)/2-cen.y;
    if (nx*mx+ny*my < 0){ nx=-nx; ny=-ny; }
    return {x:nx,y:ny};
  };
  const out=[];
  for (let i=0;i<H.length;i++){
    const prev=H[(i-1+H.length)%H.length], v=H[i], next=H[(i+1)%H.length];
    const n1=nrm(prev,v), n2=nrm(v,next);
    let a1=Math.atan2(n1.y,n1.x), a2=Math.atan2(n2.y,n2.x);
    let d=a2-a1; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
    for (let k=0;k<=8;k++){ const a=a1+d*k/8; out.push({x:v.x+Math.cos(a)*r, y:v.y+Math.sin(a)*r}); }
  }
  return out;
}
function polyLen(p){ let L=0; for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length]; L+=Math.hypot(a.x-b.x,a.y-b.y); } return L; }
function subsets(arr,k){
  if (k <= 0 || k > arr.length) return [];
  const out=[]; const idx=[...Array(k).keys()];
  while(true){ out.push(idx.map(i=>arr[i]));
    let i=k-1; while(i>=0 && idx[i]===arr.length-k+i) i--;
    if(i<0) break; idx[i]++; for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1; }
  return out;
}
function bestLoop(objs, need, r){
  let best=Infinity, bs=null;
  for (const s of subsets(objs, need)){ const L=polyLen(loopAround(s,r)); if (L<best){ best=L; bs=s; } }
  if (!bs) throw new Error(`bestLoop: 需要 ${need} 个，只给了 ${objs.length} 个`);
  return { pts: loopAround(bs, r), len: best, set: bs };
}
module.exports = { hull, loopAround, polyLen, subsets, bestLoop };
