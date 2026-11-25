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
