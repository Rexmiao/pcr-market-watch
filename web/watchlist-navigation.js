import {t} from './i18n.js';

// Same-page view navigation. Source refresh and saved preferences stay untouched.
if(document.getElementById('watchlist-panel')){
  const targets={macro:'cboe-panel',etf:'market-etf-reference',watchlist:'watchlist-panel',history:'history-panel'};
  let state={ready:false,failed:false,macro:[],etf:[]},active=null,activeUntil=0,frame=0,settleTimer=0,smoothUntil=0;
  const groupAtHash=()=>Object.keys(targets).find(key=>location.hash==='#'+targets[key]);
  const available=group=>!['macro','etf'].includes(group)||state.ready&&!state.failed&&state[group].length>0;
  function renderLinks(){
    for(const link of document.querySelectorAll('a[data-pcr-jump]')){
      const group=link.dataset.pcrJump,enabled=available(group),reason=enabled?'':state.failed?'navReferenceFailed':!state.ready?'navReferenceLoading':group==='etf'?'navNoEtf':'navNoMacro';
      link.setAttribute('aria-disabled',String(!enabled));link.tabIndex=enabled?0:-1;link.dataset.disabledReason=reason;link.title=reason?t(reason):link.textContent;
    }
  }
  function topOffset(){
    const panel=document.getElementById('market-overview');
    if(!panel?.classList.contains('is-floating'))return 12;
    const style=getComputedStyle(panel);
    if(!['sticky','fixed'].includes(style.position))return 12;
    return panel.getBoundingClientRect().height+Math.max(0,parseFloat(style.top)||0)+12;
  }
  function position(behavior='instant',force=false){
    const target=document.getElementById(targets[active]);if(!target||!available(active))return;
    // The personal-history panel can be hidden while the saved list loads.
    // Wait for its layout before focusing or calculating a document position.
    if(!target.getClientRects().length||target.getBoundingClientRect().height===0)return;
    const offset=topOffset();target.style.scrollMarginTop=offset+'px';
    const max=Math.max(0,document.documentElement.scrollHeight-innerHeight),top=Math.min(max,Math.max(0,target.getBoundingClientRect().top+window.scrollY-offset));
    if(document.activeElement!==target)target.focus({preventScroll:true});
    if(force||Math.abs(window.scrollY-top)>1)window.scrollTo({top,behavior});
  }
  function activate(smooth=false){
    const target=document.getElementById(targets[active]);if(!target||!available(active))return;
    clearTimeout(settleTimer);settleTimer=0;if(frame){cancelAnimationFrame(frame);frame=0;}
    if(['macro','etf'].includes(active))window.dispatchEvent(new CustomEvent('pcr-market-navigate',{detail:{group:active}}));
    const animate=smooth&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    smoothUntil=animate?Date.now()+500:0;position(animate?'smooth':'instant',true);settle();
  }
  function settle(){
    if(frame||!active||Date.now()>activeUntil||groupAtHash()!==active)return;
    // Let the requested animation finish, then correct using an explicit
    // instant scroll. UA anchoring or an older smooth scroll can move the
    // viewport without changing the main element's total height.
    if(Date.now()<smoothUntil){clearTimeout(settleTimer);settleTimer=setTimeout(()=>{settleTimer=0;settle();},smoothUntil-Date.now()+20);return;}
    frame=requestAnimationFrame(()=>{frame=0;if(Date.now()<=activeUntil&&groupAtHash()===active)position();});
  }
  function navigate(group,{record=false,smooth=false}={}){
    if(!targets[group])return;if(record&&location.hash!=='#'+targets[group])history.pushState(history.state,'','#'+targets[group]);
    active=group;activeUntil=Date.now()+15000;activate(smooth);
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[data-pcr-jump]');
    if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    const group=link.dataset.pcrJump;event.preventDefault();if(available(group))navigate(group,{record:true,smooth:true});
  });
  const fromHistory=()=>{const group=groupAtHash();if(group)navigate(group);else activeUntil=0;};
  window.addEventListener('hashchange',fromHistory);
  window.addEventListener('popstate',fromHistory);
  window.addEventListener('pcr-market-navigation',event=>{
    const wasAvailable=active&&available(active);state=event.detail;renderLinks();
    // Wait until the settings callback finishes selecting/saving its own initial
    // view. A deep-link view change must not enter that preference-write stack.
    if(active&&Date.now()<=activeUntil&&groupAtHash()===active&&!wasAvailable&&available(active))requestAnimationFrame(()=>{if(Date.now()<=activeUntil&&groupAtHash()===active&&available(active))activate();});
    settle();
  });
  window.addEventListener('pcr-language-change',renderLinks);
  window.addEventListener('load',settle);
  window.addEventListener('resize',settle);
  window.addEventListener('scroll',settle,{passive:true});
  window.addEventListener('scrollend',settle,{passive:true});
  window.addEventListener('pcr-summary-watchlist',settle);
  window.addEventListener('pcr-summary-market',settle);
  if(typeof ResizeObserver==='function'){
    const observer=new ResizeObserver(settle),main=document.querySelector('main');observer.observe(main);
    // Sibling panels can exchange height while main's total height stays equal.
    for(const child of main.children)observer.observe(child);
  }
  // A manual action ends layout correction; never pull the visitor back after
  // they choose to scroll, type, or edit a watchlist item.
  const stop=()=>{activeUntil=0;clearTimeout(settleTimer);settleTimer=0;if(frame){cancelAnimationFrame(frame);frame=0;}};
  for(const event of ['wheel','touchstart','pointerdown'])window.addEventListener(event,stop,{passive:true});
  window.addEventListener('keydown',event=>{if(!['Shift','Control','Alt','Meta'].includes(event.key))stop();});
  renderLinks();fromHistory();window.dispatchEvent(new Event('pcr-market-navigation-request'));
}
