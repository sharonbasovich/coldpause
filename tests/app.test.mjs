// Handler-level DOM simulation. This is deliberately not evidence of browser rendering,
// native keyboard behavior, assistive-technology output, or service-worker integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as bindings from '../rules.mjs';

const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
const code = (await readFile(new URL('../app.mjs',import.meta.url),'utf8')).replace(/^import .*?;\s*/, 'const { DEFAULTS, FOODS, SOURCES, evaluate, normalize } = bindings;\n');
class Node {
  constructor(tag='div',text=''){this.tagName=tag;this._text=text;this.children=[];this.attrs={};this.listeners={};this.hidden=false;this.disabled=false;this.value='';this.className='';this.classList={toggle:()=>{}};}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.children=[...nodes];this._html='';}
  set innerHTML(value){this._html=value;this._text='';this.children=[];const match=value.match(/<h2[^>]*>(.*?)<\/h2>/s);if(match)this.children.push(new Node('h2',match[1]));}
  get innerHTML(){return this._html||'';}
  setAttribute(name,value){this.attrs[name]=String(value);}
  removeAttribute(name){delete this.attrs[name];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  querySelector(tag){return this.children.flatMap(n=>[n,...n.descendants()]).find(n=>n.tagName===tag);}
  descendants(){return this.children.flatMap(n=>[n,...n.descendants()]);}
  focus(){this.owner.focused=this;}
  scrollIntoView(options){this.scrollOptions=options;}
}

function harness({saved=null,storageFails=false,serviceWorker,reply=true}={}) {
  const timers = new Map(); const channels=[]; let timerId=0, closedPorts=0;
  class MessageChannel { constructor(){ channels.push(this); this.port1={close(){closedPorts++}}; this.port2={close(){closedPorts++}}; if(reply!==null)queueMicrotask(()=>this.port1.onmessage?.({data:{ready:reply}})); } }
  const document={nodes:new Map(),focused:null,querySelector(selector){return this.nodes.get(selector.slice(1));},getElementById(id){return this.nodes.get(id);},createElement(tag){const n=new Node(tag);n.owner=this;return n;}};
  const make=(id,tag='div')=>{const n=new Node(tag);n.id=id;n.owner=document;document.nodes.set(id,n);return n;};
  for(const match of html.matchAll(/\bid="([^"]+)"/g))make(match[1]);
  const form=document.nodes.get('food-form'), controls={};
  for(const match of html.matchAll(/<select([^>]+)>(.*?)<\/select>/gs)) {
    const id=match[1].match(/id="([^"]+)"/)[1],name=match[1].match(/name="([^"]+)"/)[1],value=match[2].match(/value="([^"]*)"/)[1];
    const n=document.nodes.get(id);n.tagName='select';n.name=name;n.value=value;n.defaultValue=value;controls[name]=n;
  }
  for(const match of html.matchAll(/<input([^>]+)>/g)) {
    const type=match[1].match(/type="([^"]+)"/)[1],name=match[1].match(/name="([^"]+)"/)[1];
    if(type==='radio'){if(!controls[name])controls[name]={value:'',defaultValue:'',name};if(match[1].includes('checked'))controls[name].value=controls[name].defaultValue=match[1].match(/value="([^"]*)"/)[1];}
    else {const id=match[1].match(/id="([^"]+)"/)[1],n=document.nodes.get(id);n.name=name;n.tagName='input';n.value='';n.defaultValue='';controls[name]=n;}
  }
  form.elements={...controls,namedItem:key=>controls[key]};form.reset=()=>Object.values(controls).forEach(n=>n.value=n.defaultValue);
  form.querySelectorAll=()=>Object.values(controls).filter(n=>n.attrs?.['aria-invalid']);
  const result=document.nodes.get('result');result.innerHTML=html.match(/<section id="result"[^>]*>(.*?)<\/section>/s)[1];result.className='result empty';
  const attachOwner=node=>{node.owner=document;for(const child of node.children)attachOwner(child);};attachOwner(result);
  const store=new Map(saved===null?[]:[['coldpause-session-v1',saved]]);
  const localStorage={getItem:key=>{if(storageFails)throw Error('blocked');return store.get(key)??null;},setItem:(key,v)=>{if(storageFails)throw Error('blocked');store.set(key,v);},removeItem:key=>{if(storageFails)throw Error('blocked');store.delete(key);}};
  class FormData {constructor(){this.items=Object.entries(controls).filter(([,n])=>!n.disabled).map(([key,n])=>[key,n.value]);} [Symbol.iterator](){return this.items[Symbol.iterator]();}}
  vm.runInNewContext(code,{document,localStorage,FormData,bindings,navigator:{onLine:true,...(serviceWorker?{serviceWorker}:{})},location:{protocol:'http:'},window:{addEventListener:()=>{}},console,MessageChannel,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  function dispatch(node,type,target=node){for(const fn of node.listeners[type]||[])fn({target,preventDefault(){}});attachOwner(result);}
  return {document,controls,store,result,timers,channels,get closedPorts(){return closedPorts;},expire(){for(const [id,{fn}] of [...timers]){timers.delete(id);fn();}},change(name,value){controls[name].value=value;dispatch(form,'input',controls[name]);dispatch(form,'change',controls[name]);},input(name,value){controls[name].value=value;dispatch(form,'input',controls[name]);},submit(){dispatch(form,'submit');},clear(){dispatch(document.nodes.get('clear-session'),'click');},text(id){return document.nodes.get(id).textContent;}};
}

function fillKnown(h) { for(const [key,value] of Object.entries({food:'milk',durationKnown:'known',outageMinutes:'180',doors:'closed',initialCold:'yes',coldSource:'no',spoilage:'no'}))h.change(key,value); }

test('handler flow reviews a synthetic food, focuses result and persists only input choices',()=>{
  const h=harness();fillKnown(h);h.submit();
  assert.match(h.result.textContent,/Within the general closed-door window/);
  assert.equal(h.document.focused.id,'result-title');
  const saved=JSON.parse(h.store.get('coldpause-session-v1'));assert.equal(saved.food,'milk');assert.ok(!saved.result);assert.deepEqual(Object.keys(saved).sort(),Object.keys(bindings.DEFAULTS).sort());
  assert.match(h.text('announcement'),/Milk/);
});

test('each edit removes previous guidance and requires explicit review',()=>{
  const h=harness();fillKnown(h);h.submit();h.input('outageMinutes','241');
  assert.match(h.result.textContent,/Facts changed/);assert.doesNotMatch(h.result.textContent,/Within the general/);
  h.submit();assert.match(h.result.textContent,/Discard this food/);
  h.change('durationKnown','unknown');assert.equal(h.controls.outageMinutes.value,'');assert.equal(h.controls.outageMinutes.disabled,true);
  h.submit();assert.match(h.result.textContent,/not enough evidence/);assert.doesNotMatch(h.result.textContent,/Discard this food/);
});

test('editing a reviewed result keeps the decorative pause symbol excluded from accessibility semantics',()=>{
  const h=harness();fillKnown(h);h.submit();h.input('outageMinutes','181');
  const symbol=h.result.children.find(node=>node.className==='result-symbol');
  assert.ok(symbol);assert.equal(symbol.attrs['aria-hidden'],'true');
  assert.match(h.result.textContent,/Facts changed\. Review again/);
  assert.equal(h.text('announcement'),'Facts changed. Previous guidance removed.');
});

test('switching foods clears food-specific evidence while retaining outage facts',()=>{
  const h=harness();fillKnown(h);h.change('evidence','warm');h.change('warmMinutes','121');h.submit();assert.match(h.result.textContent,/Discard this food/);
  h.change('food','butter');assert.equal(h.controls.evidence.value,'unknown');assert.equal(h.controls.warmMinutes.value,'');assert.equal(h.controls.spoilage.value,'unknown');assert.equal(h.controls.initialCold.value,'unknown');assert.equal(h.controls.coldSource.value,'unknown');assert.equal(h.controls.outageMinutes.value,'180');assert.equal(h.controls.doors.value,'closed');assert.match(h.result.textContent,/Facts changed/);
  h.submit();assert.match(h.result.textContent,/not enough evidence/);assert.doesNotMatch(h.result.textContent,/chart lists Keep/);
});

test('switching temperature modes removes inactive warm measurements',()=>{
  const h=harness();fillKnown(h);h.change('evidence','warm');h.change('warmMinutes','121');assert.equal(h.controls.warmMinutes.disabled,false);
  h.change('evidence','restored');assert.equal(h.controls.warmMinutes.value,'');assert.equal(h.controls.warmMinutes.disabled,true);
  h.submit();assert.match(h.result.textContent,/Earlier exposure is still unknown/);
});

test('validation focuses linked error summary and clears invalid field state on edit',()=>{
  const h=harness();h.submit();assert.equal(h.document.focused.id,'errors');assert.equal(h.controls.food.attrs['aria-invalid'],'true');
  h.change('food','milk');assert.equal(h.controls.food.attrs['aria-invalid'],undefined);fillKnown(h);h.change('evidence','warm');h.change('warmMinutes','181');h.submit();assert.match(h.text('errors'),/cannot exceed/);assert.equal(h.controls.warmMinutes.attrs['aria-invalid'],'true');
});

test('clear is repeatable, removes saved choices and result, resets hidden fields and focuses food',()=>{
  const h=harness();fillKnown(h);h.change('evidence','warm');h.change('warmMinutes','121');h.submit();
  for(let i=0;i<2;i++){h.clear();assert.equal(h.store.size,0);assert.equal(h.controls.food.value,'');assert.equal(h.controls.outageMinutes.value,'');assert.equal(h.controls.warmMinutes.value,'');assert.equal(h.controls.warmMinutes.disabled,true);assert.equal(h.document.focused.id,'food');assert.match(h.result.textContent,/A pause before a decision/);assert.match(h.text('session-status'),/Session cleared/);}
});

test('reload restores choices without restoring or generating a decision',()=>{
  const first=harness();fillKnown(first);first.submit();
  const h=harness({saved:first.store.get('coldpause-session-v1')});assert.equal(h.controls.food.value,'milk');assert.equal(h.controls.outageMinutes.value,'180');assert.equal(h.controls.outageMinutes.disabled,false);assert.match(h.result.textContent,/A pause before a decision/);assert.match(h.text('session-status'),/Review this food again/);
});

test('corrupt or unavailable storage remains explicit and never crashes the check',()=>{
  const corrupt=harness({saved:'{bad'});assert.match(corrupt.text('session-status'),/could not be restored/);assert.equal(corrupt.controls.food.value,'');
  const h=harness({storageFails:true});fillKnown(h);h.submit();assert.match(h.result.textContent,/Within the general/);assert.match(h.text('session-status'),/saving is unavailable/);h.clear();assert.match(h.text('session-status'),/stored data could not be checked/);
});

test('unsupported offline environment never claims offline readiness',()=>{
  const h=harness();assert.equal(h.text('offline-status'),'Offline copy not ready');
});

test('clearing a session never promises an unverified offline copy',()=>{
  const h=harness();h.clear();
  assert.equal(h.text('offline-status'),'Offline copy not ready');
  assert.match(h.text('session-status'),/Session cleared\. No food choices saved/);
  assert.match(h.text('session-status'),/cache settings are unchanged/);
  assert.doesNotMatch(h.text('session-status'),/offline.*available/i);
});

const flush = async () => { for(let i=0;i<20;i++)await Promise.resolve(); };
test('failed first install cannot leave readiness pending indefinitely', async()=>{
  const h=harness({serviceWorker:{register:async()=>({}),ready:new Promise(()=>{})}});
  await flush();assert.equal(h.timers.size,1);h.expire();await flush();
  assert.equal(h.text('offline-status'),'Offline copy not ready');assert.equal(h.timers.size,0);
});
test('missing cache reply times out, closes ports and never claims readiness', async()=>{
  const h=harness({serviceWorker:{register:async()=>({}),ready:Promise.resolve({active:{postMessage(){}}})},reply:null});
  await flush();assert.equal(h.timers.size,1);h.expire();await flush();
  assert.equal(h.text('offline-status'),'Offline copy not ready');assert.equal(h.closedPorts,2);assert.equal(h.timers.size,0);
});
test('complete cache reply establishes readiness and clears timers and ports',async()=>{
  const h=harness({serviceWorker:{register:async()=>({}),ready:Promise.resolve({active:{postMessage(){}}})}});
  await flush();assert.equal(h.text('offline-status'),'Offline copy ready');assert.equal(h.closedPorts,2);assert.equal(h.timers.size,0);
});
test('incomplete cache and registration failure stay explicitly not ready',async()=>{
  const h=harness({serviceWorker:{register:async()=>({}),ready:Promise.resolve({active:{postMessage(){}}})},reply:false});
  const failed=harness({serviceWorker:{register:async()=>{throw Error('blocked')},ready:new Promise(()=>{})}});
  await flush();assert.equal(h.text('offline-status'),'Offline copy not ready');assert.equal(failed.text('offline-status'),'Offline copy not ready');assert.equal(h.closedPorts,2);
});

test('a late worker or cache reply cannot turn a timed-out check ready',async()=>{
  let activate;
  const pending=harness({serviceWorker:{register:async()=>({}),ready:new Promise(r=>activate=r)}});
  await flush();pending.expire();await flush();activate({active:{postMessage(){}}});await flush();
  assert.equal(pending.text('offline-status'),'Offline copy not ready');assert.equal(pending.channels.length,0);
  const h=harness({serviceWorker:{register:async()=>({}),ready:Promise.resolve({active:{postMessage(){}}})},reply:null});
  await flush();h.expire();await flush();h.channels[0].port1.onmessage({data:{ready:true}});await flush();
  assert.equal(h.text('offline-status'),'Offline copy not ready');assert.equal(h.closedPorts,2);
});
