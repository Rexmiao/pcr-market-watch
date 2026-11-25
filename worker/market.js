// Public provider snapshots. Market timestamps are separate from retrieval time.
const MARKET_QUOTES = Object.freeze([
  {id:'sp500',symbol:'^GSPC',name:'S&P 500'},
  {id:'nasdaq',symbol:'^IXIC',name:'Nasdaq Composite'},
  {id:'dow',symbol:'^DJI',name:'Dow Jones Industrial Average'},
  {id:'oil',symbol:'CL=F',name:'WTI Crude Oil'},
  {id:'gold',symbol:'GC=F',name:'Gold'},
]);
const MARKET_TTL = 60000;
const MARKET_COOLDOWN = 30000;
const MARKET_TIMEOUT = 12000;

function marketJson(body,status=200,headers={}) {
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}

function marketSessionDate(stamp,timezone) {
  let exchangeTimezoneName=typeof timezone==='string'?timezone:'America/New_York';
  let formatter;
  try {formatter=new Intl.DateTimeFormat('en-CA',{timeZone:exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'});}
  catch {exchangeTimezoneName='America/New_York';formatter=new Intl.DateTimeFormat('en-CA',{timeZone:exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'});}
  const values=Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part=>[part.type,part.value]));
  return {sourceSessionDate:`${values.year}-${values.month}-${values.day}`,exchangeTimezoneName};
}

function parseMarketQuote(payload,definition,checkedAt) {
  const meta=payload?.chart?.result?.[0]?.meta;
  if(payload?.chart?.error||!meta||typeof meta!=='object'||Array.isArray(meta))throw Error('Yahoo Finance returned no usable chart metadata.');
  if(typeof meta.symbol==='string'&&meta.symbol!==definition.symbol)throw Error('Yahoo Finance returned a different symbol.');
  const price=meta.regularMarketPrice;
  if(!Number.isFinite(price))throw Error('The provider market price is missing or invalid.');
  // The endpoint is fixed to range=1d; only this range permits the chart baseline fallback.
  const previousCloseField=Number.isFinite(meta.previousClose)&&meta.previousClose>0?'previousClose':'chartPreviousClose';
  const previousClose=meta[previousCloseField];
  if(!Number.isFinite(previousClose)||previousClose<=0)throw Error('The provider previous close is missing or invalid.');
  if(!Number.isFinite(meta.regularMarketTime)||meta.regularMarketTime<=0)throw Error('The provider market timestamp is missing or invalid.');
  const stamp=meta.regularMarketTime*1000;
  if(!Number.isFinite(stamp)||!Number.isFinite(new Date(stamp).getTime()))throw Error('The provider market timestamp is invalid.');
  const change=price-previousClose,changePercent=change/previousClose*100;
  if(!Number.isFinite(change)||!Number.isFinite(changePercent))throw Error('The provider change calculation is invalid.');
  const text=value=>typeof value==='string'&&value.trim()&&value.length<=200?value.trim():null;
  const contractName=['oil','gold'].includes(definition.id)?text(meta.shortName)||text(meta.longName):null;
  return {...definition,price,previousClose,previousCloseField,change,changePercent,
    marketTime:new Date(stamp).toISOString(),...marketSessionDate(stamp,meta.exchangeTimezoneName),
    currency:text(meta.currency),instrumentType:text(meta.instrumentType),
    ...(contractName?{contractName}:{}),sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(definition.symbol),
    checkedAt,stale:false};
}

function missingMarketQuote(definition,at,error) {
  return {...definition,price:null,previousClose:null,previousCloseField:null,change:null,changePercent:null,
    marketTime:null,sourceSessionDate:null,exchangeTimezoneName:null,currency:null,instrumentType:null,
    sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(definition.symbol),checkedAt:null,lastAttemptAt:at,stale:true,error};
}

function createMarketHandler({fetcher=(...args)=>fetch(...args),now=()=>Date.now()}={}) {
  const quotes=new Map();
  let active=null,lastAttempt=null,lastCheck=null;
  const iso=()=>new Date(now()).toISOString();
  function body(extras={}) {
    const values=MARKET_QUOTES.map(definition=>quotes.get(definition.id)||missingMarketQuote(definition,null,'Not checked yet.'));
    const current=values.filter(quote=>!quote.stale&&Number.isFinite(quote.price)).length;
    return {provider:'Yahoo Finance',checkedAt:lastCheck===null?null:new Date(lastCheck).toISOString(),quotes:values,
      status:current===MARKET_QUOTES.length?'current':current?'partial':'failed',
      notice:'Provider snapshots, not a guarantee of real-time quotes. Market time is separate from checkedAt. Changes use the provider previous close; futures may use a settlement-related baseline, not calendar midnight.',
      cacheSeconds:MARKET_TTL/1000,...extras};
  }
  async function refresh() {
    lastAttempt=now();
    await Promise.all(MARKET_QUOTES.map(async definition=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),MARKET_TIMEOUT);
      try {
        const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(definition.symbol)+'?interval=1m&range=1d';
        const response=await fetcher(url,{headers:{accept:'application/json','user-agent':'Mozilla/5.0'},redirect:'manual',signal:controller.signal});
        if(response.status<200||response.status>=300)throw Error('Yahoo Finance HTTP '+response.status);
        const quote=parseMarketQuote(await response.json(),definition,iso());
        quotes.set(definition.id,quote);
      }catch(error) {
        const at=iso(),message=String(error?.message||error).slice(0,160),previous=quotes.get(definition.id);
        // Keep the original successful check and market times when retaining an old price.
        quotes.set(definition.id,previous?{...previous,stale:true,lastAttemptAt:at,error:message}:missingMarketQuote(definition,at,message));
      }finally{clearTimeout(timer);}
    }));
    lastCheck=now();
    return body({cached:false,refreshStatus:'checked',retryAfterSeconds:MARKET_COOLDOWN/1000});
  }
  return async request=>{
    const url=new URL(request.url);
    if(!['/api/market','/api/market/refresh'].includes(url.pathname))return null;
    const origin=request.headers.get('origin');
    if(origin&&origin!==url.origin)return marketJson({error:'Only same-origin requests are accepted.'},403);
    const force=url.pathname==='/api/market/refresh';
    if(request.method!==(force?'POST':'GET'))return marketJson({error:'Method not allowed.'},405,{allow:force?'POST':'GET'});
    if([...url.searchParams].length)return marketJson({error:'This endpoint has a fixed five-symbol allowlist and accepts no query parameters.'},400);
    if(active)return marketJson({...await active,coalesced:true});
    const elapsed=lastAttempt===null?Infinity:now()-lastAttempt;
    if(force&&elapsed<MARKET_COOLDOWN)return marketJson(body({cached:true,refreshStatus:'cooldown',retryAfterSeconds:Math.ceil((MARKET_COOLDOWN-elapsed)/1000)}));
    if(!force&&lastCheck!==null&&now()-lastCheck<MARKET_TTL)return marketJson(body({cached:true,refreshStatus:'cached'}));
    active=refresh();
    try{return marketJson(await active);}finally{active=null;}
  };
}

const marketHandler=createMarketHandler();
export async function handleMarketApi(request,env,ctx) {return marketHandler(request);}
export const marketTesting={createMarketHandler,parseMarketQuote,marketSessionDate};
