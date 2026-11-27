export const MARKET_CBOE_KEYS=['index','total','etp','equity'];
export const MARKET_ITEM_LIMIT=40;
export const DEFAULT_MARKET_ITEMS=[...MARKET_CBOE_KEYS.map(key=>({type:'cboe',key})),...['SPY','QQQ','DIA'].map(symbol=>({type:'symbol',symbol}))];
export function normalizeMarketEntry(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_MARKET_ITEM');
  if(value.type==='cboe'&&MARKET_CBOE_KEYS.includes(value.key))return {type:'cboe',key:value.key};
  if(value.type==='symbol'&&typeof value.symbol==='string'){const raw=value.symbol.trim();if(/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(raw))return {type:'symbol',symbol:raw.toUpperCase()};}
  throw Error('INVALID_MARKET_ITEM');
}
export function marketEntryId(value){const entry=normalizeMarketEntry(value);return entry.type==='cboe'?'cboe:'+entry.key:'symbol:'+entry.symbol;}
export function cleanMarketItems(value){if(!Array.isArray(value))throw Error('INVALID_MARKET_ITEMS');const seen=new Set(),out=[];for(const item of value){const entry=normalizeMarketEntry(item),id=marketEntryId(entry);if(!seen.has(id)){seen.add(id);out.push(entry);}}if(out.length>MARKET_ITEM_LIMIT)throw Error('MARKET_ITEM_LIMIT');return out;}
export function readMarketSettings(value){
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||!['cloud','local'].includes(value.storage))throw Error('INVALID_MARKET_SETTINGS');
  if(value.items===null){if(value.initialized!==false||value.revision!==0)throw Error('INVALID_MARKET_SETTINGS');return {...value,items:null};}
  if(value.initialized!==true)throw Error('INVALID_MARKET_SETTINGS');return {...value,items:cleanMarketItems(value.items)};
}
export function createMarketSettingsController({fetcher=globalThis.fetch,onChange=()=>{}}={}){
  const state={items:[],revision:0,storage:null,ready:false,loading:false,saving:false,error:null,updatedAt:null,readOnly:false,canRefresh:true};let loading=null;
  const emit=()=>onChange(state);
  function apply(value){const next=readMarketSettings(value);if(next.items===null)throw Error('MARKET_SETTINGS_UNINITIALIZED');Object.assign(state,{items:next.items,revision:next.revision,storage:next.storage,readOnly:next.readOnly===true,canRefresh:next.canRefresh!==false,updatedAt:next.updatedAt||null,ready:true,error:null});}
  async function write(items,initializing=false){
    if(state.readOnly||state.saving||(!initializing&&(!state.ready||state.error==='load')))return false;
    const candidate=cleanMarketItems(items);state.saving=true;state.error=null;emit();
    try{
      const response=await fetcher('/api/market-pcr-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:candidate,revision:state.revision}),signal:AbortSignal.timeout(20000)}),body=await response.json();
      if(response.status===409){apply(body);state.error='conflict';return false;}
      if(!response.ok)throw Error('MARKET_SETTINGS_SAVE_FAILED');apply(body);return true;
    }catch{state.error='save';return false;}finally{state.saving=false;emit();}
  }
  return {state,save:items=>write(items),load(){
    if(loading)return loading;state.loading=true;state.error=null;emit();
    loading=(async()=>{try{
      const response=await fetcher('/api/market-pcr-settings',{credentials:'same-origin',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('MARKET_SETTINGS_LOAD_FAILED');
      const body=readMarketSettings(await response.json());state.revision=body.revision;state.storage=body.storage;state.readOnly=body.readOnly===true;state.canRefresh=body.canRefresh!==false;
      if(body.items===null){const success=await write(DEFAULT_MARKET_ITEMS,true);if(!success&&!state.ready)state.error='load';}else apply(body);
    }catch{state.error='load';}finally{state.loading=false;loading=null;emit();}})();return loading;
  }};
}
