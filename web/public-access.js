import {t,translatePage,getLanguage} from './i18n.js';

const privatePaths=new Set(['/options-monitor.html','/quote-reviews.html','/market-brief.html']);
export function publicAccessState(value){
  if(!value||typeof value!=='object'||typeof value.authenticated!=='boolean'||typeof value.publicReadOnly!=='boolean')return null;
  return {authenticated:value.authenticated,publicReadOnly:value.publicReadOnly,canRefresh:value.canRefresh!==false};
}
if(typeof document!=='undefined'){
  let current=null;
  function render(){
    if(!current)return;
    document.body.classList.remove('access-pending');document.body.classList.toggle('public-access',current.publicReadOnly);
    for(const element of document.querySelectorAll('[data-owner-only]'))element.hidden=current.publicReadOnly;
    for(const link of document.querySelectorAll('a[href]')){
      let url;try{url=new URL(link.getAttribute('href'),location.href);}catch{continue;}
      if(url.origin===location.origin&&privatePaths.has(url.pathname))link.hidden=current.publicReadOnly;
    }
    let banner=document.getElementById('public-access-banner');
    if(!banner&&current.publicReadOnly){banner=document.createElement('div');banner.id='public-access-banner';banner.className='public-access-banner';banner.setAttribute('role','status');document.querySelector('.page-header')?.before(banner);}
    if(banner){
      banner.hidden=!current.publicReadOnly;
      if(current.publicReadOnly){const copy=document.createElement('span'),login=document.createElement('a');copy.textContent=t('publicViewer');login.href='/_pcr/login?lang='+getLanguage();login.textContent=t('ownerLogin');banner.replaceChildren(copy,login);}
    }
  }
  window.addEventListener('pcr-access-change',event=>{const next=publicAccessState(event.detail);if(next){current=next;render();}});
  window.addEventListener('pcr-language-change',render);
  async function load(){
    try{
      const response=await fetch('/api/access',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
      if([404,501].includes(response.status)){if(!current){current={authenticated:true,publicReadOnly:false,canRefresh:true};render();window.dispatchEvent(new CustomEvent('pcr-access-change',{detail:current}));}return;}
      if(!response.ok)return;const next=publicAccessState(await response.json());if(next){current=next;render();window.dispatchEvent(new CustomEvent('pcr-access-change',{detail:next}));}
    }catch{/* Settings payload can still establish access; keep controls hidden until then. */}
  }
  void load();
}
