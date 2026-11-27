import {getLanguage,t} from './i18n.js';

const main=document.querySelector('main');
if(main){
  const panel=document.createElement('section');panel.id='market-overview';panel.className='panel market-overview';panel.setAttribute('aria-labelledby','market-overview-title');
  panel.innerHTML='<div class="market-head"><div><h2 id="market-overview-title"></h2><p id="market-overview-note"></p></div><div class="market-actions"><button id="market-pin" class="button secondary" type="button"></button><button id="market-refresh" class="button secondary" type="button"></button></div></div><div id="market-quotes" class="market-grid" aria-live="polite"></div><p id="market-status" class="market-source-line" role="status"></p>';
  let shortcuts=null;
  if(document.getElementById('watchlist-panel')){
    shortcuts=document.createElement('nav');shortcuts.id='market-shortcuts';shortcuts.className='market-shortcuts';
    for(const [key,id,hash,label]of [['macro','market-overall-jump','cboe-panel','navMarketPcr'],['etf','market-etf-jump','market-etf-reference','navIndexEtfs'],['watchlist','market-watchlist-jump','watchlist-panel','navWatchlist'],['history','market-history-jump','history-panel','navHistory']]){
      const link=document.createElement('a');link.id=id;link.className='pcr-jump';link.href='#'+hash;link.dataset.pcrJump=key;link.dataset.shortcutLabel=label;
      if(['macro','etf'].includes(key)){link.setAttribute('aria-disabled','true');link.tabIndex=-1;link.dataset.disabledReason='navReferenceLoading';}
      shortcuts.append(link);
    }
    panel.querySelector('.market-head').after(shortcuts);
  }
  main.insertBefore(panel,main.querySelector('section'));
  let payload=null,busy=false,failure=false,pinned=true,lastLoad=0,cooldownUntil=0;
  try{pinned=localStorage.getItem('pcr-dashboard:market-sticky:v1')!=='off';}catch{}
  const ids=['sp500','nasdaq','dow','oil','gold','bitcoin'];
  const names={zh:{sp500:'标普 500',nasdaq:'纳斯达克综合',dow:'道琼斯',oil:'WTI 原油期货',gold:'COMEX 黄金期货',bitcoin:'比特币 BTC/USD'},en:{sp500:'S&P 500',nasdaq:'Nasdaq Composite',dow:'Dow Jones',oil:'WTI crude futures',gold:'COMEX gold futures',bitcoin:'Bitcoin · BTC/USD'}};
  const node=id=>document.getElementById(id);
  const words=()=>getLanguage()==='en'?{
    title:'Market overview',note:'Source snapshots · Quotes may be delayed',pin:'Float while scrolling',unpin:'Floating',refresh:'Refresh quotes',loading:'Checking market quotes…',failed:'Quotes could not be refreshed. Previously loaded observations retain their own timestamps.',partial:'Some quotes are unavailable or retained from an earlier check.',source:'Yahoo Finance',checked:'Checked',reference:'Change versus the source’s previous close; futures use the named contract. BTC change is not a rolling 24h return.',cryptoBasis:'Source previous close · 24/7',cryptoNote:'BTC/USD trades continuously. Change uses Yahoo’s previous close, not a rolling 24-hour return. Quote times are displayed in New York time.',quoteTime:'Quote',old:'Retained',missing:'Unavailable',noPrice:'No verified quote',
  }:{title:'行情概览',note:'供应商行情快照 · 可能延迟',pin:'悬浮显示',unpin:'已悬浮',refresh:'刷新行情',loading:'正在检查市场行情…',failed:'行情更新失败；保留此前数据及其原有时间。',partial:'部分行情尚未取得，或保留了此前快照。',source:'Yahoo Finance',checked:'检查',reference:'涨跌相对源前收价；期货使用注明的源合约。BTC 涨跌不是滚动24小时收益。',cryptoBasis:'源前收 · 24/7',cryptoNote:'BTC/USD 全天候交易。涨跌相对 Yahoo 源前收价，不是滚动24小时收益；行情时间以美东显示。',quoteTime:'行情时间',old:'保留快照',missing:'未取得',noPrice:'暂无可核实行情'};
  function time(value){const stamp=new Date(value);if(!value||!Number.isFinite(stamp.valueOf()))return '—';return new Intl.DateTimeFormat(getLanguage()==='en'?'en-US':'zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp)+' ET';}
  function refreshControl(){const remaining=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000)),w=words();node('market-refresh').disabled=busy||remaining>0;node('market-refresh').textContent=busy?w.loading:remaining>0?(getLanguage()==='en'?`Refresh in ${remaining}s`:`${remaining} 秒后可刷新`):w.refresh;}
  function render(){
    const w=words(),language=getLanguage()==='en'?'en':'zh';
    if(shortcuts){shortcuts.setAttribute('aria-label',t('navPcrSections'));for(const link of shortcuts.children){link.textContent=t(link.dataset.shortcutLabel);link.title=link.dataset.disabledReason?t(link.dataset.disabledReason):link.textContent;}}
    node('market-overview-title').textContent=w.title;node('market-overview-note').textContent=w.note;
    panel.classList.toggle('is-floating',pinned);node('market-pin').textContent=pinned?w.unpin:w.pin;node('market-pin').setAttribute('aria-pressed',String(pinned));
    refreshControl();
    const quotes=Array.isArray(payload?.quotes)?payload.quotes:[];
    node('market-quotes').replaceChildren(...ids.map(id=>{
      const quote=quotes.find(item=>item.id===id),card=document.createElement('article');card.className='market-card';card.dataset.market=id;if(quote?.stale)card.classList.add('is-stale');
      const heading=document.createElement('h3');heading.textContent=names[language][id];
      const price=document.createElement('strong');price.className='market-price';price.textContent=Number.isFinite(quote?.price)?new Intl.NumberFormat(language==='en'?'en-US':'zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2,...(id==='bitcoin'?{style:'currency',currency:'USD'}:{})}).format(quote.price):'—';
      const change=document.createElement('span');change.className='market-change '+(quote?.changePercent>0?'market-up':quote?.changePercent<0?'market-down':'market-flat');change.textContent=Number.isFinite(quote?.changePercent)?(quote.changePercent>0?'+':'')+quote.changePercent.toFixed(2)+'%':'—';
      const stamp=document.createElement('small');stamp.textContent=quote?.marketTime?[`${quote.stale?w.old+' · ':''}${time(quote.marketTime)}`,['oil','gold'].includes(id)?quote.contractName:'',id==='bitcoin'?w.cryptoBasis:''].filter(Boolean).join(' · '):w.noPrice;
      card.title=[quote?.name,quote?.sourceUrl,quote?.marketTime?time(quote.marketTime):'',Number.isFinite(quote?.previousClose)?(language==='en'?'Previous close: ':'源前收：')+quote.previousClose:'',id==='bitcoin'?w.cryptoNote:''].filter(Boolean).join('\n');
      const contract=document.createElement('small');contract.className='market-contract';contract.textContent=['oil','gold'].includes(id)?quote?.contractName||quote?.name||'':quote?.symbol||'';
      card.append(heading,price,change,stamp,contract);return card;
    }));
    const partial=quotes.some(q=>q.stale||!Number.isFinite(q.price));
    node('market-status').textContent=busy?w.loading:failure?w.failed:[partial?w.partial:'',w.source,payload?.checkedAt?w.checked+' '+time(payload.checkedAt):'',w.reference].filter(Boolean).join(' · ');
  }
  async function load(refresh=false){
    if(busy||(refresh&&Date.now()<cooldownUntil))return;busy=true;failure=false;render();
    try{
      const response=await fetch(refresh?'/api/market/refresh':'/api/market',{method:refresh?'POST':'GET',credentials:'same-origin',...(refresh?{headers:{'content-type':'application/json'},body:'{}'}:{}),signal:AbortSignal.timeout(25000)});
      const incoming=await response.json();if(!response.ok||!Array.isArray(incoming.quotes))throw Error('UNAVAILABLE');
      payload=incoming;failure=incoming.status==='failed';lastLoad=incoming.cached?(Date.parse(incoming.checkedAt)||Date.now()):Date.now();
      if(Number.isFinite(incoming.retryAfterSeconds)&&incoming.retryAfterSeconds>0&&incoming.retryAfterSeconds<=60)cooldownUntil=Date.now()+incoming.retryAfterSeconds*1000;
    }catch{failure=true;}finally{busy=false;render();}
  }
  node('market-pin').addEventListener('click',()=>{pinned=!pinned;try{localStorage.setItem('pcr-dashboard:market-sticky:v1',pinned?'on':'off');}catch{}render();});
  node('market-refresh').addEventListener('click',()=>load(true));
  window.addEventListener('pcr-language-change',render);
  window.addEventListener('pcr-data-refresh',event=>load(!event.detail?.alreadyRefreshed));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastLoad>60000)load();});
  setInterval(()=>{if(!document.hidden&&Date.now()-lastLoad>60000)load();},60000);
  setInterval(()=>{if(!document.hidden)refreshControl();},1000);
  render();load();
}
