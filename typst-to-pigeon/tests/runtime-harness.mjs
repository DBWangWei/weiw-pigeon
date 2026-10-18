import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Window} = await import(process.env.PIGEON_TEST_DEPS ? pathToFileURL(resolve(process.env.PIGEON_TEST_DEPS,'happy-dom/lib/index.js')).href : 'happy-dom');
const root=resolve(process.env.PIGEON_FIXTURE_ROOT);
const markup=await readFile(resolve(root,'index.html'),'utf8');
const app=await readFile(resolve(root,'src/app.js'),'utf8');
const effects=await readFile(resolve(root,'src/title-effects.js'),'utf8');
const transitions=await readFile(resolve(root,'src/slide-transitions.js'),'utf8');
const diagrams=await readFile(resolve(root,'src/diagram.js'),'utf8');
const embedded=await readFile(resolve(root,'public/deck/embedded-deck.js'),'utf8');
export function press(w,d,key,options={}) {
  d.querySelector('#stage').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...options}));
}
export function pointer(w,canvas,type='pointermove',options={}) {
  canvas.dispatchEvent(new w.PointerEvent(type,{pointerId:1,pointerType:'mouse',clientX:120,clientY:240,button:0,buttons:0,bubbles:true,...options}));
}
export async function setup(t) {
  const w=new Window({url:'file:///pigeon/index.html',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  t.after(()=>w.happyDOM.abort());
  const calls=[];
  w.Element.prototype.animate=function(frames,options){const record={element:this,frames,options,cancelled:false};calls.push(record);return {cancel(){record.cancelled=true;}};};
  w.HTMLImageElement.prototype.decode=async()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:(t,k)=>t[k] || (k==='measureText'?text=>({width:text.length*12}):()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,x:0,y:0,width:1440,height:1000,right:1440,bottom:1000};};
  w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
  w.structuredClone=structuredClone;
  w.fetch=()=>{throw new Error('Unexpected fetch in file mode');};
  w.document.write(markup.replace(/<script[\s\S]*?<\/script>/g,''));
  w.eval(effects);w.eval(transitions);w.eval(diagrams);w.eval(embedded);
  w.eval(app+'\nwindow.testApp={diagram,state,normaliseManifest,navigateTo,nextSlide,fitCurrent,fitWhole,canvasPoint,sessionPayload,validateSession,toggleWhiteboard,keyHandler,setTool,openOverview,closeOverview,syncTitleEffect,stopTitleEffect,viewSequence,showWand,pageTransitions,cancelPageTransition,zoomAt,historyMove,resumeRoute,reconcilePresentation,undo,redo,applySession,drawSurface,exportPng};');
  await new Promise(r=>setTimeout(r,40));
  return {w,a:w.testApp,d:w.document,calls};
}

