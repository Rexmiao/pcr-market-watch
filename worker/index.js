import {handleApi} from './backend.js';
import {handleCboeApi} from './cboe.js';
import {handleWatchlistsApi} from './watchlists.js';
import {handleMarketSettingsApi} from './market-settings.js';
import {handleProviderApi} from './providers.js';
import {handleMarketApi} from './market.js';
import {handleOptionsMonitorApi} from './option-monitor.js';
import {ASSETS,SEED,CBOE_SEED} from './assets.generated.js';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(['/api/structure-archive','/api/structure-archive/index','/api/structure-daily','/api/structure-daily/capture'].includes(url.pathname))return new Response(JSON.stringify({schemaVersion:1,supported:false,status:'unavailable',error:'LOCAL_BACKEND_REQUIRED'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(['/api/gamma-exposure','/api/gamma-exposure/refresh','/api/max-pain','/api/max-pain/refresh'].includes(url.pathname))return new Response(JSON.stringify({schemaVersion:1,provider:'moomoo_webapi',status:'unavailable',error:'LOCAL_BACKEND_REQUIRED'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    if(url.pathname==='/api/brief-quotes'||url.pathname==='/api/brief-quotes/status')return new Response(JSON.stringify({supported:false,localOnly:true,error:'LOCAL_BACKEND_REQUIRED'}),{status:501,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(url.pathname==='/api/oi-daily'||url.pathname==='/api/quote-reviews'||url.pathname.startsWith('/api/quote-reviews/'))return new Response(JSON.stringify({supported:false,localOnly:true,error:'LOCAL_BACKEND_REQUIRED'}),{status:501,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(url.pathname==='/api/oi-summaries/history')return new Response(JSON.stringify({supported:false,available:false,error:'LOCAL_BACKEND_REQUIRED'}),{status:501,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(['/api/oi-summaries','/api/oi-summaries/refresh'].includes(url.pathname))return new Response(JSON.stringify({schemaVersion:1,provider:'moomoo_webapi',status:'local_backend_required',checkedAt:null,items:[],errors:[{code:'LOCAL_BACKEND_REQUIRED',message:'Use the local backend for authorized OI summary queries.'}]}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    if(url.pathname.startsWith('/api/options-monitor'))return handleOptionsMonitorApi(request)||new Response('Not found',{status:404});
    if(url.pathname==='/api/market'||url.pathname==='/api/market/refresh')return handleMarketApi(request,env,ctx);
    if(url.pathname==='/api/watchlist-settings')return await handleWatchlistsApi(request,env)||new Response('Not found',{status:404});
    if(url.pathname==='/api/market-pcr-settings')return await handleMarketSettingsApi(request,env)||new Response('Not found',{status:404});
    if(url.pathname.startsWith('/api/providers/'))return handleProviderApi(request)||new Response('Not found',{status:404});
    if(url.pathname==='/api/cboe'||url.pathname.startsWith('/api/cboe/'))return await handleCboeApi(request,env,ctx,CBOE_SEED)||new Response('Not found',{status:404});
    if(url.pathname.startsWith('/api/'))return await handleApi(request,env,ctx,SEED)||new Response('Not found',{status:404});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
  }
};
