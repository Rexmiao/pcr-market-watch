import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../web/model.js';
import * as oi from '../web/oi-summary-model.js';
import * as watch from '../web/watchlist-model.js';
import * as searchModel from '../web/search-model.js';
import {t} from '../web/i18n.js';
import {interpretPcr} from '../web/pcr-interpretation.js';

const seed=JSON.parse(fs.readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('initialize().catch(','globalThis.startup=initialize().catch(');
const initialized=(items,revision=1,groups=watch.DEFAULT_GROUPS)=>({items,groups:structuredClone(groups),revision,initialized:true,storage:'cloud',updatedAt:'2026-11-25T01:00:00Z'});
function makeServer(settings){return {settings:structuredClone(settings),puts:0,symbols:0,failGet:false,failPut:false,conflict:null};}
async function start(server,legacy={}){
  const elements=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.textContent='';this.children=[];this.dataset={};this.disabled=false;this.hidden=false;this.listeners={};this.classList={toggle(){}};}
    addEventListener(name,callback){this.listeners[name]=callback;}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    setAttribute(name,value){this[name]=value;}
    removeAttribute(name){delete this[name];}
    focus(){}
    scrollIntoView(){}
  }
  for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element());
  const historyPanel=new Element('section');
  const local=new Map(Object.entries(legacy));
  const context=vm.createContext({
    // This fixture owns watchlist behavior; use the real pure OI/PCR models
    // while their dedicated view tests cover the interpretation DOM.
    ...model,...oi,...watch,...searchModel,interpretPcr,renderPcrInterpretation(){},t:(key,params)=>t(key,params,'zh'),getLanguage:()=> 'zh',translatePage(){},initLanguageToggle(){},createCalendar:()=>({render(){}}),mountChart:(_host,config)=>({config}),
    document:{addEventListener(){},getElementById:id=>{assert.ok(elements.has(id),'Missing HTML element '+id);return elements.get(id);},createElement:tag=>new Element(tag),querySelector:()=>historyPanel},
    window:{dispatchEvent(){},addEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,value)},
    URLSearchParams,AbortSignal,AbortController,Response,console,setTimeout,clearTimeout,
    fetch:async(url,options={})=>{
      if(url==='/api/watchlist')return Response.json(seed);
      if(url==='/api/watchlist-settings'){
        if(options.method==='PUT'){
          server.puts++;
          if(server.failPut)return Response.json({error:'offline'},{status:503});
          if(server.conflict){server.settings=server.conflict;server.conflict=null;return Response.json(server.settings,{status:409});}
          const desired=JSON.parse(options.body);assert.equal(desired.revision,server.settings.revision);
          server.settings=initialized(desired.items,desired.revision+1,desired.groups);return Response.json(server.settings);
        }
        return server.failGet?Response.json({error:'unavailable'},{status:503}):Response.json(server.settings);
      }
      if(url.startsWith('/api/symbol?')){server.symbols++;const symbol=new URL(url,'https://test.example').searchParams.get('symbol');return Response.json({symbol,instrument:{...seed.instruments.AMD,label:symbol,oi:null},asof:seed.asof,checkedAt:'2026-11-25T01:00:00Z'});}
      throw Error('Unexpected request '+url);
    },
  });
  vm.runInContext(source,context);await context.startup;
  return {context,elements,run:code=>vm.runInContext(code,context)};
}

const empty=watch.readWatchSettings(initialized([],7));assert.deepEqual(empty.items,[]);
assert.equal(watch.readWatchSettings({items:null,groups:null,revision:0,initialized:false,storage:'cloud'}).items,null);
assert.equal(watch.initialWatchItems(['sndk','NVDA'],{MU:'other'}).length,8);
assert.equal(watch.initialWatchItems([],{MU:'other'}).find(item=>item.symbol==='MU').category,'other');
assert.throws(()=>watch.cleanWatchItems([{symbol:'NVDA',category:'unknown'}]));

const emptyServer=makeServer(initialized([],7));
let ui=await start(emptyServer,{'pcr-dashboard:watchlist:v1':'["SNDK"]'});
assert.equal(ui.run('items.length'),0);assert.equal(emptyServer.puts,0,'Saved empty list never migrates defaults again');
assert.equal(ui.elements.get('watchlist').children.length,0);assert.equal(ui.elements.get('overview').hidden,true);

const first=makeServer({items:null,groups:null,revision:0,initialized:false,storage:'cloud',updatedAt:null});
ui=await start(first,{'pcr-dashboard:watchlist:v1':'["SNDK"]'});
assert.equal(first.puts,1,'First use performs exactly one migration write');assert.equal(first.settings.items.length,8);
assert.ok(ui.elements.get('watchlist').children.every(chip=>chip.children[1].className==='watchlist-remove'),'Every symbol has the same remove control');
await ui.run("removeSymbol('NVDA')");assert.ok(!first.settings.items.some(item=>item.symbol==='NVDA'));
const callsBefore=first.symbols;await ui.run("addSymbol('NVDA')");assert.ok(first.settings.items.some(item=>item.symbol==='NVDA'),'A removed default symbol can be re-added through the common action');assert.equal(first.symbols,callsBefore,'Valid cached default data does not trigger unnecessary history requests');

first.failGet=true;await ui.run('loadSettings()');assert.equal(ui.elements.get('add-symbol').disabled,true);assert.ok(ui.elements.get('watchlist').children.every(chip=>chip.children[1].disabled),'A later storage read failure also locks mutations');first.failGet=false;await ui.run('loadSettings()');
first.failPut=true;const retained=JSON.stringify(first.settings.items);await ui.run("removeSymbol('MU')");
assert.equal(JSON.stringify(first.settings.items),retained);assert.equal(ui.run('items.length'),first.settings.items.length);assert.equal(ui.run('searchStatusState.key'),'watchSaveFailed');
first.failPut=false;first.conflict=initialized([{symbol:'MU',category:'other'}],30);const beforeConflict=first.puts;await ui.run("removeSymbol('NVDA')");
assert.equal(ui.run('items.length'),1);assert.equal(ui.run('items[0].symbol'),'MU');assert.equal(ui.run('revision'),30);assert.equal(first.puts,beforeConflict+1,'Conflict does not automatically overwrite remote changes');assert.equal(ui.run('searchStatusState.key'),'watchConflict');

await ui.run("removeSymbol('MU')");assert.deepEqual(first.settings.items,[]);ui=await start(first);
assert.equal(ui.run('items.length'),0,'Deleting the last symbol remains empty after a reload');assert.equal(ui.elements.get('overview').hidden,true);
ui.elements.get('symbol-search').value='nvda';ui.elements.get('symbol-search').listeners.input();
assert.equal(ui.elements.get('add-symbol').textContent,'添加 NVDA');clearTimeout(ui.run('searchTimer'));
await ui.run("addSymbol('NVDA')");assert.equal(first.settings.items[0].symbol,'NVDA');

ui.elements.get('group-name').value='科技观察';await ui.run('createGroup()');
const custom=first.settings.groups.find(group=>group.name==='科技观察');assert.ok(custom?.id.startsWith('custom_'));
await ui.run(`saveSettings(changedCategory(items,'NVDA','${custom.id}'))`);assert.equal(first.settings.items.find(item=>item.symbol==='NVDA').category,custom.id);
await ui.run(`categoryFilter='${custom.id}';deleteGroup()`);assert.ok(!first.settings.groups.some(group=>group.id===custom.id));assert.equal(first.settings.items.find(item=>item.symbol==='NVDA').category,null,'Deleting a group retains its symbols as unassigned');
await ui.run("categoryFilter='semi';deleteGroup()");assert.ok(!first.settings.groups.some(group=>group.id==='semi'),'Default groups are deletable too');
await ui.run('saveSettings(items.map(item=>({...item,category:null})),{nextGroups:[]})');
ui=await start(first);assert.equal(ui.run('groups.length'),0,'Saved empty groups do not restore default categories');assert.equal(ui.run('items.length'),first.settings.items.length);
await ui.run('saveSettings([],{nextGroups:[]})');ui=await start(first);assert.equal(ui.run('items.length'),0);assert.equal(ui.run('groups.length'),0);

const unavailable=makeServer(initialized([{symbol:'MU',category:'semi'}]));unavailable.failGet=true;ui=await start(unavailable);
assert.equal(ui.run('settingsReady'),false);assert.equal(ui.elements.get('add-symbol').disabled,true);assert.equal(ui.elements.get('watchlist-retry').hidden,false);assert.equal(unavailable.puts,0,'Unavailable settings never silently fall back to browser-only writes');
console.log('PASS unified watchlist defaults/empty persistence, common add/remove, CAS conflict, failure retention, custom/default group removal and empty group persistence');
