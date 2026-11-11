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
  // Test double for the number-state value sanitizer, not food validation.
  // https://html.spec.whatwg.org/multipage/input.html#number-state-(type=number)
  set value(v){const s=String(v);this._value=this.tagName==='input'&&this.type==='number'&&(!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(s)||!Number.isFinite(Number(s)))?'':s;}
  get value(){return this._value;}
  cloneNode(){const n=new Node(this.tagName);n.type=this.type;n.disabled=this.disabled;n.attrs={...this.attrs};n.value=this.value;return n;}
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
  contains(node){return node===this||this.descendants().includes(node);}
  focus(){this.owner.focused=this;}
  scrollIntoView(options){this.scrollOptions=options;}
}

function harness({saved=null,storageFails=false,serviceWorker,reply=true,sharedStore,beforeGet,beforeSet,beforeRemove,lockRequest,noLocks=false,reload}={}) {
  const lifecycle = {document:{},window:{}};
  const timers = new Map(); const channels=[]; let timerId=0, closedPorts=0;
  class MessageChannel { constructor(){ channels.push(this); this.port1={close(){closedPorts++}}; this.port2={close(){closedPorts++}}; if(reply!==null)queueMicrotask(()=>this.port1.onmessage?.({data:{ready:reply}})); } }
  const document={nodes:new Map(),focused:null,visibilityState:'visible',addEventListener:(type,fn)=>{(lifecycle.document[type]??=[]).push(fn);},querySelector(selector){return this.nodes.get(selector.slice(1));},getElementById(id){return this.nodes.get(id);},createElement(tag){const n=new Node(tag);n.owner=this;return n;}};
  Object.defineProperty(document,'activeElement',{get(){return this.focused;}});
  const make=(id,tag='div')=>{const n=new Node(tag);n.id=id;n.owner=document;document.nodes.set(id,n);return n;};
  for(const match of html.matchAll(/\bid="([^"]+)"/g))make(match[1]);
  document.nodes.get('fact-check-note').hidden=true;
  const form=document.nodes.get('food-form'), controls={};
  for(const match of html.matchAll(/<select([^>]+)>(.*?)<\/select>/gs)) {
    const id=match[1].match(/id="([^"]+)"/)[1],name=match[1].match(/name="([^"]+)"/)[1],value=match[2].match(/value="([^"]*)"/)[1];
    const n=document.nodes.get(id);n.tagName='select';n.name=name;n.value=value;n.defaultValue=value;controls[name]=n;
  }
  for(const match of html.matchAll(/<input([^>]+)>/g)) {
    const type=match[1].match(/type="([^"]+)"/)[1],name=match[1].match(/name="([^"]+)"/)[1];
    if(type==='radio'){if(!controls[name])controls[name]={value:'',defaultValue:'',name};if(match[1].includes('checked'))controls[name].value=controls[name].defaultValue=match[1].match(/value="([^"]*)"/)[1];}
    else {const id=match[1].match(/id="([^"]+)"/)[1],n=document.nodes.get(id);n.name=name;n.tagName='input';n.type=type;n.value='';n.defaultValue='';controls[name]=n;}
  }
  form.elements={...controls,namedItem:key=>controls[key]};form.reset=()=>Object.values(controls).forEach(n=>n.value=n.defaultValue);
  form.querySelectorAll=()=>Object.values(controls).filter(n=>n.attrs?.['aria-invalid']);
  const result=document.nodes.get('result');result.innerHTML=html.match(/<section id="result"[^>]*>(.*?)<\/section>/s)[1];result.className='result empty';
  const attachOwner=node=>{node.owner=document;for(const child of node.children)attachOwner(child);};attachOwner(result);
  const store=sharedStore??new Map(saved===null?[]:[['coldpause-session-v1',saved]]);
  const localStorage={getItem:key=>{beforeGet?.(key,store);if(storageFails)throw Error('blocked');return store.get(key)??null;},setItem:(key,v)=>{beforeSet?.(key,v,store);if(storageFails)throw Error('blocked');store.set(key,v);},removeItem:key=>{beforeRemove?.(key,store);if(storageFails)throw Error('blocked');store.delete(key);}};
  class FormData {constructor(){this.items=Object.entries(controls).filter(([,n])=>!n.disabled).map(([key,n])=>[key,n.value]);} [Symbol.iterator](){return this.items[Symbol.iterator]();}}
  vm.runInNewContext(code,{document,localStorage,FormData,bindings,AbortController,navigator:{...(noLocks?{}:{locks:{request:lockRequest??(async(name,options,callback)=>callback())}}),onLine:true,...(serviceWorker?{serviceWorker}:{})},location:{protocol:'http:',reload:reload??(()=>{})},window:{addEventListener:(type,fn)=>{(lifecycle.window[type]??=[]).push(fn);}},console,MessageChannel,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  function dispatch(node,type,target=node){for(const fn of node.listeners[type]||[])fn({target,preventDefault(){}});attachOwner(result);}
  return {document,controls,store,result,timers,channels,get closedPorts(){return closedPorts;},event(target,type,data={}){for(const fn of lifecycle[target][type]||[])fn(data);attachOwner(result);},visibility(value){document.visibilityState=value;this.event('document','visibilitychange');},click(node){dispatch(node,'click');},expire(){for(const [id,{fn}] of [...timers]){timers.delete(id);fn();}},change(name,value){controls[name].value=value;dispatch(form,'input',controls[name]);dispatch(form,'change',controls[name]);},input(name,value){controls[name].value=value;dispatch(form,'input',controls[name]);},submit(){dispatch(form,'submit');},clear(){dispatch(document.nodes.get('clear-session'),'click');},text(id){return document.nodes.get(id).textContent;}};
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
  assert.match(symbol.innerHTML, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(symbol.innerHTML, /<path d=/);
  assert.doesNotMatch(symbol.textContent, /Ⅱ/);
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

test('clear is repeatable, removes saved choices and result, resets hidden fields and focuses food',async()=>{
  const h=harness();fillKnown(h);h.change('evidence','warm');h.change('warmMinutes','121');h.submit();
  for(let i=0;i<2;i++){h.clear();await flush();assert.equal(h.store.has('coldpause-session-v1'),false);assert.deepEqual([...h.store.keys()],['coldpause-session-v1.generation']);assert.equal(h.controls.food.value,'');assert.equal(h.controls.outageMinutes.value,'');assert.equal(h.controls.warmMinutes.value,'');assert.equal(h.controls.warmMinutes.disabled,true);assert.equal(h.document.focused.id,'food');assert.match(h.result.textContent,/A pause before a decision/);assert.match(h.text('session-status'),/Session cleared/);}
});

test('reload restores choices without restoring or generating a decision',()=>{
  const first=harness();fillKnown(first);first.submit();
  const h=harness({saved:first.store.get('coldpause-session-v1')});assert.equal(h.controls.food.value,'milk');assert.equal(h.controls.outageMinutes.value,'180');assert.equal(h.controls.outageMinutes.disabled,false);assert.match(h.result.textContent,/A pause before a decision/);assert.match(h.text('session-status'),/not a current reading/);assert.match(h.text('session-status'),/update the duration/);assert.equal(h.document.nodes.get('fact-check-note').hidden,false);
});

test('corrupt or unavailable storage remains explicit and never crashes the check',()=>{
  const corrupt=harness({saved:'{bad'});assert.match(corrupt.text('session-status'),/could not be restored/);assert.equal(corrupt.controls.food.value,'');
  const h=harness({storageFails:true});fillKnown(h);h.submit();assert.match(h.result.textContent,/Within the general/);assert.match(h.text('session-status'),/saving is unavailable/);h.clear();assert.match(h.text('session-status'),/stored data could not be checked/);
});

test('unsupported offline environment never claims offline readiness',()=>{
  const h=harness();assert.equal(h.text('offline-status'),'Offline copy not ready');
});

test('clearing a session never promises an unverified offline copy',async()=>{
  const h=harness();h.clear();await flush();
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

test('returning to a hidden reviewed page removes the old snapshot without changing facts or storage',async()=>{
  const h=harness();fillKnown(h);h.submit();await flush();
  const before=h.store.get('coldpause-session-v1');const focused=h.controls.outageMinutes;focused.focus();
  h.visibility('hidden');assert.match(h.result.textContent,/Within the general closed-door window/);
  h.visibility('visible');await flush();
  assert.match(h.result.textContent,/Check your facts after returning/);
  assert.doesNotMatch(h.result.textContent,/Within the general closed-door window/);
  assert.match(h.result.textContent,/update the total outage minutes/);
  assert.match(h.result.textContent,/not a running timer/);
  assert.match(h.result.textContent,/Never taste food to test it/);
  assert.equal(h.controls.outageMinutes.value,'180');assert.equal(h.store.get('coldpause-session-v1'),before);
  assert.equal(h.document.focused,focused);assert.equal(h.document.nodes.get('fact-check-note').hidden,false);
});

test('a prior discard warning remains explicit after an interruption and repeated return events are idempotent',()=>{
  const h=harness();fillKnown(h);h.change('outageMinutes','241');h.submit();
  assert.match(h.result.textContent,/Discard this food/);h.visibility('hidden');h.visibility('visible');
  assert.equal(h.result.className,'result discard');assert.match(h.result.textContent,/Your previous review advised: Discard this food/);
  assert.match(h.result.textContent,/Leaving the page does not reverse that advice/);
  assert.match(h.text('announcement'),/previous review advised discarding/);
  const text=h.result.textContent,notice=h.text('announcement'),heading=h.result.querySelector('h2');
  h.event('window','focus');h.event('window','pageshow',{persisted:true});h.visibility('hidden');h.visibility('visible');
  assert.equal(h.result.textContent,text);assert.equal(h.text('announcement'),notice);assert.equal(h.result.querySelector('h2'),heading);
});

test('back-forward restored results pause even when there was no observed visibility event',()=>{
  const h=harness();fillKnown(h);h.submit();
  h.event('window','pageshow',{persisted:true});assert.match(h.result.textContent,/Check your facts after returning/);
  assert.equal(h.controls.outageMinutes.value,'180');assert.equal(h.document.focused.id,'result-title');
});

test('focus alone and ordinary pageshow do not invalidate a current review',()=>{
  const h=harness();fillKnown(h);h.submit();const heading=h.result.querySelector('h2');
  h.event('window','focus');h.event('window','pageshow',{persisted:false});h.visibility('visible');
  assert.equal(h.result.querySelector('h2'),heading);assert.match(h.result.textContent,/Within the general closed-door window/);
});

test('pagehide followed by visible focus pauses once without requiring a persisted pageshow',()=>{
  const h=harness();fillKnown(h);h.submit();h.event('window','pagehide');h.event('window','focus');
  assert.match(h.result.textContent,/Check your facts after returning/);
  const button=h.result.querySelector('button');h.click(button);
  assert.equal(h.document.focused.id,'outage-facts');assert.deepEqual({...h.document.focused.scrollOptions},{block:'start',behavior:'auto'});
});

test('new review requires explicit submission, uses updated entries, and can be paused again',()=>{
  const h=harness();fillKnown(h);h.submit();h.visibility('hidden');h.visibility('visible');
  h.input('outageMinutes','241');assert.match(h.result.textContent,/Facts changed/);
  assert.equal(h.document.nodes.get('fact-check-note').hidden,false);
  h.submit();assert.match(h.result.textContent,/Discard this food/);assert.equal(h.document.nodes.get('fact-check-note').hidden,true);
  h.visibility('hidden');h.visibility('visible');assert.match(h.result.textContent,/previous review advised: Discard this food/);
});

test('drafts, invalid forms and cleared sessions never gain a paused or restored decision',()=>{
  const h=harness();fillKnown(h);h.visibility('hidden');h.visibility('visible');assert.match(h.result.textContent,/A pause before a decision/);
  h.input('outageMinutes','');h.submit();h.event('window','pageshow',{persisted:true});assert.match(h.text('errors'),/whole number/);assert.doesNotMatch(h.result.textContent,/Check your facts after returning/);
  h.input('outageMinutes','241');h.submit();h.visibility('hidden');h.clear();h.visibility('visible');h.event('window','pageshow',{persisted:true});
  assert.match(h.result.textContent,/A pause before a decision/);assert.doesNotMatch(h.result.textContent,/Discard/);assert.equal(h.document.nodes.get('fact-check-note').hidden,true);
});

test('a restored snapshot retains its fact-check reminder through edits until an explicit review',()=>{
  const first=harness();fillKnown(first);first.submit();const h=harness({saved:first.store.get('coldpause-session-v1')});
  h.input('outageMinutes','181');assert.equal(h.document.nodes.get('fact-check-note').hidden,false);
  assert.match(h.result.textContent,/A pause before a decision/);h.submit();assert.equal(h.document.nodes.get('fact-check-note').hidden,true);
  assert.match(h.result.textContent,/not a live reading/);
});

// Shared backing store without automatic storage-event delivery models a suspended
// peer. These are handler tests, not a native background-tab timing claim.
test('a stale empty tab cannot resurrect choices after another tab saves then clears',async()=>{
  const sharedStore=new Map(), a=harness({sharedStore}), b=harness({sharedStore});
  a.change('food','milk');await flush();a.clear();await flush();
  assert.equal(sharedStore.has('coldpause-session-v1'),false);
  b.change('food','chicken');await flush();
  assert.equal(sharedStore.has('coldpause-session-v1'),false);
  assert.equal(b.controls.food.value,'chicken');
  assert.match(b.text('session-status'),/Saved choices changed/);
});
test('same-JSON ABA is detected even before delayed storage events arrive',async()=>{
  const sharedStore=new Map(), a=harness({sharedStore});a.change('food','milk');await flush();
  const b=harness({sharedStore});
  a.input('outageMinutes','3');await flush(); // inactive duration retains identical normalized JSON
  b.change('food','chicken');await flush();
  assert.equal(JSON.parse(sharedStore.get('coldpause-session-v1')).food,'milk');
  assert.match(b.text('session-status'),/Saved choices changed/);
});

const DATA_KEY='coldpause-session-v1', GENERATION_KEY=`${DATA_KEY}.generation`;
test('clear of an empty session invalidates a suspended peer and retains no food data',async()=>{
 const sharedStore=new Map(),a=harness({sharedStore}),b=harness({sharedStore});
 a.clear();await flush();b.change('food','milk');await flush();
 assert.equal(sharedStore.has(DATA_KEY),false);assert.deepEqual([...sharedStore.keys()],[GENERATION_KEY]);
 assert.match(b.text('session-status'),/Saved choices changed/);
});
test('legacy choices migrate on first edit and a fresh reload can save after clear',async()=>{
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})]]);
 const a=harness({sharedStore});assert.equal(a.controls.food.value,'milk');a.clear();await flush();
 const b=harness({sharedStore});b.change('food','chicken');await flush();
 assert.equal(JSON.parse(sharedStore.get(DATA_KEY)).food,'chicken');
 assert.match(b.text('session-status'),/Choices saved/);
});
test('generation write failure prevents food changes and removal',async()=>{
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})]]);
 const before=sharedStore.get(DATA_KEY);const a=harness({sharedStore,beforeSet(key){if(key===GENERATION_KEY)throw Error('quota');}});
 a.change('food','chicken');await flush();assert.equal(sharedStore.get(DATA_KEY),before);
 a.clear();await flush();assert.equal(sharedStore.get(DATA_KEY),before);assert.equal(sharedStore.has(GENERATION_KEY),false);
 assert.match(a.text('session-status'),/could not be removed/);
});
test('failed data removal advances marker but retains choices and blocks subsequent stale write',async()=>{
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})]]);
 const before=sharedStore.get(DATA_KEY);const a=harness({sharedStore,beforeRemove(){throw Error('denied');}}),b=harness({sharedStore});
 a.clear();await flush();assert.equal(sharedStore.get(DATA_KEY),before);assert.equal(sharedStore.get(GENERATION_KEY),'1');
 assert.match(a.text('session-status'),/Coordination metadata may have changed/);
 a.change('food','chicken');b.change('food','rice');await flush();
 assert.equal(sharedStore.get(DATA_KEY),before);assert.match(a.text('session-status'),/Saved choices changed/);assert.match(b.text('session-status'),/Saved choices changed/);
});
test('failed data write preserves choices and requires reload after marker advance',async()=>{
 const sharedStore=new Map();const a=harness({sharedStore,beforeSet(key){if(key===DATA_KEY)throw Error('quota');}});
 a.change('food','chicken');await flush();assert.equal(sharedStore.has(DATA_KEY),false);assert.equal(sharedStore.get(GENERATION_KEY),'1');
 a.change('food','milk');await flush();assert.match(a.text('session-status'),/Saved choices changed/);
});
test('malformed or exhausted coordination metadata fails closed without restoring old choices',async()=>{
 for(const marker of ['-1','01','1e2','NaN','9007199254740991','999999999999999999999']){
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})],[GENERATION_KEY,marker]]);
 const a=harness({sharedStore});assert.equal(a.controls.food.value,'');a.change('food','chicken');await flush();
 assert.equal(sharedStore.get(GENERATION_KEY),marker);assert.equal(JSON.parse(sharedStore.get(DATA_KEY)).food,'milk');assert.match(a.text('session-status'),/saving is unavailable/);
 }
});
test('generation change during initial snapshot refuses stale restoration and writes',async()=>{
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})],[GENERATION_KEY,'1']]);let reads=0;
 const a=harness({sharedStore,beforeGet(key,store){if(key===GENERATION_KEY&&++reads===2)store.set(GENERATION_KEY,'2');}});
 assert.equal(a.controls.food.value,'');a.change('food','chicken');await flush();assert.equal(JSON.parse(sharedStore.get(DATA_KEY)).food,'milk');
});
test('initial new-generation old-data interleaving conflicts after writer finishes',async()=>{
 const sharedStore=new Map([[DATA_KEY,JSON.stringify({...bindings.DEFAULTS,food:'milk'})],[GENERATION_KEY,'2']]);
 const a=harness({sharedStore});sharedStore.delete(DATA_KEY); // existing locked writer completes clear before our lock
 a.change('food','chicken');await flush();assert.equal(sharedStore.has(DATA_KEY),false);assert.match(a.text('session-status'),/Saved choices changed/);
});
test('queued stale write checks generation after preceding reset releases its lock',async()=>{
 const sharedStore=new Map();let queued;const a=harness({sharedStore});
 const b=harness({sharedStore,lockRequest:async(name,options,callback)=>new Promise(resolve=>{queued=()=>resolve(callback());})});
 b.change('food','milk');a.clear();await flush();queued();await flush();
 assert.equal(sharedStore.has(DATA_KEY),false);assert.match(b.text('session-status'),/Saved choices changed/);
});
test('non-null A to B to A history cannot be overwritten by a stale peer',async()=>{
 const sharedStore=new Map(),a=harness({sharedStore});a.change('food','milk');await flush();
 const b=harness({sharedStore}), original=sharedStore.get(DATA_KEY);
 a.change('food','chicken');await flush();a.change('food','milk');await flush();assert.equal(sharedStore.get(DATA_KEY),original);
 b.change('food','rice');await flush();assert.equal(sharedStore.get(DATA_KEY),original);assert.match(b.text('session-status'),/Saved choices changed/);
});

function exitWarning(h) {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  h.event('window', 'beforeunload', event);
  return event;
}

test('failed or unavailable saving retains the exit warning after writes settle', async () => {
  for (const options of [
    { storageFails: true },
    { beforeSet() { throw Error('quota'); } },
    { beforeSet(key) { if (key === DATA_KEY) throw Error('quota'); } },
    { lockRequest: async () => { throw Error('lock unavailable'); } }
  ]) {
    const h = harness(options);
    assert.equal(exitWarning(h).prevented, false);
    h.change('food', 'milk'); await flush();
    assert.equal(exitWarning(h).prevented, true);
    assert.equal(exitWarning(h).returnValue, '');
    assert.equal(h.controls.food.value, 'milk');
  }
});

test('settled cross-tab conflict warns without restoring cleared food data', async () => {
  const sharedStore = new Map(), a = harness({ sharedStore }), b = harness({ sharedStore });
  a.change('food', 'milk'); await flush(); a.clear(); await flush();
  b.change('food', 'chicken'); await flush();
  assert.equal(sharedStore.has(DATA_KEY), false);
  assert.equal(exitWarning(b).prevented, true);
  assert.equal(sharedStore.has(DATA_KEY), false);
});

test('missing Web Locks protects session-only choices and exact blank reversion clears it', async () => {
  const h = harness({ noLocks: true });
  h.change('food', 'milk'); await flush();
  assert.equal(exitWarning(h).prevented, true);
  assert.equal(h.store.has(DATA_KEY), false);
  h.change('food', ''); await flush();
  assert.equal(exitWarning(h).prevented, false);
});

test('successful saves, restored choices and successful clears do not warn after settling', async () => {
  const h = harness(); fillKnown(h); await flush();
  assert.equal(exitWarning(h).prevented, false);
  const restored = harness({ saved: h.store.get(DATA_KEY) });
  assert.equal(exitWarning(restored).prevented, false);
  h.clear(); await flush(); assert.equal(exitWarning(h).prevented, false);
});

test('pending write stays protected until its actual saved outcome', async () => {
  let release;
  const h = harness({ lockRequest: async (name, options, callback) => new Promise(resolve => { release = () => resolve(callback()); }) });
  h.input('food', 'milk');
  assert.equal(exitWarning(h).prevented, true);
  release(); await flush();
  assert.equal(exitWarning(h).prevented, false);
});

test('failed clear remains protected because reload would restore the old choices', async () => {
  const saved = JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' });
  const h = harness({ saved, beforeRemove() { throw Error('denied'); } });
  h.clear(); await flush();
  assert.equal(h.controls.food.value, '');
  assert.equal(h.store.get(DATA_KEY), saved);
  assert.equal(exitWarning(h).prevented, true);
  h.change('food', 'milk'); await flush();
  assert.match(h.text('session-status'), /Saved choices changed/);
  assert.equal(exitWarning(h).prevented, false);
});

test('delayed peer clear protects formerly saved choices even without a local edit', async () => {
  const sharedStore = new Map(), a = harness({ sharedStore });
  a.change('food', 'milk'); await flush();
  const b = harness({ sharedStore });
  assert.equal(exitWarning(b).prevented, false);
  a.clear(); await flush();
  assert.equal(exitWarning(b).prevented, true);
  assert.equal(b.controls.food.value, 'milk');
  assert.equal(sharedStore.has(DATA_KEY), false);
});

test('same normalized recoverable choices need no warning despite generation conflict', async () => {
  const saved = JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' });
  const sharedStore = new Map([[DATA_KEY, saved]]), h = harness({ sharedStore });
  sharedStore.set(GENERATION_KEY, '8');
  sharedStore.set(DATA_KEY, JSON.stringify({ food: 'milk', extra: 'ignored', ...bindings.DEFAULTS, food: 'milk' }));
  h.input('food', 'milk'); await flush();
  assert.match(h.text('session-status'), /Saved choices changed/);
  assert.equal(exitWarning(h).prevented, false);
});

test('unreadable storage protects nonblank restored choices and failed blank clear', async () => {
  let unreadable = false;
  const saved = JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' });
  const h = harness({ saved, beforeGet() { if (unreadable) throw Error('denied'); } });
  assert.equal(exitWarning(h).prevented, false);
  unreadable = true;
  assert.equal(exitWarning(h).prevented, true);
  h.clear(); await flush();
  assert.equal(exitWarning(h).prevented, true);
});

test('corrupt initial storage does not warn for an untouched blank form', async () => {
  for (const saved of ['{bad', 'null', '42']) {
    const h = harness({ saved });
    assert.equal(exitWarning(h).prevented, false);
    h.change('food', 'chicken'); await flush();
    // Corrupt legacy data can be replaced safely when its exact snapshot is still current.
    assert.equal(exitWarning(h).prevented, false);
  }
});

test('interleaved exit read falls back conservatively without writing anything', () => {
  let interleave = false, reads = 0;
  const sharedStore = new Map([[DATA_KEY, JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' })]]);
  const h = harness({ sharedStore, beforeGet(key, store) {
    if (interleave && key === GENERATION_KEY && ++reads === 2) store.set(GENERATION_KEY, '1');
  } });
  interleave = true;
  const before = sharedStore.get(DATA_KEY);
  assert.equal(exitWarning(h).prevented, true);
  assert.equal(sharedStore.get(DATA_KEY), before);
});

test('explicit discard exempts only its next navigation and further edits remain protected', async () => {
  const h = harness({ noLocks: true });
  h.change('food', 'milk'); await flush();
  h.click(h.document.nodes.get('reload-choices'));
  assert.equal(exitWarning(h).prevented, false);
  assert.equal(exitWarning(h).prevented, true);
  h.click(h.document.nodes.get('reload-choices'));
  h.input('food', 'chicken'); await flush();
  assert.equal(exitWarning(h).prevented, true);
  h.click(h.document.nodes.get('reload-choices'));
  h.event('window', 'pageshow', { persisted: true });
  assert.equal(exitWarning(h).prevented, true);
});

test('a failed explicit reload does not disable later exit protection', async () => {
  const h = harness({ noLocks: true, reload() { throw Error('navigation failed'); } });
  h.change('food', 'milk'); await flush();
  h.click(h.document.nodes.get('reload-choices'));
  assert.equal(exitWarning(h).prevented, true);
});


test('known peer choices remain protected if later storage reads and Clear fail', async () => {
  for (const observe of ['exit', 'conflict']) {
    let unreadable = false;
    const sharedStore = new Map(), h = harness({ sharedStore, beforeGet() {
      if (unreadable) throw Error('read denied');
    } });
    sharedStore.set(DATA_KEY, JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' }));
    sharedStore.set(GENERATION_KEY, '1');
    if (observe === 'exit') assert.equal(exitWarning(h).prevented, true);
    else { h.clear(); await flush(); assert.match(h.text('session-status'), /Saved choices changed/); }
    unreadable = true;
    h.clear(); await flush();
    assert.equal(h.controls.food.value, '');
    assert.equal(JSON.parse(sharedStore.get(DATA_KEY)).food, 'milk');
    assert.equal(exitWarning(h).prevented, true, observe);
  }
});

test('failed Clear protects an unseen peer save even when the tab has only ever been blank', async () => {
  let blocked = false;
  const sharedStore = new Map(), h = harness({ sharedStore, beforeGet() { if (blocked) throw Error('denied'); } });
  assert.equal(exitWarning(h).prevented, false);
  sharedStore.set(DATA_KEY, JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' }));
  sharedStore.set(GENERATION_KEY, '1'); // Deliberately do not deliver a storage event.
  const before = [...sharedStore];
  blocked = true;
  for (let i = 0; i < 2; i++) {
    h.clear(); await flush();
    assert.match(h.text('session-status'), /could not be removed/);
    assert.equal(h.controls.food.value, '');
    assert.equal(exitWarning(h).prevented, true);
  }
  h.input('food', ''); await flush(); // A failed no-op edit cannot verify the Clear.
  assert.equal(exitWarning(h).prevented, true);
  assert.equal(harness({ sharedStore }).controls.food.value, 'milk');
  assert.deepEqual([...sharedStore], before);
});

test('prior verified empty recovery cannot resolve a later unreadable Clear; fresh reads can', async () => {
  for (const peerSaved of [false, true]) {
    let blocked = false;
    const sharedStore = new Map(), h = harness({ sharedStore, beforeGet() { if (blocked) throw Error('denied'); } });
    assert.equal(exitWarning(h).prevented, false);
    if (peerSaved) { sharedStore.set(DATA_KEY, JSON.stringify({ ...bindings.DEFAULTS, food: 'milk' })); sharedStore.set(GENERATION_KEY, '1'); }
    blocked = true;
    h.clear(); await flush();
    assert.equal(exitWarning(h).prevented, true, 'same uncertainty whether or not an unseen peer saved');
    blocked = false;
    assert.equal(exitWarning(h).prevented, peerSaved);
    blocked = true;
    assert.equal(exitWarning(h).prevented, peerSaved, 'retain the newly verified recovery state');
  }
});

test('unavailable storage leaves untouched blank pages quiet but cannot verify an attempted Clear', async () => {
  for (const noLocks of [false, true]) {
    const h = harness({ storageFails: true, noLocks });
    assert.equal(exitWarning(h).prevented, false);
    h.clear(); await flush();
    assert.equal(exitWarning(h).prevented, true);
    assert.match(h.text('session-status'), /stored data could not be checked or removed/);
  }
});

test('failed no-op Clear stays quiet once a fresh readable snapshot verifies blank recovery', async () => {
  for (const options of [
    { noLocks: true },
    { beforeSet() { throw Error('denied'); } },
    { beforeRemove() { throw Error('denied'); } },
    { lockRequest: async () => { throw Error('unavailable'); } }
  ]) {
    let blocked = false;
    const h = harness({ ...options, beforeGet() { if (blocked) throw Error('denied'); } });
    h.clear(); await flush();
    assert.equal(h.store.has(DATA_KEY), false);
    assert.equal(exitWarning(h).prevented, false);
    blocked = true;
    assert.equal(exitWarning(h).prevented, false);
  }
});

test('successful save or Clear resolves earlier unverified Clear without an exit read', async () => {
  for (const operation of ['save', 'clear']) {
    let blocked = false, rejectLock = true;
    const h = harness({ beforeGet() { if (blocked) throw Error('denied'); }, lockRequest: async (name, options, callback) => {
      if (rejectLock) throw Error('unavailable'); return callback();
    } });
    h.clear(); await flush(); blocked = true;
    assert.equal(exitWarning(h).prevented, true);
    blocked = false; rejectLock = false;
    if (operation === 'save') h.input('food', ''); else h.clear();
    await flush(); blocked = true;
    assert.equal(exitWarning(h).prevented, false, operation);
  }
});

test('verified recovery equality does not relax raw cross-tab write guards after failed Clear', async () => {
  let blocked = false;
  const sharedStore = new Map(), h = harness({ sharedStore, beforeGet() { if (blocked) throw Error('denied'); } });
  sharedStore.set(GENERATION_KEY, '2');
  blocked = true; h.clear(); await flush(); assert.equal(exitWarning(h).prevented, true);
  blocked = false; assert.equal(exitWarning(h).prevented, false);
  h.change('food', 'milk'); await flush();
  assert.match(h.text('session-status'), /Saved choices changed/);
  assert.equal(sharedStore.has(DATA_KEY), false);
  assert.equal(sharedStore.get(GENERATION_KEY), '2');
});

test('unverified Clear resets a stale discard exemption and intentional discard remains single-use', async () => {
  const h = harness({ storageFails: true });
  h.click(h.document.nodes.get('reload-choices'));
  h.clear(); await flush(); assert.equal(exitWarning(h).prevented, true);
  h.click(h.document.nodes.get('reload-choices'));
  assert.equal(exitWarning(h).prevented, false);
  assert.equal(exitWarning(h).prevented, true);
});

test('malformed stored number text compares equal to the empty control a reload restores', () => {
  for (const field of ['outageMinutes', 'warmMinutes']) {
    for (const value of ['not-a-number', ' 90 ', '\t90', '90\n', 'Infinity', '-Infinity', 'NaN', '0x10', '+1', '1.', '1e', '1e309']) {
      const saved = JSON.stringify({ ...bindings.DEFAULTS, food: 'milk', durationKnown: 'known', evidence: 'warm', [field]: value });
      const h = harness({ saved });
      const before = JSON.stringify(Object.fromEntries(Object.entries(h.controls).map(([key, node]) => [key, node.value])));
      assert.equal(h.controls[field].value, '', `${field}: ${JSON.stringify(value)}`);
      assert.equal(exitWarning(h).prevented, false, `${field}: ${JSON.stringify(value)}`);
      assert.equal(h.store.get(DATA_KEY), saved);
      assert.equal(JSON.stringify(Object.fromEntries(Object.entries(h.controls).map(([key, node]) => [key, node.value]))), before);
      assert.match(h.result.textContent, /A pause before a decision/);
    }
  }
});

test('valid number syntax retains exact text without changing food-rule validation', () => {
  for (const field of ['outageMinutes', 'warmMinutes']) {
    for (const value of ['0', '-0', '00', '01', '90', '-1', '1.0', '.5', '-.5', '1e2', '1E+2', '1e-2', '10081', '1e308', '1e-999']) {
      const raw = { ...bindings.DEFAULTS, food: 'milk', durationKnown: 'known', outageMinutes: '90', evidence: 'warm', warmMinutes: '30', [field]: value };
      const h = harness({ saved: JSON.stringify(raw) });
      assert.equal(h.controls[field].value, value, `${field}: ${value}`);
      assert.equal(exitWarning(h).prevented, false, `${field}: ${value}`);
      const current = bindings.normalize(Object.fromEntries(Object.entries(h.controls).map(([key, node]) => [key, node.value])));
      assert.deepEqual(bindings.validate(current), bindings.validate(raw));
    }
  }
});

test('disabled numeric fields are excluded from recovery comparison despite stored or live text', () => {
  for (const value of ['90', '1e2', 'bad', 'Infinity']) {
    const saved = JSON.stringify({ ...bindings.DEFAULTS, food: 'milk', outageMinutes: value, warmMinutes: value });
    const h = harness({ saved });
    for (const field of ['outageMinutes', 'warmMinutes']) { assert.equal(h.controls[field].disabled, true); h.controls[field].value = '123'; }
    assert.equal(exitWarning(h).prevented, false);
    assert.equal(h.store.get(DATA_KEY), saved);
    for (const field of ['outageMinutes', 'warmMinutes']) assert.equal(h.controls[field].value, '123', 'exit check must not mutate live controls');
  }
});

test('new malformed peer minutes preserve empty controls while valid peer text requests protection', () => {
  for (const field of ['outageMinutes', 'warmMinutes']) {
    const raw = { ...bindings.DEFAULTS, food: 'milk', durationKnown: 'known', evidence: 'warm' };
    const sharedStore = new Map([[DATA_KEY, JSON.stringify(raw)]]), h = harness({ sharedStore });
    for (const value of ['bad', ' 90 ', 'Infinity']) {
      sharedStore.set(DATA_KEY, JSON.stringify({ ...raw, [field]: value })); sharedStore.set(GENERATION_KEY, '1');
      const before = [...sharedStore]; assert.equal(exitWarning(h).prevented, false); assert.deepEqual([...sharedStore], before);
    }
    sharedStore.set(DATA_KEY, JSON.stringify({ ...raw, [field]: '1e2' }));
    assert.equal(exitWarning(h).prevented, true);
    assert.equal(h.controls[field].value, '');
  }
});


test('stored array food identifiers compare with select coercion without permitting stale writes', async () => {
  for (const food of [['milk'], [['chicken']]]) {
    const raw = JSON.stringify({ ...bindings.DEFAULTS, food });
    const store = new Map([[DATA_KEY, raw]]), h = harness({sharedStore: store});
    assert.equal(h.controls.food.value, String(food));
    assert.equal(exitWarning(h).prevented, false);
    assert.equal(store.get(DATA_KEY), raw);
    store.set(DATA_KEY, JSON.stringify({ ...bindings.DEFAULTS, food: String(food) }));
    assert.equal(exitWarning(h).prevented, false);
    const before = [...store]; h.change('food', 'milk'); await flush();
    assert.match(h.text('session-status'), /Saved choices changed/);
    assert.deepEqual([...store], before);
  }
});
