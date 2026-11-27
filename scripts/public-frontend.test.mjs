import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../web/model.js';
import * as oi from '../web/oi-summary-model.js';
import * as watch from '../web/watchlist-model.js';
import * as search from '../web/search-model.js';
import {t} from '../web/i18n.js';
import {createMarketSettingsController} from '../web/market-pcr-settings.js';
import {publicAccessState} from '../web/public-access.js';
import {interpretPcr} from '../web/pcr-interpretation.js';

const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('initialize().catch(','globalThis.startup=initialize().catch(');
const rows=['2026-11-23','2026-11-24','2026-11-25'].map(date=>({date,p:50,c:100,r20:.6,r60:.5}));
const seed={asof:'2026-11-25',calendarDate:'2026-11-26',instruments:Object.fromEntries(watch.DEFAULT_SYMBOLS.map(symbol=>[symbol,{rows,oi:null}]))};
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
async function fixture(readOnly,{cooldown=false,legacyLocal=false}={}){
  const elements=new Map(),requests=[];
  for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element());
  let settings={items:[{symbol:'NVDA',category:'semi'}],groups:watch.DEFAULT_GROUPS,revision:1,initialized:true,storage:'cloud',readOnly,canRefresh:true};
  if(legacyLocal){settings.storage='local';delete settings.readOnly;delete settings.canRefresh;}
  const archive=date=>({provider:'moomoo_webapi',status:'current',checkedAt:date+'T22:30:01Z',items:[{symbol:'NVDA',putOi:80,callOi:100,checkedAt:date+'T22:30:01Z',oiAsOf:null,oiAsOfConfirmed:false,oiBasis:'previous_session',archived:true,observationDate:date,status:'current'}]});
  const context=vm.createContext({...model,...oi,...watch,...search,interpretPcr,renderPcrInterpretation(){},t,getLanguage:()=> 'zh',translatePage(){},initLanguageToggle(){},createCalendar:()=>({render(){}}),mountChart:(_host,config)=>({config}),
    document:{addEventListener(){},getElementById:id=>{assert(elements.has(id),'Missing HTML element '+id);return elements.get(id);},createElement:tag=>new Element(tag),querySelector:()=>new Element('section')},
    window:{dispatchEvent(){},addEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},localStorage:{getItem:()=>null,setItem(){}},URLSearchParams,AbortSignal,AbortController,Response,console,setTimeout,clearTimeout,
    fetch:async(url,options={})=>{
      const method=options.method||'GET';requests.push({url,method});
      if(url==='/api/watchlist')return Response.json(seed);
      if(url==='/api/watchlist-settings'){
        if(method==='PUT'){const body=JSON.parse(options.body);settings={...settings,items:body.items,groups:body.groups,revision:body.revision+1};}
        return Response.json(settings);
      }
      if(url==='/api/refresh')return Response.json(cooldown?{retryAfterSeconds:60,data:seed}:{status:'unchanged',data:seed},{status:cooldown?429:200});
      const parsed=new URL(url,'https://fixture.example'),date=parsed.searchParams.get('date');
      if(parsed.pathname==='/api/oi-summaries/refresh')return Response.json(cooldown?{retryAfterSeconds:60}:archive('2026-11-25'),{status:cooldown?429:200});
      if(parsed.pathname==='/api/oi-summaries/history')return Response.json(date?archive(date):{dates:['2026-11-25'],coverageByDate:{'2026-11-25':{count:1,completeCount:1}}});
      throw Error('Unexpected request '+url);
    }});
  vm.runInContext(source,context);await context.startup;
  for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(!vm.runInContext('oiBusy',context))break;}
  return {elements,requests,run:code=>vm.runInContext(code,context),setPublished:symbols=>{settings={...settings,items:symbols.map(symbol=>({symbol,category:'semi'}))};}};
}

test('public viewers retain chart selection and refresh but cannot write watchlists or groups',async()=>{
  const f=await fixture(true);
  assert.equal(f.run('settingsReadOnly'),true);assert.equal(f.elements.get('refresh').disabled,false);
  assert.equal(f.elements.get('date').disabled,false);assert.equal(f.elements.get('category-filter').disabled,false);
  assert.equal(f.elements.get('search-form').hidden,true);assert.equal(f.elements.get('group-form').hidden,true);
  const chip=f.elements.get('watchlist').children[0];assert.equal(chip.children[0].disabled,false);assert.equal(chip.children[1].hidden,true);
  await f.run('saveSettings([])');await f.run("addSymbol('AMD')");await f.run("removeSymbol('NVDA')");await f.run('createGroup()');await f.run('deleteGroup()');await f.run('search()');
  assert.equal(f.requests.filter(r=>r.method==='PUT').length,0);
  f.run("selectDate('2026-11-24')");assert.equal(f.run('state.date'),'2026-11-24');
  await f.run('refresh()');assert(f.requests.some(r=>r.url==='/api/refresh'&&r.method==='POST'));assert(f.requests.some(r=>r.url.startsWith('/api/oi-summaries/refresh')&&r.method==='POST'));
  assert.equal(f.elements.get('refresh').disabled,false);assert.equal(f.requests.filter(r=>r.method==='PUT').length,0);
});
test('owner mode preserves watchlist writes',async()=>{
  const f=await fixture(false);assert.equal(f.elements.get('search-form').hidden,false);
  await f.run("saveSettings([...items,{symbol:'AMD',category:'semi'}])");assert.equal(f.requests.filter(r=>r.method==='PUT').length,1);assert.equal(f.run('items.length'),2);
});
test('legacy local settings without public capabilities keep editing available',async()=>{
  const f=await fixture(false,{legacyLocal:true});assert.equal(f.run('settingsReadOnly'),false);assert.equal(f.run('settingsStorage'),'local');assert.equal(f.elements.get('search-form').hidden,false);assert.equal(f.elements.get('refresh').disabled,false);
  await f.run("saveSettings([...items,{symbol:'AMD',category:'semi'}])");assert.equal(f.requests.filter(r=>r.method==='PUT').length,1);
});
test('a visitor refresh rereads the published list before requesting OI updates',async()=>{
  const f=await fixture(true),before=f.requests.length;f.setPublished(['AMD']);await f.run('refresh()');
  assert.equal(f.run('items[0].symbol'),'AMD');const refresh=f.requests.slice(before).find(r=>r.url.startsWith('/api/oi-summaries/refresh'));
  assert(refresh);assert(new URL(refresh.url,'https://test.example').searchParams.get('symbols')==='AMD');assert.equal(f.requests.filter(r=>r.method==='PUT').length,0);
});
test('public refresh cooldown keeps previous data and reports a wait rather than a new data date',async()=>{
  const f=await fixture(true,{cooldown:true});const previous=f.run('baseData.asof');await f.run('refresh()');
  assert.equal(f.run('baseData.asof'),previous);assert(f.elements.get('status').textContent.includes('60'));assert.equal(f.elements.get('status').className,'status');
});
test('market references propagate public capabilities and deny mutations without disabling refresh capability',async()=>{
  const calls=[];const controller=createMarketSettingsController({fetcher:async(url,options={})=>{calls.push(options.method||'GET');return Response.json({items:[{type:'cboe',key:'index'}],revision:1,initialized:true,storage:'cloud',readOnly:true,canRefresh:true});}});
  await controller.load();assert.equal(controller.state.readOnly,true);assert.equal(controller.state.canRefresh,true);assert.equal(await controller.save([]),false);assert.deepEqual(calls,['GET']);
});
test('public capabilities and bilingual copy do not imply visitor management permission',()=>{
  assert.deepEqual(publicAccessState({authenticated:false,publicReadOnly:true,canRefresh:true}),{authenticated:false,publicReadOnly:true,canRefresh:true});
  assert.equal(publicAccessState({publicReadOnly:true}),null);assert(t('publicViewer',{},'en').includes('Refresh'));assert(t('publicViewer',{},'zh').includes('更新'));
});
