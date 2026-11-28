// Day/night display mode. A classic (non-module) script loaded in <head> before the
// stylesheets, so the saved mode is applied before the first paint. Night is the
// default. The choice is a display preference only: it is kept in localStorage and
// mirrored to a functional `pcr-theme` cookie (light|dark, no personal data) so the
// script-free sign-in page can render the same mode on the server.
(function(){
  var KEY='pcr-dashboard:theme:v1',COOKIE='pcr-theme',root=document.documentElement;
  var WORDS={
    zh:{group:'显示模式',light:'日间',dark:'夜间',lightHelp:'切换到日间模式',darkHelp:'切换到夜间模式',hub:'Lévy Quant 主站',hubHelp:'返回 Lévy Quant 主站'},
    en:{group:'Display mode',light:'Day',dark:'Night',lightHelp:'Switch to day mode',darkHelp:'Switch to night mode',hub:'Lévy Quant',hubHelp:'Back to the Lévy Quant main site'}
  };
  var HUB='https://levyquant.ai/';
  function valid(value){return value==='light'||value==='dark';}
  function saved(){try{var value=localStorage.getItem(KEY);if(valid(value))return value;}catch(error){}
    var match=/(?:^|;\s*)pcr-theme=(light|dark)(?:;|$)/.exec(document.cookie||'');return match?match[1]:'dark';}
  function current(){return root.getAttribute('data-theme')==='light'?'light':'dark';}
  function apply(mode){root.setAttribute('data-theme',mode);root.style.colorScheme=mode;}
  function framed(){try{return window.top!==window.self;}catch(error){return true;}}
  // Inside the cross-site huggingface.co iframe a Lax cookie is neither stored nor sent,
  // so mirror the gateway's embedded cookies (SameSite=None; Secure; Partitioned).
  function cookieAttributes(){var https=location.protocol==='https:';return '; Path=/; Max-Age=31536000'+(https&&framed()?'; SameSite=None; Secure; Partitioned':'; SameSite=Lax'+(https?'; Secure':''));}
  function remember(mode){
    try{localStorage.setItem(KEY,mode);}catch(error){}
    try{document.cookie=COOKIE+'='+mode+cookieAttributes();}catch(error){}
  }
  // The script-free sign-in page cannot read localStorage, so the page language
  // (<html lang>, set from the saved or linked choice) is mirrored to a functional
  // pcr-lang cookie (zh|en only) that the gateway reads.
  function rememberLanguage(){
    var value=String(root.lang||'').toLowerCase().indexOf('zh')===0?'zh':'en';
    if(new RegExp('(?:^|;\\s*)pcr-lang='+value+'(?:;|$)').test(document.cookie||''))return;
    try{document.cookie='pcr-lang='+value+cookieAttributes();}catch(error){}
  }
  function words(){return WORDS[String(root.lang||'').toLowerCase().indexOf('zh')===0?'zh':'en'];}
  function renderHub(link){var copy=words();if(link.textContent!==copy.hub)link.textContent=copy.hub;link.title=copy.hubHelp;}
  function render(group){
    var hub=document.querySelector('.hub-link');if(hub)renderHub(hub);
    var copy=words(),mode=current(),buttons=group.querySelectorAll('[data-theme-mode]');
    group.setAttribute('aria-label',copy.group);
    for(var index=0;index<buttons.length;index++){
      var button=buttons[index],value=button.getAttribute('data-theme-mode');
      if(button.textContent!==copy[value])button.textContent=copy[value];
      button.setAttribute('aria-pressed',String(value===mode));
      button.title=copy[value+'Help'];
    }
  }
  function announce(mode){
    var groups=document.querySelectorAll('.theme-switch');
    for(var index=0;index<groups.length;index++)render(groups[index]);
    try{window.dispatchEvent(new CustomEvent('pcr-theme-change',{detail:{theme:mode}}));}catch(error){}
  }
  function choose(mode){if(!valid(mode)||mode===current())return;apply(mode);remember(mode);announce(mode);}
  function mount(){
    var nav=document.querySelector('.site-nav');
    if(!nav||nav.querySelector('.theme-switch'))return;
    // Every Lévy Quant site links back to the hub; first in the nav so it wraps
    // with the page links instead of crowding the switches on phones.
    var hub=document.createElement('a');
    hub.className='hub-link';hub.href=HUB;hub.setAttribute('data-skip-i18n','');
    nav.insertBefore(hub,nav.firstChild);
    var group=document.createElement('div');
    // Shares the language switch's segmented-control styles (light and dark).
    group.className='language-switch theme-switch';
    group.setAttribute('role','group');
    group.setAttribute('data-skip-i18n','');
    ['light','dark'].forEach(function(mode){
      var button=document.createElement('button');
      button.type='button';button.setAttribute('data-theme-mode',mode);
      group.appendChild(button);
    });
    group.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-theme-mode]'):null;
      if(button)choose(button.getAttribute('data-theme-mode'));
    });
    // Keep both segmented controls together so they wrap as one unit on phones.
    var language=nav.querySelector('.language-switch'),tools=document.createElement('div');
    tools.className='nav-tools';
    nav.insertBefore(tools,language);
    tools.appendChild(group);
    if(language)tools.appendChild(language);
    render(group);rememberLanguage();
    window.addEventListener('pcr-language-change',function(){render(group);rememberLanguage();});
    if(typeof MutationObserver==='function')new MutationObserver(function(){render(group);rememberLanguage();}).observe(root,{attributes:true,attributeFilter:['lang']});
  }
  apply(saved());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  // Keep other open tabs in step with the latest choice.
  window.addEventListener('storage',function(event){if(event.key===KEY&&valid(event.newValue)&&event.newValue!==current()){apply(event.newValue);announce(event.newValue);}});
})();
