import assert from 'node:assert/strict';
import {createMarketSettingsController,cleanMarketItems,marketEntryId,DEFAULT_MARKET_ITEMS} from '../web/market-pcr-settings.js';
import {marketMetricEntry,isReferenceMetric,referenceHistoryPayload,cboeHistoryView,cboeChartConfig,cboeMetricLabel} from '../web/cboe-model.js';

const document=(items,revision=1)=>({items,revision,initialized:true,storage:'local'});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
function service(initial){let saved=initial,calls=[],mode=null;return {calls,get saved(){return saved;},set mode(value){mode=value;},fetcher:async(url,options={})=>{assert.equal(url,'/api/market-pcr-settings');calls.push(options);if(options.method==='PUT'){if(mode==='fail')return response({error:'offline'},503);if(mode==='conflict'){saved=document([{type:'symbol',symbol:'GLD'}],saved.revision+1);return response({...saved,error:'REVISION_CONFLICT'},409);}const body=JSON.parse(options.body);assert.equal(body.revision,saved.revision);saved=document(body.items,saved.revision+1);return response(saved);}if(mode==='unauthorized')return response({error:'UNAUTHORIZED'},401);return response(saved);}};}

const first=service({items:null,revision:0,initialized:false,storage:'local'}),controller=createMarketSettingsController({fetcher:first.fetcher});
await Promise.all([controller.load(),controller.load()]);
assert.equal(first.calls.filter(call=>call.method==='PUT').length,1,'Concurrent first loads initialize once');
assert.deepEqual(controller.state.items,DEFAULT_MARKET_ITEMS);
await controller.load();assert.equal(first.calls.filter(call=>call.method==='PUT').length,1,'Initialized settings are never reseeded');
await controller.save([...controller.state.items,{type:'symbol',symbol:'iwm'},{type:'symbol',symbol:'GLD'}]);
assert.equal(controller.state.items.length,9);assert.deepEqual(controller.state.items.slice(-2),[{type:'symbol',symbol:'IWM'},{type:'symbol',symbol:'GLD'}]);
await controller.save(controller.state.items.filter(item=>!(item.type==='cboe'&&item.key==='index')));
await controller.save([...controller.state.items,{type:'cboe',key:'index'}]);assert.equal(controller.state.items.at(-1).key,'index','A removed macro can be re-added in order');
const previous=structuredClone(controller.state.items);first.mode='fail';assert.equal(await controller.save([]),false);assert.deepEqual(controller.state.items,previous,'Failed save retains the previous list');
first.mode='conflict';assert.equal(await controller.save([]),false);assert.deepEqual(controller.state.items,[{type:'symbol',symbol:'GLD'}]);assert.equal(controller.state.error,'conflict','409 adopts the current document, without overwriting it');
first.mode=null;await controller.save([]);await controller.load();assert.deepEqual(controller.state.items,[],'Saved empty list remains empty');
const empty=service(document([])),emptyController=createMarketSettingsController({fetcher:empty.fetcher});await emptyController.load();assert.deepEqual(emptyController.state.items,[]);assert.equal(empty.calls.length,1,'A fresh page must not seed an already-empty document');
const denied=service({items:null,revision:0,initialized:false,storage:'cloud'});denied.mode='unauthorized';const locked=createMarketSettingsController({fetcher:denied.fetcher});await locked.load();assert.equal(locked.state.ready,false);assert.equal(await locked.save(DEFAULT_MARKET_ITEMS),false);assert.equal(denied.calls.length,1,'Failed GET cannot create defaults or allow editing');

const distinct=cleanMarketItems([{type:'cboe',key:'index'},{type:'symbol',symbol:'INDEX'},{type:'symbol',symbol:'index'},{type:'symbol',symbol:'GLD'}]);
assert.deepEqual(distinct.map(marketEntryId),['cboe:index','symbol:INDEX','symbol:GLD']);
assert.throws(()=>cleanMarketItems([{type:'symbol',symbol:'ß'}]),'Unicode case expansion cannot turn an invalid ticker into SS');
assert.equal(marketEntryId(marketMetricEntry('index')),'cboe:index');assert.equal(marketEntryId(marketMetricEntry('spy')),'symbol:SPY');
assert.equal(isReferenceMetric('symbol:INDEX'),true);assert.equal(isReferenceMetric('cboe:index'),false);
assert.throws(()=>cleanMarketItems(Array.from({length:41},(_,index)=>({type:'symbol',symbol:'S'+index}))));
const row={date:'2026-11-24',p:150,c:100,p20:1500,c20:2000,r20:.75,p60:4800,c60:6000,r60:.8};
const indexSymbol={symbol:'INDEX',asof:'2026-11-20',checkedAt:'2026-11-25T01:11:00Z',instrument:{rows:[row]}};
const independent=referenceHistoryPayload(indexSymbol,'symbol:INDEX');
assert.equal(independent.asof,'2026-11-24');assert.equal(independent.checkedAt,indexSymbol.checkedAt);assert.equal(independent.rows[0]['symbol:INDEX'].daily,1.5);assert.equal(independent.rows[0].index,undefined);
assert.equal(cboeChartConfig(independent,{metric:'symbol:INDEX'}).rows[0][2],1.5);
assert.equal(cboeHistoryView({rows:[{date:row.date,index:{daily:9,r20:8,r60:7}}]},{metric:'symbol:INDEX'}).point,null,'A same-named ticker never reads macro data');
assert.equal(referenceHistoryPayload({...indexSymbol,symbol:'IWM'},'symbol:GLD').rows.length,0,'Another ticker cannot supply missing history');
const missing=referenceHistoryPayload({...indexSymbol,instrument:{rows:[{...row,p:null}]}},'symbol:INDEX');assert.equal(missing.rows[0]['symbol:INDEX'].daily,null,'Missing put count must not turn into zero PCR');
for(const symbol of ['IWM','GLD','NVDA','INDEX','TOTAL','ETP','EQUITY','BRK.B']){const payload=referenceHistoryPayload({...indexSymbol,symbol},'symbol:'+symbol),config=cboeChartConfig(payload,{metric:'symbol:'+symbol,language:'en'});assert.equal(config.rows[1][2],.75);assert.ok(config.title.startsWith('OCC '));assert.ok(!cboeMetricLabel('symbol:'+symbol,'en').includes('ETF PCR'),'An arbitrary symbol is not labeled as an index proxy');}
console.log('PASS market settings: one-time defaults, empty persistence, typed namespaces, dynamic symbols, CAS, failure retention and independent sources');
