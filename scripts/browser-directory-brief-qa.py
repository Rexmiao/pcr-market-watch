"""Focused browser QA for the current chart directory and market brief."""
import base64,hashlib,json,sys,time
from pathlib import Path
import requests,websocket
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa';BASE='http://127.0.0.1:8769';DEBUG='http://127.0.0.1:9229';phase=sys.argv[1] if len(sys.argv)>1 else 'catalog'
target=next(row for row in requests.get(DEBUG+'/json').json() if row.get('type')=='page' and row.get('url','').startswith(BASE));ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=110,origin=DEBUG)
counter=0;checks=[];errors=[];network_calls=[];intercept_errors=False
def call(method,params=None):
 global counter
 counter+=1;ident=counter;ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
 while True:
  result=json.loads(ws.recv())
  if result.get('method')=='Network.requestWillBeSent':
   request=result['params']['request'];url=urlsplit(request['url']);network_calls.append({'url':url.path+('?' + url.query if url.query else ''),'method':request['method']})
  if result.get('method')=='Fetch.requestPaused':
   request=result['params']['request'];fail=intercept_errors and (request['method']=='POST' or '/api/providers/moomoo/quotes' in request['url']);counter+=1
   method='Fetch.fulfillRequest' if fail else 'Fetch.continueRequest';params={'requestId':result['params']['requestId']}
   if fail:params.update({'responseCode':503,'responseHeaders':[{'name':'content-type','value':'application/json'}],'body':base64.b64encode(b'{}').decode()})
   ws.send(json.dumps({'id':counter,'method':method,'params':params}))
  if result.get('method')=='Runtime.exceptionThrown':errors.append(result['params']['exceptionDetails'].get('exception',{}).get('description') or result['params']['exceptionDetails'].get('text'))
  if result.get('id')==ident:
   if result.get('error'):raise RuntimeError(result['error'])
   return result.get('result',{})
def evaluate(code):
 result=call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
 if result.get('exceptionDetails'):raise RuntimeError(result['exceptionDetails'])
 return result.get('result',{}).get('value')
def wait(code,timeout=100):
 until=time.monotonic()+timeout
 while time.monotonic()<until:
  if evaluate(code):return
  time.sleep(.2)
 raise AssertionError('Timed out: '+code)
def check(name,value=True):
 assert value,name;checks.append(name);print('PASS '+name,flush=True)
def language(value):
 if evaluate('document.documentElement.lang')!=('en' if value=='en' else 'zh-CN'):evaluate("document.getElementById('page-language').click()")
def rows(id):return evaluate("[...document.getElementById("+json.dumps(id)+").rows].map(row=>[...row.cells].map(cell=>cell.innerText))")
def screenshot(name,width=1365):
 evaluate('window.scrollTo(0,0)');time.sleep(.25);height=call('Page.getLayoutMetrics')['cssContentSize']['height'];image=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':width,'height':height,'scale':1}});(QA/name).write_bytes(base64.b64decode(image['data']))
def instrument_fetch(fail=False):
 global network_calls,intercept_errors
 network_calls=[];intercept_errors=fail
 if fail:call('Fetch.enable',{'patterns':[{'urlPattern':BASE+'/api/refresh*'},{'urlPattern':BASE+'/api/cboe/history/refresh*'},{'urlPattern':BASE+'/api/market/refresh*'},{'urlPattern':BASE+'/api/providers/moomoo/quotes*'}]})
def restore_fetch():
 global intercept_errors
 if intercept_errors:call('Fetch.disable')
 intercept_errors=False
 return list(network_calls)
def source_posts(calls):
 return all(any(item['method']=='POST' and item['url'].startswith(path) for item in calls) for path in ['/api/refresh','/api/cboe/history/refresh'])
def responsive(prefix):
 evaluate('window.scrollTo(0,1300)');rect=evaluate("document.getElementById('market-overview').getBoundingClientRect().toJSON()")
 check(prefix+' desktop sticky strip fits the viewport',rect['top']>=0 and rect['bottom']<1000)
 evaluate("document.getElementById('market-pin').click()");check(prefix+' sticky strip can be cancelled',evaluate("!document.getElementById('market-overview').classList.contains('is-floating')"));evaluate("document.getElementById('market-pin').click()")
 screenshot(prefix+'-desktop.png');call('Emulation.setDeviceMetricsOverride',{'width':390,'height':900,'screenWidth':390,'screenHeight':900,'deviceScaleFactor':1,'mobile':True});wait('innerWidth===390');evaluate('window.scrollTo(0,900)');rect=evaluate("document.getElementById('market-overview').getBoundingClientRect().toJSON()")
 check(prefix+' mobile sticky and table stay within viewport',rect['top']>=0 and rect['bottom']<900 and evaluate('document.documentElement.scrollWidth<=390'));screenshot(prefix+'-mobile.png',390)

passed=False
try:
 call('Runtime.enable');call('Page.enable');call('Network.enable');call('Emulation.setDeviceMetricsOverride',{'width':1365,'height':1000,'screenWidth':1365,'screenHeight':1000,'deviceScaleFactor':1,'mobile':False})
 settings=requests.get(BASE+'/api/watchlist-settings').json();semi=next((group['id'] for group in settings['groups'] if group['id']=='semi'),None);requests.put(BASE+'/api/watchlist-settings',json={'items':[{'symbol':'AMD','category':semi},{'symbol':'NVDA','category':semi}],'groups':settings['groups'],'revision':settings['revision']},timeout=15).raise_for_status()
 if phase=='catalog':
  archives={path:hashlib.sha256(requests.get(BASE+path).content).hexdigest() for path in ['/archive/seven-watchlist.html','/archive/market-brief-20261123.html']}
  call('Page.navigate',{'url':BASE+'/charts.html'});wait("document.getElementById('library-symbol-rows')?.rows.length===2 && !document.getElementById('library-refresh').disabled");language('en')
  records=rows('library-symbol-rows');check('Directory uses exactly the current two-symbol database watchlist',[row[0] for row in records]==['AMD','NVDA'])
  core=requests.get(BASE+'/api/watchlist').json();check('Directory OCC dates match each symbol source',all(row[1]==core['instruments'][row[0]]['rows'][-1]['date'] for row in records))
  check('Archive title is a saved watchlist instead of a fixed seven-symbol product',evaluate("[...document.querySelectorAll('.catalog-card h3')].some(node=>/watchlist/i.test(node.textContent)) && ![...document.querySelectorAll('.catalog-card h3')].some(node=>/seven|7.symbol/i.test(node.textContent))"))
  wait("!document.getElementById('market-refresh').disabled");instrument_fetch();evaluate("document.getElementById('library-refresh').click()");wait("!document.getElementById('library-refresh').disabled");calls=restore_fetch();check('Directory Update checks the independent OCC and Cboe sources',source_posts(calls))
  cboe=requests.get(BASE+'/api/cboe/history?range=252').json();check('Directory keeps Cboe and OCC activity dates independent',evaluate("document.getElementById('library-cboe-date').textContent").find(cboe['asof'])>=0 and rows('library-symbol-rows')[0][1]==core['instruments']['AMD']['rows'][-1]['date'])
  before=rows('library-symbol-rows');instrument_fetch(True);evaluate("document.getElementById('library-refresh').click()");wait("!document.getElementById('library-refresh').disabled");restore_fetch();after=rows('library-symbol-rows');check('Directory failure retains existing symbol dates',[row[1] for row in before]==[row[1] for row in after] and evaluate("document.getElementById('library-status').classList.contains('error')"))
  check('English directory labels are current',evaluate("document.getElementById('library-profile').textContent.includes('2 watchlist symbols') && document.getElementById('library-cboe-heading').textContent.includes('EQUITY')"));language('zh');check('Chinese directory labels translate',evaluate("document.getElementById('library-profile').textContent.includes('2 个关注标的') && document.getElementById('data-sources-title').textContent.includes('数据来源')"))
  check('Saved archive HTML remains byte-identical after updates',all(hashlib.sha256(requests.get(BASE+path).content).hexdigest()==digest for path,digest in archives.items()))
  archive=requests.get(BASE+'/archive/market-brief-20261123.html').text;check('Archived November 23 brief keeps its fixed intraday time','2026-11-23' in archive and '10:45' in archive)
  responsive('directory')
 else:
  call('Page.navigate',{'url':BASE+'/market-brief.html'});wait("document.getElementById('brief-watchlist-rows')?.rows.length===2 && !document.getElementById('brief-refresh').disabled");language('en')
  records=rows('brief-watchlist-rows');core=requests.get(BASE+'/api/watchlist').json();check('Brief reflects exactly AMD and NVDA from the database',[row[0] for row in records]==['AMD','NVDA'])
  check('Brief PCR values and their own dates agree with OCC',all(abs(float(row[1].splitlines()[0])-core['instruments'][row[0]]['rows'][-1]['daily'])<.0051 and core['instruments'][row[0]]['rows'][-1]['date'] in row[1] for row in records))
  check('Brief gives current price and four-category PCR commentary',evaluate("document.getElementById('brief-price-summary').textContent.includes('Major indexes') && document.getElementById('brief-pcr-summary').textContent.includes('EQUITY') && document.getElementById('brief-pcr-summary').textContent.includes('not a long/short')"))
  quotes=requests.get(BASE+'/api/providers/moomoo/quotes?symbols=AMD,NVDA',timeout=30).json()['data']['basic_qot_list']
  for record in records:
   quote=next(q for q in quotes if (q.get('security',{}).get('code') or q.get('code','').split('.')[-1])==record[0]);check(record[0]+' regular-session price is explicit',record[4].splitlines()[0]==f"{quote['cur_price']:.2f}" and evaluate("document.getElementById('brief-price-head').textContent.includes('regular-session')"))
   check(record[0]+' regular quote time is the source time',quote.get('update_time','') in record[5] if quote.get('update_time') else bool(record[5]))
   check(record[0]+' regular quote time matches the source',quote['update_time'] in record[5])
   for key,label in [('after_market','After-hours'),('overnight','Overnight')]:
    session=quote.get(key)
    if session and isinstance(session.get('price'),(int,float)):
     check(record[0]+' '+label+' is a separately labeled price',label in record[4] and f"{session['price']:.2f}" in record[4])
     if not session.get('update_time') and not session.get('update_timestamp'):check(record[0]+' missing session time is not inferred','No independent' in record[5])
  instrument_fetch();evaluate("document.getElementById('brief-refresh').click()");wait("!document.getElementById('brief-refresh').disabled");calls=restore_fetch();check('Brief refresh invokes source updates and moomoo quotes',source_posts(calls) and any('/api/providers/moomoo/quotes' in item['url'] for item in calls))
  before=rows('brief-watchlist-rows');instrument_fetch(True);evaluate("document.getElementById('brief-refresh').click()");wait("!document.getElementById('brief-refresh').disabled");restore_fetch();after=rows('brief-watchlist-rows');check('Brief source failures retain prior PCR, prices and quote timestamps',all(a[1:]==b[1:] for a,b in zip(before,after)) and evaluate("document.getElementById('brief-status').classList.contains('error')"))
  language('zh');check('Brief Chinese session labels and source footer translate',evaluate("document.getElementById('brief-price-head').textContent.includes('常规时段') && document.getElementById('brief-moomoo-note').textContent.length>0 && document.getElementById('data-sources-title').textContent.includes('数据来源')"));responsive('brief')
 check('No unhandled JavaScript exceptions occurred',not errors);passed=True
finally:
 if not passed:
  try:screenshot(phase+'-failure.png')
  except Exception:pass
 record_path=QA/'directory-brief-browser-result.json';record=json.loads(record_path.read_text(encoding='utf-8')) if record_path.exists() else {};record[phase]={'passed':passed,'checks':checks,'errors':errors};record_path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({phase:record[phase]},ensure_ascii=False),flush=True);ws.close()
