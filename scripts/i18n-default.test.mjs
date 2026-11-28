import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../web/i18n.js',import.meta.url),'utf8').replace(/^export\s+/gm,'');
const key='pcr-dashboard:language:v1';

function fixture({saved,storage,blocked=false,browserLanguage='zh-CN'}={}){
  const values=storage||new Map(saved===undefined?[]:[[key,saved]]),writes=[],events=[];
  const option=lang=>{const item={dataset:{lang},attrs:{},setAttribute(name,value){this.attrs[name]=value;}};item.closest=()=>item;return item;};
  const options=[option('en'),option('zh')];
  const toggle={textContent:'',dataset:{},options,querySelectorAll:()=>options,querySelector:()=>options[0],contains:item=>options.includes(item),
    addEventListener(type,handler){this[type]=handler;},setAttribute(name,value){this[name]=value;}};
  const document={documentElement:{lang:'zh-CN'},body:{dataset:{page:'fixture'}},
    querySelectorAll:()=>[],getElementById:id=>id==='language-toggle'?toggle:null};
  const context=vm.createContext({document,navigator:{language:browserLanguage,languages:[browserLanguage]},
    localStorage:{getItem(name){if(blocked)throw Error('offline storage unavailable');return values.get(name)??null;},
      setItem(name,value){if(blocked)throw Error('offline storage unavailable');writes.push([name,value]);values.set(name,value);}},
    window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    fetch(){throw Error('Language changes must not request data');}});
  vm.runInContext(source,context);
  return {context,document,toggle,values,writes,events};
}

test('a first visit defaults to English even with a Chinese browser locale',()=>{
  const f=fixture();
  assert.equal(f.context.getLanguage(),'en');
  f.context.translatePage();
  assert.equal(f.document.documentElement.lang,'en');
  assert.equal(f.context.t('search'),'Search');
  assert.deepEqual(f.toggle.options.map(item=>item.attrs['aria-pressed']),['true','false']);
  assert.deepEqual(f.writes,[]);
});

test('existing explicit Chinese and English choices are preserved',()=>{
  for(const saved of ['zh','en']){
    const f=fixture({saved,browserLanguage:saved==='zh'?'en-US':'zh-CN'});
    assert.equal(f.context.getLanguage(),saved);
    f.context.translatePage();
    assert.equal(f.document.documentElement.lang,saved==='zh'?'zh-CN':'en');
    assert.deepEqual(f.writes,[]);
  }
});

test('manual choices persist across new page loads on the existing preference key',()=>{
  const first=fixture();
  first.context.setLanguage('zh');
  assert.equal(first.document.documentElement.lang,'zh-CN');
  assert.equal(first.values.get(key),'zh');
  assert.equal(first.events[0].type,'pcr-language-change');
  assert.equal(first.events[0].detail.language,'zh');
  const next=fixture({storage:first.values});
  assert.equal(next.context.getLanguage(),'zh');
  next.context.setLanguage('en');
  assert.equal(fixture({storage:next.values}).context.getLanguage(),'en');
  assert.deepEqual([...next.values.keys()],[key]);
});

test('missing, invalid or unavailable saved preferences fall back to English',()=>{
  for(const saved of [undefined,'','auto','en-US','ZH'])assert.equal(fixture({saved}).context.getLanguage(),'en');
  const blocked=fixture({blocked:true});
  assert.equal(blocked.context.getLanguage(),'en');
  assert.doesNotThrow(()=>blocked.context.setLanguage('zh'));
  assert.equal(blocked.context.getLanguage(),'zh');
  assert.deepEqual(blocked.writes,[]);
});

test('the switch shows both languages, presses the current one and switches on click',()=>{
  const f=fixture();
  f.context.initLanguageToggle();
  const [en,zh]=f.toggle.options;
  assert.deepEqual([en.attrs['aria-pressed'],zh.attrs['aria-pressed']],['true','false']);
  f.toggle.click({target:zh});
  assert.equal(f.context.getLanguage(),'zh');
  assert.equal(f.document.documentElement.lang,'zh-CN');
  assert.deepEqual([en.attrs['aria-pressed'],zh.attrs['aria-pressed']],['false','true']);
  assert.deepEqual(f.writes,[[key,'zh']]);
  // Choosing the current language again is a no-op: no write and no change event.
  f.toggle.click({target:zh});
  assert.equal(f.writes.length,1);assert.equal(f.events.length,1);
  f.toggle.click({target:en});
  assert.equal(f.context.getLanguage(),'en');
  assert.deepEqual([en.attrs['aria-pressed'],zh.attrs['aria-pressed']],['true','false']);
});

test('invalid choices do not overwrite a saved preference',()=>{
  const f=fixture({saved:'zh'});
  f.context.setLanguage('fr');
  assert.equal(f.context.getLanguage(),'zh');
  assert.deepEqual(f.writes,[]);
});
