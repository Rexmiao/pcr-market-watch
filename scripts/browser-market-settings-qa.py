"""Critical integration checks for the independent, editable market-PCR list."""
import base64,json,time
from pathlib import Path
import requests,websocket
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa';BASE='http://127.0.0.1:8769';DEBUG='http://127.0.0.1:9229'
target=next(row for row in requests.get(DEBUG+'/json').json() if row.get('type')=='page')
ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=90,origin=DEBUG)
counter=0;checks=[];errors=[]
def call(method,params=None):
 global counter
 counter+=1;ident=counter;ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
 while True:
  result=json.loads(ws.recv())
  if result.get('method')=='Runtime.exceptionThrown':errors.append(result['params']['exceptionDetails'].get('exception',{}).get('description') or result['params']['exceptionDetails'].get('text'))
  if result.get('id')==ident:
   if result.get('error'):raise RuntimeError(result['error'])
   return result.get('result',{})
def evaluate(code):
 result=call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
 if result.get('exceptionDetails'):raise RuntimeError(result['exceptionDetails'])
 return result.get('result',{}).get('value')
def wait(code,timeout=35):
 until=time.monotonic()+timeout
 while time.monotonic()<until:
  if evaluate(code):return
  time.sleep(.15)
 raise AssertionError('Timed out: '+code)
def change(id,value):evaluate('document.getElementById('+json.dumps(id)+').value='+json.dumps(value)+';document.getElementById('+json.dumps(id)+").dispatchEvent(new Event('change'))")
def click(id):evaluate('document.getElementById('+json.dumps(id)+').click()')
def check(name,value=True):
 assert value,name;checks.append(name);print('PASS '+name,flush=True)
def settings():return requests.get(BASE+'/api/market-pcr-settings',timeout=10).json()
def names():return evaluate("[...document.getElementById('cboe-metric').options].map(option=>option.value)")
def chart():return evaluate("document.getElementById('cboe-history-chart').firstElementChild?.config||null")
def drawn():
 evaluate("document.getElementById('cboe-history-chart').scrollIntoView({block:'center'})")
 wait("document.getElementById('cboe-history-chart').firstElementChild?.config?.rows?.length>0")
def add(symbol):
 evaluate("document.getElementById('market-symbol-input').value="+json.dumps(symbol)+";document.getElementById('market-symbol-input').dispatchEvent(new Event('input'))")
 click('market-add-symbol');wait("[...document.getElementById('cboe-metric').options].some(option=>option.value==="+json.dumps('symbol:'+symbol.upper())+") && !document.getElementById('market-symbol-input').disabled",70)
def screenshot(name,width=1365):
 params={'format':'png','captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':width,'height':call('Page.getLayoutMetrics')['cssContentSize']['height'],'scale':1}}
 (QA/name).write_bytes(base64.b64decode(call('Page.captureScreenshot',params)['data']))
passed=False
try:
 call('Runtime.enable');call('Page.enable');call('Page.addScriptToEvaluateOnNewDocument',{'source':"window.__qaRealFetch=window.fetch;window.fetch=(input,options)=>window.__qaFailMarketSaves&&String(input)==='/api/market-pcr-settings'&&options?.method==='PUT'?Promise.resolve(new Response('{}',{status:503})):window.__qaRealFetch(input,options)"});call('Emulation.setDeviceMetricsOverride',{'width':1365,'height':1000,'deviceScaleFactor':1,'mobile':False});call('Page.navigate',{'url':BASE})
 wait("document.getElementById('cboe-metric')?.options.length===7 && /database|数据库/.test(document.getElementById('watchlist-storage')?.textContent||'')")
 initial=settings();personal=requests.get(BASE+'/api/watchlist-settings',timeout=10).json()
 check('Uninitialized market settings save the seven recommended references once',len(initial['items'])==7 and initial['revision']==1)
 call('Page.reload',{'ignoreCache':True});wait("document.getElementById('cboe-metric')?.options.length===7")
 check('Reload does not repeat default initialization',settings()['revision']==initial['revision'])
 evaluate("document.getElementById('market-pcr-manager').open=true")
 if evaluate("document.documentElement.lang!=='en'"):click('language-toggle')
 add('iwm');drawn();expected=requests.get(BASE+'/api/symbol?symbol=IWM',timeout=15).json()['instrument']['rows'][-1]
 check('Arbitrary IWM adds beyond seven with an independent OCC chart',len(names())==8 and chart()['title'].startswith('OCC IWM') and abs(float(evaluate("document.getElementById('cboe-history-daily').textContent"))-expected['p']/expected['c'])<.0051)
 add('GLD');drawn();expected=requests.get(BASE+'/api/symbol?symbol=GLD',timeout=15).json()['instrument']['rows'][-1]
 check('GLD adds as ninth reference and keeps IWM available',len(names())==9 and 'symbol:IWM' in names() and chart()['title'].startswith('OCC GLD') and abs(float(evaluate("document.getElementById('cboe-history-p20').textContent"))-expected['r20'])<.0051)
 check('OCC rolling explanation describes recorded sessions, not strict Cboe coverage',evaluate("document.getElementById('cboe-history-method').textContent.includes('recorded activity sessions')"))
 evaluate("document.querySelector('[data-remove-entry=\"cboe:index\"]').click()")
 wait("!document.querySelector('#cboe-metric option[value=\"cboe:index\"]')")
 check('Default Cboe category is removable and its card is hidden',evaluate("document.getElementById('cboe-index-card').hidden"))
 change('market-add-cboe','index');click('market-add-cboe-button');wait("!!document.querySelector('#cboe-metric option[value=\"cboe:index\"]')")
 check('Removed category can be added again',not evaluate("document.getElementById('cboe-index-card').hidden"))
 # Fail a save, without modifying either actual database document.
 before=settings();evaluate('window.__qaFailMarketSaves=true')
 evaluate("document.querySelector('[data-remove-entry=\"symbol:GLD\"]').click()")
 wait("document.getElementById('market-pcr-settings-status').textContent.includes('Saving failed')")
 check('Failed save retains the selected reference and previous database list','symbol:GLD' in names() and settings()['items']==before['items'])
 evaluate('window.__qaFailMarketSaves=false')
 check('Market edits do not change the personal watchlist document',requests.get(BASE+'/api/watchlist-settings',timeout=10).json()==personal)
 # Remove every entry through the UI; no direct DB mutations.
 for _ in range(9):
  count=len(names());evaluate("document.querySelector('#market-pcr-items [data-remove-entry]').click()")
  wait("document.getElementById('cboe-metric').options.length==="+str(count-1)+" && !document.getElementById('market-pcr-settings-status').textContent.includes('Saving market')")
 check('Removing the final reference produces a safe manageable empty state',settings()['items']==[] and evaluate("!document.getElementById('market-pcr-empty').hidden && document.getElementById('cboe-trend').hidden && document.getElementById('cboe-card-grid').hidden"))
 empty_revision=settings()['revision'];call('Page.reload',{'ignoreCache':True});wait("document.getElementById('market-pcr-settings-status')?.textContent.includes('saved in')")
 check('Reload preserves an empty list without bringing back defaults',names()==[] and settings()['revision']==empty_revision)
 evaluate("document.getElementById('market-pcr-manager').open=true");add('IWM');drawn()
 check('A symbol can be added from a completely empty market list',names()==['symbol:IWM'])
 change('market-add-cboe','total');click('market-add-cboe-button');wait("document.getElementById('cboe-metric').options.length===2")
 check('A category can be re-added after all default entries were deleted',names()==['cboe:total','symbol:IWM'])
 check('English market manager labels translate',evaluate("document.getElementById('market-pcr-manager-title').textContent==='Manage market references'"))
 change('cboe-metric','symbol:IWM')
 click('language-toggle');check('Chinese market manager and OCC source explanation translate',evaluate("document.getElementById('market-pcr-manager-title').textContent==='管理市场参考' && document.getElementById('cboe-history-method').textContent.includes('有记录交易日')"))
 drawn();evaluate('window.scrollTo(0,0)');screenshot('market-settings-desktop.png')
 call('Emulation.setDeviceMetricsOverride',{'width':390,'height':900,'deviceScaleFactor':1,'mobile':True});drawn();wait('innerWidth===390');time.sleep(.3)
 check('Mobile module, management fields and chart stay within the viewport',evaluate('document.documentElement.scrollWidth<=390 && document.getElementById("cboe-panel").getBoundingClientRect().right<=390'))
 evaluate('window.scrollTo(0,0)');screenshot('market-settings-mobile.png',390)
 check('No unhandled JavaScript exceptions occurred',not errors);passed=True
finally:
 if not passed:
  try:screenshot('market-settings-failure.png')
  except Exception:pass
 result={'passed':passed,'checks':checks,'errors':errors};(QA/'market-settings-browser-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True);ws.close()
