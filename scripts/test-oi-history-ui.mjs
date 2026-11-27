import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../web/model.js';
import * as oi from '../web/oi-summary-model.js';
import * as watch from '../web/watchlist-model.js';
import * as search from '../web/search-model.js';
import {t} from '../web/i18n.js';
import {dailyNextRun} from '../web/oi-daily-status.js';
import {interpretPcr} from '../web/pcr-interpretation.js';

const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('initialize().catch(','globalThis.startup=initialize().catch(');
const rows=['2026-11-23','2026-11-24','2026-11-25'].map(date=>({date,p:50,c:100,r20:.6,r60:.5}));
const seed={asof:'2026-11-25',calendarDate:'2026-11-26',instruments:Object.fromEntries(watch.DEFAULT_SYMBOLS.map(symbol=>[symbol,{rows,oi:null}]))};
const elements=new Map(),requests=[],mounted=[];let archive24Release,block24=false;
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
const payload=date=>({provider:'moomoo_webapi',status:'current',checkedAt:date+'T22:30:01Z',items:[{symbol:'NVDA',putOi:date.endsWith('26')?150:80,callOi:100,checkedAt:date+'T22:30:01Z',oiAsOf:null,oiAsOfConfirmed:false,oiBasis:'previous_session',archived:true,observationDate:date,status:'current'}]});
const context=vm.createContext({
  // This fixture exercises OI date isolation; the separate view tests cover
  // PCR-reading DOM/tooltip behavior. Keep the real pure calculation available.
  ...model,...oi,...watch,...search,interpretPcr,renderPcrInterpretation(){},t:(key,params)=>t(key,params,'zh'),getLanguage:()=> 'zh',translatePage(){},initLanguageToggle(){},createCalendar:()=>({render(){}}),mountChart:(_host,config)=>{const chart={config};mounted.push(chart);return chart;},
  document:{addEventListener(){},getElementById:id=>{assert(elements.has(id),'Missing HTML element '+id);return elements.get(id);},createElement:tag=>new Element(tag),querySelector:()=>new Element('section')},
  window:{dispatchEvent(){},addEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},localStorage:{getItem:()=>null,setItem(){}},
  URLSearchParams,AbortSignal,AbortController,Response,console,setTimeout,clearTimeout,
  fetch:async(url,options={})=>{
    requests.push({url,method:options.method||'GET'});
    if(url==='/api/watchlist')return Response.json(seed);
    if(url==='/api/watchlist-settings')return Response.json({items:[{symbol:'NVDA',category:'semi'}],groups:watch.DEFAULT_GROUPS,revision:1,initialized:true,storage:'local'});
    const parsed=new URL(url,'https://test.example'),date=parsed.searchParams.get('date');
    if(parsed.pathname==='/api/oi-summaries/history'){
      if(!date)return Response.json({dates:['2026-11-24','2026-11-25','2026-11-26'],coverageByDate:{'2026-11-24':{count:1,completeCount:1},'2026-11-25':{count:1,completeCount:1},'2026-11-26':{count:1,completeCount:1}}});
      if(date==='2026-11-24'&&block24)await new Promise(resolve=>{archive24Release=resolve;});
      if(date==='2026-11-23')return Response.json({error:'failed'},{status:503});
      return Response.json(payload(date));
    }
    throw Error('Unexpected request '+url);
  },
});
const run=code=>vm.runInContext(code,context);
const settle=async()=>{for(let i=0;i<50;i++){await new Promise(resolve=>setImmediate(resolve));if(!run('oiBusy'))return;}throw Error('UI did not settle');};
vm.runInContext(source,context);await context.startup;await settle();
assert.equal(run('state.date'),'2026-11-25');assert.equal(run('data.instruments.NVDA.oi.ratio'),.8);
assert(elements.get('oi-source-status').textContent.includes('17:30:01'));assert(elements.get('oi-source-status').textContent.includes('America/New_York'));assert(elements.get('oi-source-status').textContent.includes('结算日未知'));
console.log('PASS exact query-day archive renders with full ET query time and unknown settlement');

block24=true;run("selectDate('2026-11-24')");await new Promise(resolve=>setImmediate(resolve));
assert.equal(run('data.instruments.NVDA.oi'),null);assert(mounted[0].config.rows.filter(row=>row[1].includes('OI')).every(row=>row[2]===null));
run("selectDate('2026-11-26')");await settle();assert.equal(run('data.instruments.NVDA.oi.ratio'),1.5);
assert(elements.get('oi-note').textContent.includes('2026-11-26'));assert(elements.get('oi-note').textContent.includes('2026-11-25'));
archive24Release();await settle();await new Promise(resolve=>setImmediate(resolve));
assert.equal(run('state.date'),'2026-11-26');assert.equal(run('data.instruments.NVDA.oi.observationDate'),'2026-11-26');
console.log('PASS date switches clear old bars; delayed prior-date response cannot replace the selected holiday archive');

run("selectDate('2026-11-23')");await settle();assert.equal(run('data.instruments.NVDA.oi'),null);assert.equal(run('oiRows.size'),0);
console.log('PASS failed historical reads never substitute another day’s latest OI');
assert(requests.filter(request=>request.url.includes('/api/oi-summaries')).every(request=>request.method==='GET'));
console.log('PASS choosing calendar dates and loading archives do not trigger upstream refresh');

assert.deepEqual(dailyNextRun({scheduler:{available:false,nextRunAt:'2026-11-26T22:30:00Z'},nextPlannedAt:'2026-11-27T22:30:00Z'}),{confirmed:false,time:'2026-11-27T22:30:00Z'});
assert.deepEqual(dailyNextRun({scheduler:{available:true,state:'Ready',nextRunAt:'2026-11-26T22:30:00Z'}}),{confirmed:true,time:'2026-11-26T22:30:00Z'});
assert.deepEqual(dailyNextRun({scheduler:{available:true,state:'Disabled',nextRunAt:'2026-11-26T22:30:00Z'}}),{confirmed:false,time:null});
console.log('PASS daily status distinguishes confirmed scheduler times from planned estimates and disabled tasks');
