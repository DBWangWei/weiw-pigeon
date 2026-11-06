import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={window:{}};
vm.runInNewContext(await readFile(new URL('../assets/pigeon-template/src/graph-layout.js',import.meta.url),'utf8'),scope);
const {layout,bounds,wrapLabel,edgePath}=scope.window.PigeonGraphLayout;
function disjoint(a,b) {
  return a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y;
}
test('large uneven clusters have disjoint cards and cluster bounds, deterministically',()=>{
  const nodes=Array.from({length:360},(_,i)=>({id:'n'+i,label:'A significant message '+i,importance:i%5,cluster:i<200?'Large':`Section ${i%37}`,slides:['s'+i]}));
  const edges=nodes.slice(1).map((n,i)=>({source:nodes[i].id,target:n.id,predicate:'supports'}));
  const before=JSON.stringify(nodes);
  const placed=layout(nodes,edges);
  assert.equal(JSON.stringify(nodes),before);
  assert.deepEqual(placed,layout(nodes,edges));
  const groups=[...new Map(placed.map(n=>[n.cluster,n.clusterBounds])).values()];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)assert(disjoint(groups[i],groups[j]));
  const canvas=bounds(placed);
  for(let i=0;i<placed.length;i++) {
    const n=placed[i],a={x:n.x-n.width/2,y:n.y-n.height/2,width:n.width,height:n.height};
    assert(a.x>=n.clusterBounds.x && a.y>=n.clusterBounds.y+30);
    assert(a.x+a.width<=n.clusterBounds.x+n.clusterBounds.width);
    assert(a.y+a.height<=n.clusterBounds.y+n.clusterBounds.height);
    assert(a.x+a.width<canvas.width && a.y+a.height<canvas.height);
    for(let j=i+1;j<placed.length;j++) {
      const b=placed[j];assert(disjoint(a,{x:b.x-b.width/2,y:b.y-b.height/2,width:b.width,height:b.height}));
    }
  }
});
test('relationships affect placement and strong neighbors remain near each other',()=>{
  const nodes=Array.from({length:16},(_,i)=>({id:'n'+i,label:'Message '+i,cluster:'Topic'}));
  const unrelated=layout(nodes,[]);
  const edges=[{source:'n0',target:'n15',predicate:'supports'},{source:'n0',target:'n14',predicate:'supports'}];
  const connected=layout(nodes,edges),byId=new Map(connected.map(n=>[n.id,n]));
  assert.notEqual(JSON.stringify(unrelated),JSON.stringify(connected));
  const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  assert(distance(byId.get('n0'),byId.get('n15'))<=364);
});
test('long words, CJK and multiline messages wrap within card limits',()=>{
  for(const label of ['A'.repeat(100),'正则化可以降低估计方差但可能引入偏差'.repeat(5),'A long source-grounded sentence about statistical estimation and the bias variance tradeoff.']) {
    const lines=wrapLabel(label);
    assert(lines.length<=5);
    for(const line of lines)assert([...line].reduce((n,c)=>n+(/[^\u0000-\u024f]/u.test(c)?2:1),0)<=27);
  }
});
test('edges clip to each endpoint card boundary, including unequal cards',()=>{
  const a={x:100,y:100,width:200,height:96},b={x:500,y:100,width:100,height:80};
  const line=edgePath(a,b);
  assert.equal(line.x1,200);assert.equal(line.x2,446);
  for(const v of Object.values(edgePath(a,{...a,id:'same'})))assert(Number.isFinite(v));
});
