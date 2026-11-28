import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const common=await readFile(new URL('../web/i18n.js',import.meta.url),'utf8');
const site=await readFile(new URL('../site/locale.js',import.meta.url),'utf8');
function storage(saved,blocked=false){const values=new Map(saved?[['pcr-dashboard:language:v1',saved],['pcr-market-watch:site-language:v1',saved]]:[]);return {values,getItem(key){if(blocked)throw Error('blocked');return values.get(key)||null;},setItem(key,value){if(blocked)throw Error('blocked');values.set(key,value);}};}
function commonLanguage({saved,url='https://pcr.example/',blocked=false}={}){
 const localStorage=storage(saved,blocked),events=[],document={documentElement:{},body:{dataset:{}},querySelectorAll:()=>[],getElementById:()=>null};
 const context={localStorage,URL,location:{href:url},document,window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,detail){this.type=type;this.detail=detail;}}};
 vm.runInNewContext(common.replaceAll('export ', '')+';globalThis.api={getLanguage,setLanguage};',context);
 return {...context,events};
}
test('app defaults to English, retains valid saved choice and ignores invalid preferences',()=>{
 assert.equal(commonLanguage().api.getLanguage(),'en');assert.equal(commonLanguage({saved:'zh'}).api.getLanguage(),'zh');assert.equal(commonLanguage({saved:'en'}).api.getLanguage(),'en');assert.equal(commonLanguage({saved:'invalid'}).api.getLanguage(),'en');
});
test('valid linked language wins and persists across application navigation',()=>{
 const zh=commonLanguage({saved:'en',url:'https://pcr.example/?lang=zh'});assert.equal(zh.api.getLanguage(),'zh');assert.equal(zh.localStorage.values.get('pcr-dashboard:language:v1'),'zh');
 assert.equal(commonLanguage({saved:'zh',url:'https://pcr.example/?lang=en'}).api.getLanguage(),'en');assert.equal(commonLanguage({saved:'zh',url:'https://pcr.example/?lang=invalid'}).api.getLanguage(),'zh');
});
test('application switching still works when browser storage is unavailable',()=>{
 const page=commonLanguage({blocked:true});assert.equal(page.api.getLanguage(),'en');page.api.setLanguage('zh');assert.equal(page.api.getLanguage(),'zh');assert.equal(page.document.documentElement.lang,'zh-CN');page.api.setLanguage('en');assert.equal(page.document.documentElement.lang,'en');assert.equal(page.events.length,2);
});
function showcase({saved,url='https://pcr.example/#preview',blocked=false}={}){
 const localStorage=storage(saved,blocked),handlers={},meta={},readme={dataset:{i18nHref:'readme'}},spec={dataset:{i18nHref:'spec'}},option=lang=>{const item={dataset:{lang},attrs:{},setAttribute(name,value){this.attrs[name]=value;}};item.closest=()=>item;return item;},options={en:option('en'),zh:option('zh')},toggle={options,setAttribute(){},querySelectorAll:()=>Object.values(options),addEventListener(type,fn){handlers[type]=fn;}},image={getAttribute:()=>null},header={getBoundingClientRect:()=>({height:100})};
 const document={documentElement:{style:{setProperty(){}}},getElementById:id=>id==='language-toggle'?toggle:id==='dialog-image'?image:{},querySelectorAll:selector=>selector==='[data-i18n-href]'?[readme,spec]:[],querySelector:selector=>selector==='meta[name="description"]'?meta:selector==='.site-header'?header:null};
 const context={localStorage,URL,location:{href:url},document,history:{replaceState(a,b,next){context.location.href=next.href;}},window:{addEventListener(){}},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(site,context);return {context,readme,spec,toggle,click:(lang='zh')=>handlers.click({target:options[lang]}),localStorage};
}
test('showcase defaults to English with matching README and Spec destinations',()=>{
 const page=showcase();assert.equal(page.context.document.documentElement.lang,'en');assert(page.readme.href.endsWith('/README.md'));assert(page.spec.href.endsWith('/docs/PRODUCT_SPEC.en.md'));assert.deepEqual([page.toggle.options.en.attrs['aria-pressed'],page.toggle.options.zh.attrs['aria-pressed']],['true','false']);
 page.click('en');assert.equal(page.localStorage.values.get('pcr-market-watch:site-language:v1'),undefined,'Choosing the current language writes nothing');
 page.click();assert.equal(page.context.document.documentElement.lang,'zh-CN');assert.deepEqual([page.toggle.options.en.attrs['aria-pressed'],page.toggle.options.zh.attrs['aria-pressed']],['false','true']);assert(page.readme.href.endsWith('/README.zh-CN.md'));assert(page.spec.href.endsWith('/docs/PRODUCT_SPEC.md'));assert.equal(new URL(page.context.location.href).hash,'#preview');assert.equal(page.localStorage.values.get('pcr-market-watch:site-language:v1'),'zh');
});
test('showcase honors explicit and saved languages and works without storage',()=>{
 assert.equal(showcase({saved:'zh'}).context.document.documentElement.lang,'zh-CN');assert.equal(showcase({saved:'zh',url:'https://pcr.example/?lang=en#preview'}).context.document.documentElement.lang,'en');const page=showcase({blocked:true});assert.equal(page.context.document.documentElement.lang,'en');page.click();assert.equal(page.context.document.documentElement.lang,'zh-CN');
});
test('all current application documents and static showcase declare English metadata',async()=>{
 for(const name of ['index','charts','market-brief','option-structure','options-monitor','quote-reviews']){const html=await readFile(new URL('../web/'+name+'.html',import.meta.url),'utf8');assert.match(html,/<html lang="en"/);assert(!/[\u4e00-\u9fff]/.test(html.match(/<title>([^<]+)<\/title>/)?.[1]||''));}
 const home=await readFile(new URL('../site/index.html',import.meta.url),'utf8');assert.match(home,/<html lang="en"/);assert.match(home,/See options activity/);assert.match(home,/blob\/main\/README\.md/);assert.match(home,/blob\/main\/docs\/PRODUCT_SPEC\.en\.md/);
});
test('static library English titles and Chinese text both support reversible translation',async()=>{
 const source=(await readFile(new URL('../web/pages-i18n.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/,'');let language='en',event;
 const nodes=['Chart library · PCR Watch','图表目录'].map(nodeValue=>({nodeValue,parentElement:{closest:()=>null}}));let index=-1;const document={documentElement:{},createTreeWalker:()=>({nextNode(){index++;this.currentNode=nodes[index];return index<nodes.length;}}),getElementById:()=>null,querySelector:()=>null};
 vm.runInNewContext(source,{getLanguage:()=>language,setLanguage:next=>{language=next;},renderLanguageSwitch(){},bindLanguageSwitch(){},document,NodeFilter:{SHOW_TEXT:4},window:{addEventListener(type,fn){event=fn;}}});
 assert.deepEqual(nodes.map(node=>node.nodeValue),['Chart library · PCR Watch','Chart library']);language='zh';event();assert.deepEqual(nodes.map(node=>node.nodeValue),['图表目录 · PCR 观察台','图表目录']);
});
