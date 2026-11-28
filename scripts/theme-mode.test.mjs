import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {chartPalette,chartTheme} from '../web/chart-palette.js';
import {cboeChartConfig} from '../web/cboe-model.js';

const SOURCE=readFileSync(new URL('../web/theme-mode.js',import.meta.url),'utf8');

function element(tag){
  const node={tagName:tag.toUpperCase(),attributes:{},children:[],listeners:{},style:{},className:'',textContent:'',title:'',type:'',parent:null,
    setAttribute(name,value){this.attributes[name]=String(value);},
    getAttribute(name){return name in this.attributes?this.attributes[name]:null;},
    appendChild(child){detach(child);child.parent=this;this.children.push(child);return child;},
    insertBefore(child,before){detach(child);child.parent=this;const at=before?this.children.indexOf(before):-1;if(at<0)this.children.push(child);else this.children.splice(at,0,child);return child;},
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    querySelectorAll(selector){const out=[];const walk=node=>{for(const child of node.children){if(matches(child,selector))out.push(child);walk(child);}};walk(this);return out;},
    closest(selector){let node=this;while(node){if(matches(node,selector))return node;node=node.parent;}return null;},
  };
  return node;
}
function detach(node){if(node.parent){const siblings=node.parent.children,at=siblings.indexOf(node);if(at>=0)siblings.splice(at,1);node.parent=null;}}
function matches(node,selector){
  if(selector.startsWith('.'))return node.className.split(/\s+/).includes(selector.slice(1));
  const attr=/^\[([\w-]+)\]$/.exec(selector);if(attr)return node.getAttribute(attr[1])!==null;
  return false;
}

function harness({stored=null,cookie='',lang='en',storageThrows=false,framed=false,protocol='https:'}={}){
  const root=element('html');root.lang=lang;
  const nav=element('nav');nav.className='site-nav';
  const language=element('div');language.className='language-switch';nav.appendChild(language);
  const store=new Map(stored===null?[]:[['pcr-dashboard:theme:v1',stored]]);
  const events=[],windowListeners={};
  const document={documentElement:root,readyState:'complete',cookie,
    querySelector:selector=>selector==='.site-nav'?nav:nav.querySelector(selector),
    querySelectorAll:selector=>nav.querySelectorAll(selector),
    createElement:element,addEventListener(){}};
  const localStorage={getItem(key){if(storageThrows)throw Error('blocked');return store.has(key)?store.get(key):null;},setItem(key,value){if(storageThrows)throw Error('blocked');store.set(key,value);}};
  const window={addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);},dispatchEvent(event){events.push(event);(windowListeners[event.type]||[]).forEach(fn=>fn(event));}};
  window.self=window;window.top=framed?{}:window;
  class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
  vm.runInNewContext(SOURCE,{document,localStorage,window,location:{protocol},CustomEvent,String,MutationObserver:undefined});
  const group=nav.querySelector('.theme-switch');
  const buttons=group?group.children:[];
  const click=mode=>{const button=buttons.find(b=>b.getAttribute('data-theme-mode')===mode);group.listeners.click.forEach(fn=>fn({target:button}));};
  return {root,nav,group,buttons,click,store,events,document,windowListeners};
}

test('night is the default mode and a valid saved choice is applied before paint',()=>{
  let h=harness();assert.equal(h.root.getAttribute('data-theme'),'dark');assert.equal(h.root.style.colorScheme,'dark');
  h=harness({stored:'light'});assert.equal(h.root.getAttribute('data-theme'),'light');assert.equal(h.root.style.colorScheme,'light');
  h=harness({stored:'sepia'});assert.equal(h.root.getAttribute('data-theme'),'dark','Unknown stored values fall back to night');
  h=harness({cookie:'other=1; pcr-theme=light'});assert.equal(h.root.getAttribute('data-theme'),'light','The cookie mirror is honoured when storage is empty');
  h=harness({storageThrows:true,cookie:'xpcr-theme=light'});assert.equal(h.root.getAttribute('data-theme'),'dark','Look-alike cookie names are ignored');
});

test('the switch sits before the language switch, presses the current mode and is bilingual',()=>{
  let h=harness({lang:'en'});
  const tools=h.nav.children[0];assert.equal(tools.className,'nav-tools');assert.equal(h.nav.children.length,1);
  assert.equal(tools.children[0],h.group);assert.equal(tools.children[1].className,'language-switch','Both switches wrap together, day/night first');
  assert.equal(h.group.className,'language-switch theme-switch');assert.equal(h.group.getAttribute('role'),'group');assert.equal(h.group.getAttribute('aria-label'),'Display mode');
  assert.deepEqual(h.buttons.map(b=>[b.getAttribute('data-theme-mode'),b.textContent,b.getAttribute('aria-pressed'),b.type]),[['light','Day','false','button'],['dark','Night','true','button']]);
  h=harness({lang:'zh-CN',stored:'light'});
  assert.equal(h.group.getAttribute('aria-label'),'显示模式');
  assert.deepEqual(h.buttons.map(b=>[b.textContent,b.getAttribute('aria-pressed'),b.title]),[['日间','true','切换到日间模式'],['夜间','false','切换到夜间模式']]);
  h.root.lang='en';h.windowListeners['pcr-language-change'].forEach(fn=>fn({}));assert.deepEqual(h.buttons.map(b=>b.textContent),['Day','Night'],'Labels follow a language change');
});

test('choosing a mode applies, saves, mirrors the cookie and announces it once',()=>{
  const h=harness();
  h.click('light');
  assert.equal(h.root.getAttribute('data-theme'),'light');assert.equal(h.store.get('pcr-dashboard:theme:v1'),'light');
  assert.equal(h.document.cookie,'pcr-theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  assert.deepEqual(h.events.map(e=>[e.type,e.detail.theme]),[['pcr-theme-change','light']]);
  assert.deepEqual(h.buttons.map(b=>b.getAttribute('aria-pressed')),['true','false']);
  h.click('light');assert.equal(h.events.length,1,'Re-selecting the current mode is a no-op');
  h.click('dark');assert.equal(h.root.getAttribute('data-theme'),'dark');assert.equal(h.events.at(-1).detail.theme,'dark');
});

test('the cookie mirror matches the gateway cookies when embedded and drops Secure on plain http',()=>{
  let h=harness({framed:true});h.click('light');
  assert.equal(h.document.cookie,'pcr-theme=light; Path=/; Max-Age=31536000; SameSite=None; Secure; Partitioned','A cross-site huggingface.co iframe needs SameSite=None; Secure; Partitioned');
  h=harness({protocol:'http:'});h.click('light');
  assert.equal(h.document.cookie,'pcr-theme=light; Path=/; Max-Age=31536000; SameSite=Lax','Local http previews cannot set Secure cookies');
  h=harness({framed:true,protocol:'http:'});h.click('light');assert(h.document.cookie.endsWith('SameSite=Lax'),'SameSite=None requires https, so plain http keeps Lax');
});

test('a choice made in another tab is applied through the storage event',()=>{
  const h=harness();
  h.windowListeners.storage.forEach(fn=>fn({key:'pcr-dashboard:theme:v1',newValue:'light'}));
  assert.equal(h.root.getAttribute('data-theme'),'light');assert.equal(h.events.at(-1).detail.theme,'light');
  h.windowListeners.storage.forEach(fn=>fn({key:'pcr-dashboard:theme:v1',newValue:'<script>'}));
  assert.equal(h.root.getAttribute('data-theme'),'light','Invalid values from other tabs are ignored');
});

test('chart palettes keep the same hierarchy in both modes and follow the page mode',()=>{
  assert.equal(chartTheme(),'dark','Outside a browser the night palette is used');
  const night=chartPalette('dark'),day=chartPalette('light');
  assert.deepEqual([night.daily,night.r5,night.r20,night.r60],['#6b7686','#2fbfa8','#5a9bff','#f2a541']);
  assert.deepEqual([day.daily,day.r5,day.r20,day.r60],['#9aa3b0','#12867a','#2563c9','#d9771e']);
  assert.equal(chartPalette('sepia'),night);
  const rows=[];for(let i=0;i<260;i++){const d=new Date(Date.UTC(2026,0,1+i));if([0,6].includes(d.getUTCDay()))continue;rows.push({date:d.toISOString().slice(0,10),index:{daily:0.8,p:800,c:1000}});}
  const payload={rows,asof:rows.at(-1).date,requestedEnd:rows.at(-1).date,actualEnd:rows.at(-1).date};
  const previous=globalThis.document;
  try{
    globalThis.document={documentElement:{getAttribute:name=>name==='data-theme'?'light':null}};
    const config=cboeChartConfig(payload,{metric:'index',range:'126',language:'en'});
    assert.equal(config.spec.colors['Daily volume PCR'],day.daily);assert.equal(config.spec.colors['20-session volume PCR'],day.r20);assert.equal(config.spec.colors['60-session volume PCR'],day.r60);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  assert.equal(cboeChartConfig(payload,{metric:'index',range:'126',language:'en'}).spec.colors['20-session volume PCR'],night.r20);
});
