"""Verify four Cboe categories and independent OCC ETF references in one chart."""
import base64,json,time
from pathlib import Path
import requests,websocket
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa';BASE='http://127.0.0.1:8769';DEBUG='http://127.0.0.1:9229'
target=next(row for row in requests.get(DEBUG+'/json').json() if row.get('type')=='page' and row.get('url','').startswith(BASE));ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=90,origin=DEBUG)
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
def wait(code,timeout=40):
 until=time.monotonic()+timeout
 while time.monotonic()<until:
  if evaluate(code):return
  time.sleep(.2)
 raise AssertionError('Timed out: '+code)
def change(id,value):evaluate('document.getElementById('+json.dumps(id)+').value='+json.dumps(value)+';document.getElementById('+json.dumps(id)+").dispatchEvent(new Event('change'))")
def check(name,value=True):
 assert value,name;checks.append(name);print('PASS '+name,flush=True)
def chart():return evaluate("document.getElementById('cboe-history-chart').firstElementChild?.config||null")
def screenshot(name,full=True,width=1365):
 params={'format':'png'}
 if full:params.update({'captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':width,'height':call('Page.getLayoutMetrics')['cssContentSize']['height'],'scale':1}})
 (QA/name).write_bytes(base64.b64decode(call('Page.captureScreenshot',params)['data']))
def drawn():
 evaluate("document.getElementById('cboe-history-chart').scrollIntoView({block:'center'})")
 wait("(()=>{function all(root){return [...root.querySelectorAll('*')].flatMap(el=>[el,...(el.shadowRoot?all(el.shadowRoot):[])]);}const host=document.getElementById('cboe-history-chart'),rect=host.getBoundingClientRect();return all(host).some(el=>el.matches('svg,canvas')&&el.getBoundingClientRect().width<=rect.width+1);})()")

passed=False
try:
 call('Runtime.enable');call('Page.enable');call('Emulation.setDeviceMetricsOverride',{'width':1365,'height':1000,'screenWidth':1365,'screenHeight':1000,'deviceScaleFactor':1,'mobile':False});call('Page.reload',{'ignoreCache':True})
 wait("document.getElementById('cboe-metric')?.options.length===7 && /database|数据库/.test(document.getElementById('watchlist-storage')?.textContent||'')")
 if evaluate("document.documentElement.lang!=='en'"):evaluate("document.getElementById('language-toggle').click()")
 check('One grouped picker contains four Cboe categories and three ETF references',evaluate("document.querySelectorAll('#cboe-metric optgroup').length===2 && document.querySelectorAll('#cboe-panel .cboe-card').length===4"))
 change('cboe-date','2026-11-23')
 expected=requests.get(BASE+'/api/cboe/history?end=2026-11-23&range=252',timeout=20).json()['rows'][-1]
 for metric in ['index','total','etp','equity']:
  change('cboe-metric',metric);wait("!document.getElementById('cboe-history-status').textContent.includes('Loading') && document.getElementById('cboe-history-anchor').textContent.includes('2026-11-23')");drawn();config=chart()
  check('Cboe '+metric+' uses the shared daily/20/60 chart',config['title'].startswith('Cboe ') and len(set(row[1] for row in config['rows']))==3)
  check('Cboe '+metric+' matches the verified aggregate endpoint',abs(float(evaluate("document.getElementById('cboe-history-p20').textContent"))-expected[metric]['r20'])<.0051)
 check('TOTAL explains count aggregation instead of averaging ratios',evaluate("document.getElementById('cboe-total-detail').textContent.includes('not the average')"))
 snapshot=requests.get(BASE+'/api/cboe?date=2026-11-23',timeout=20).json()['snapshot']
 check('Derived EQUITY is explicitly labeled',not snapshot['metrics']['equity'].get('derived') or evaluate("document.getElementById('cboe-equity-detail').textContent.includes('Derived')"))
 core=requests.get(BASE+'/api/watchlist',timeout=20).json()
 for metric in ['spy','qqq','dia']:
  change('cboe-metric',metric);change('cboe-date','2026-11-24');wait("document.getElementById('cboe-active-source').textContent.startsWith('OCC') && !document.getElementById('cboe-history-status').textContent.includes('Checking')");drawn();config=chart();row=next(row for row in core['instruments'][metric.upper()]['rows'] if row['date']=='2026-11-24')
  check(metric.upper()+' is an OCC ETF reference, not direct index PCR',config['title'].startswith('OCC ') and 'ETF PCR' in config['title'] and evaluate("document.getElementById('cboe-source').href.includes('theocc.com')"))
  check(metric.upper()+' daily and rolling values match OCC independently',abs(float(evaluate("document.getElementById('cboe-history-daily').textContent"))-row['p']/row['c'])<.0051 and abs(float(evaluate("document.getElementById('cboe-history-p60').textContent"))-row['r60'])<.0051)
 change('cboe-range','126');check('ETF half-year range uses 126 recorded sessions',len(chart()['rows'])==126*3)
 change('cboe-range','all');check('ETF All uses its full independent history',len(chart()['rows'])==len(core['instruments']['DIA']['rows'])*3)
 change('cboe-date','2026-11-13');check('ETF historical date excludes future data',max(row[0] for row in chart()['rows'])=='2026-11-13')
 previous=chart()['rows'];evaluate("window.__qaFetch=window.fetch;window.fetch=(input,options)=>String(input)==='/api/watchlist'?Promise.resolve(new Response('{}',{status:503})):window.__qaFetch(input,options);window.dispatchEvent(new CustomEvent('pcr-data-refresh',{detail:{alreadyRefreshed:true}}))")
 wait("document.getElementById('cboe-history-status').textContent.includes('unavailable')")
 check('Failed OCC load retains previous ETF data without borrowing Cboe dates',chart()['rows']==previous and evaluate("document.getElementById('cboe-active-source').textContent.startsWith('OCC')"));evaluate('window.fetch=window.__qaFetch;delete window.__qaFetch')
 settings=requests.get(BASE+'/api/watchlist-settings').json();response=requests.put(BASE+'/api/watchlist-settings',json={'items':[],'groups':settings['groups'],'revision':settings['revision']},timeout=10);response.raise_for_status();call('Page.reload',{'ignoreCache':True})
 wait("document.getElementById('watchlist-storage')?.textContent.includes('local database') && document.querySelectorAll('.watchlist-chip').length===0")
 for metric in ['spy','qqq','dia']:
  change('cboe-metric',metric);drawn();check(metric.upper()+' remains available when personal membership is empty',len(chart()['rows'])>0)
 wait("document.querySelectorAll('#market-quotes .market-price').length===5 && [...document.querySelectorAll('#market-quotes .market-price')].every(node=>/[0-9]/.test(node.textContent))",40)
 check('All five market quotes show dated provider observations',evaluate("[...document.querySelectorAll('#market-quotes .market-card')].every(node=>node.querySelector('small').textContent.includes('ET'))"))
 evaluate('window.scrollTo(0,1300)');rect=evaluate("document.getElementById('market-overview').getBoundingClientRect().toJSON()")
 check('Desktop floating market strip stays inside the viewport',0<=rect['top']<=10 and rect['bottom']<1000)
 evaluate("document.getElementById('market-pin').click()")
 check('Market strip can be unpinned',evaluate("!document.getElementById('market-overview').classList.contains('is-floating')"));evaluate("document.getElementById('market-pin').click()")
 check('English source footer distinguishes OCC and Cboe',evaluate("document.getElementById('data-sources-title').textContent==='Data sources and definitions' && document.getElementById('data-source-list').textContent.includes('OCC') && document.getElementById('data-source-list').textContent.includes('Cboe')"))
 evaluate("document.getElementById('language-toggle').click()")
 check('Chinese names, source footer and proxy explanation translate',evaluate("document.getElementById('cboe-heading').textContent.includes('分类与指数参考') && document.getElementById('data-sources-title').textContent.includes('数据来源') && document.getElementById('cboe-history-method').textContent.includes('SPX')"))
 evaluate('window.scrollTo(0,0)');drawn();evaluate('window.scrollTo(0,0)');screenshot('market-pcr-desktop.png')
 call('Emulation.setDeviceMetricsOverride',{'width':390,'height':900,'screenWidth':390,'screenHeight':900,'deviceScaleFactor':1,'mobile':True});drawn();wait('innerWidth===390');evaluate('window.scrollTo(0,1300)');rect=evaluate("document.getElementById('market-overview').getBoundingClientRect().toJSON()")
 check('Mobile floating strip stays inside the viewport without body overflow',rect['top']>=0 and rect['bottom']<900 and evaluate('document.documentElement.scrollWidth<=390'))
 screenshot('market-pcr-mobile-sticky.png',False);evaluate('window.scrollTo(0,0)');time.sleep(.2);screenshot('market-pcr-mobile.png',True,390)
 check('No unhandled JavaScript exceptions occurred',not errors);passed=True
finally:
 if not passed:
  try:screenshot('market-pcr-failure.png',False)
  except Exception:pass
 result={'passed':passed,'checks':checks,'errors':errors};(QA/'market-pcr-browser-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True);ws.close()
