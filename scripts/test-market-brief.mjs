import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createMarketBriefController,briefMacroFacts,briefPCRFacts} from '../web/market-brief.js';

const stamp='2026-11-25T01:00:00Z';
const market={provider:'Yahoo Finance',checkedAt:stamp,status:'current',quotes:['sp500','nasdaq','dow'].map((id,index)=>({id,price:100+index,changePercent:index===0?1:-1,marketTime:'2026-11-24T21:00:00Z'}))};
assert.equal(briefMacroFacts(market).up,1);
assert.equal(briefMacroFacts(market).down,2);
const crossAsset={...market,quotes:[...market.quotes,{id:'bitcoin',price:61200,changePercent:50,marketTime:stamp},{id:'gold',price:3600,changePercent:-10,marketTime:stamp}]};
assert.equal(briefMacroFacts(crossAsset).quotes.length,3);assert.equal(briefMacroFacts(crossAsset).up,1);assert.equal(briefMacroFacts(crossAsset).down,2,'Bitcoin/gold do not change the three-index direction summary');
assert.equal(briefMacroFacts({quotes:[{id:'sp500',price:null,changePercent:1}]}).quotes.length,0);
const cboe={asof:'2026-11-23',checkedAt:stamp,rows:[{date:'2026-11-23',available:true,index:{daily:1.21,r20:1.06,r60:1.01},equity:{daily:.55,r20:null,r60:null}},{date:'2026-11-24',available:false,index:{daily:null,r20:null,r60:null}}],coverage:{missingDates:['2026-11-24']},freshness:{status:'pending_source'}};
assert.equal(briefPCRFacts(cboe).date,'2026-11-23');
assert.deepEqual(briefPCRFacts(cboe).series,[{key:'index',r20:1.06,r60:1.01}]);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const calls=[];
let failRefresh=false;
const items=Array.from({length:21},(_,index)=>({symbol:'T'+index,category:null}));
const fetcher=async(path,options={})=>{
  calls.push({path,method:options.method});const url=new URL(path,'https://test.example');
  if(url.pathname==='/api/watchlist-settings'){assert.equal(options.method,'GET');return json({initialized:true,items,groups:[],revision:1});}
  if(url.pathname==='/api/market')return json(market);
  if(url.pathname==='/api/market/refresh')return failRefresh?json({error:'offline'},502):json(market);
  if(url.pathname==='/api/watchlist')return json({instruments:{}});
  if(url.pathname==='/api/symbol')return json({symbol:url.searchParams.get('symbol'),asof:'2026-11-23',checkedAt:stamp,instrument:{rows:[{date:'2026-11-23',p:50,c:100,r20:.6,r60:.7}]}});
  if(url.pathname.startsWith('/api/cboe/history'))return json(cboe);
  if(url.pathname==='/api/brief-quotes/status')return json({provider:'moomoo_webapi',configured:true,readOnly:true});
  if(url.pathname==='/api/brief-quotes'){
    if(failRefresh)return json({provider:'moomoo_webapi',code:'NO_PERMISSION',error:'permission'},403);
    return json({provider:'moomoo_webapi',checkedAt:stamp,status:'current',data:{basic_qot_list:url.searchParams.get('symbols').split(',').map(code=>({security:{code},cur_price:123,update_timestamp:1795554000}))}});
  }
  throw Error('Unexpected endpoint '+path);
};
const controller=createMarketBriefController({fetcher});await controller.load();
assert.equal(controller.state.library.records().length,21);
assert.equal(controller.state.library.records()[0].instrument.rows.at(-1).r20,.6);
assert.equal(controller.state.stockQuotes.size,21);
const priceCalls=calls.filter(call=>call.path.startsWith('/api/brief-quotes?'));
assert.equal(priceCalls.length,2);
assert.equal(new URL(priceCalls[0].path,'https://test.example').searchParams.get('symbols').split(',').length,20);
failRefresh=true;const before=controller.state.market.quotes[0].price;
const first=controller.refresh(),second=controller.refresh();assert.equal(first,second);await first;
assert.equal(controller.state.market.quotes[0].price,before);
assert.equal(controller.state.market.quotes[0].stale,true);
assert.equal(controller.state.stockQuotes.get('T0').cur_price,123);
assert.equal(controller.state.stockFailure,true);
assert(calls.some(call=>call.path==='/api/market/refresh'&&call.method==='POST'));
assert.equal(calls.some(call=>/account|position|order|trade/.test(call.path)),false);
const catalog=JSON.parse(await readFile(new URL('../web/archive/catalog.json',import.meta.url),'utf8'));
const saved=catalog.items.find(item=>item.id==='market-brief-20261123');
assert.equal(saved.path,'/archive/market-brief-20261123.html');
const archived=await readFile(new URL('../web/archive/market-brief-20261123.html',import.meta.url));
assert.equal(createHash('sha256').update(archived).digest('hex'),saved.sourceSha256);
const html=await readFile(new URL('../web/market-brief.html',import.meta.url),'utf8');
assert(html.includes('/market-overview.js')&&html.includes('/source-notes.js')&&html.includes('/brief.css'));
assert(!html.includes('chatbox'));
console.log('PASS dynamic market brief: dated macro facts, latest available PCR, DB watchlist, 20-symbol quote batching, read-only requests, failure retention, and immutable saved snapshot');
