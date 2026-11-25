import {setLanguage,t,initLanguageToggle} from './i18n.js';

// Honor an explicitly linked language; normal navigation uses the shared preference.
const linkedLanguage=new URLSearchParams(location.search).get('lang');
if(linkedLanguage==='zh'||linkedLanguage==='en')setLanguage(linkedLanguage);
initLanguageToggle();
const title=()=>{document.title=t('monitorDocumentTitle');};
title();window.addEventListener('pcr-language-change',title);
await import('./option-monitor.js');
