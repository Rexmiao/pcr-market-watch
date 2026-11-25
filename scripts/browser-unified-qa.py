"""Isolated browser QA for persisted watchlists and editable groups."""
import base64
import json
import time
from pathlib import Path
import requests
import websocket

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa'
BASE='http://127.0.0.1:8768'
DEBUG='http://127.0.0.1:9228'
target=next(row for row in requests.get(DEBUG+'/json',timeout=10).json() if row.get('type')=='page')
ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=110,origin=DEBUG)
counter=0
errors=[]
checks=[]

def call(method,params=None):
    global counter
    counter+=1
    request_id=counter
    ws.send(json.dumps({'id':request_id,'method':method,'params':params or {}}))
    while True:
        value=json.loads(ws.recv())
        if value.get('method')=='Runtime.exceptionThrown':
            detail=value['params']['exceptionDetails']
            errors.append(detail.get('exception',{}).get('description') or detail.get('text','JS exception'))
        if value.get('id')==request_id:
            if value.get('error'): raise RuntimeError(value['error'])
            return value.get('result',{})

def evaluate(expression):
    value=call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
    if value.get('exceptionDetails'): raise RuntimeError(value['exceptionDetails'])
    return value.get('result',{}).get('value')

def wait(expression,timeout=45):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if evaluate(expression): return
        time.sleep(.2)
    raise AssertionError('Timed out: '+expression+'; status='+str(evaluate("document.getElementById('search-status')?.textContent")))

def check(name,condition=True):
    assert condition,name
    checks.append(name)
    print('PASS '+name,flush=True)

def click(selector):
    evaluate('document.querySelector('+json.dumps(selector)+').click()')

def change(element,value):
    evaluate('document.getElementById('+json.dumps(element)+').value='+json.dumps(value)+';document.getElementById('+json.dumps(element)+").dispatchEvent(new Event('change'))")

def input_value(element,value):
    evaluate('document.getElementById('+json.dumps(element)+').value='+json.dumps(value)+';document.getElementById('+json.dumps(element)+").dispatchEvent(new Event('input'))")

def settings(): return requests.get(BASE+'/api/watchlist-settings',timeout=20).json()

def saved(): wait("!document.getElementById('watchlist-storage').textContent.includes('Saving') && !document.getElementById('watchlist-storage').textContent.includes('正在保存') && !document.getElementById('add-symbol').textContent.includes('Loading') && !document.getElementById('add-symbol').textContent.includes('回取')")

def add(symbol):
    input_value('symbol-search',symbol)
    evaluate("document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}))")
    wait("document.getElementById('add-symbol').textContent.includes("+json.dumps(symbol)+") && !document.getElementById('add-symbol').disabled")
    click('#add-symbol')
    wait('!!document.querySelector('+json.dumps('.watchlist-chip[data-symbol="'+symbol+'"]')+')',105)
    saved()

def remove(symbol):
    click('.watchlist-remove[data-symbol="'+symbol+'"]')
    wait('!document.querySelector('+json.dumps('.watchlist-chip[data-symbol="'+symbol+'"]')+')')
    saved()

def screenshot(name):
    size=call('Page.getLayoutMetrics')['cssContentSize']
    value=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':size['width'],'height':size['height'],'scale':1}})
    (QA/name).write_bytes(base64.b64decode(value['data']))

def chart_drawn(element):
    evaluate('document.getElementById('+json.dumps(element)+").scrollIntoView({block:'center'})")
    wait("(()=>{function drawn(node){return !!node.querySelector('svg,canvas')||[...node.querySelectorAll('*')].some(el=>el.shadowRoot&&drawn(el.shadowRoot));}return drawn(document.getElementById("+json.dumps(element)+"));})()")

# Reset only this task's isolated local database through its local test endpoint.
fixture=requests.get(BASE+'/api/watchlist-settings',timeout=10).json()
if fixture.get('initialized'):
    fixture_groups=[{'id':'semi','name':'半导体'},{'id':'etf','name':'指数 ETF'},{'id':'other','name':'其他自选'}]
    fixture_symbols=['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD']
    fixture_items=[{'symbol':symbol,'category':'etf' if symbol in ['SPY','QQQ','DIA'] else 'semi'} for symbol in fixture_symbols]
    response=requests.put(BASE+'/api/watchlist-settings',json={'items':fixture_items,'groups':fixture_groups,'revision':fixture['revision']},timeout=10)
    response.raise_for_status()
passed=False
try:
    call('Runtime.enable');call('Page.enable')
    call('Storage.clearDataForOrigin',{'origin':BASE,'storageTypes':'local_storage'})
    call('Emulation.setDeviceMetricsOverride',{'width':1365,'height':1000,'deviceScaleFactor':1,'mobile':False})
    call('Page.navigate',{'url':BASE+'/'})
    wait("document.getElementById('watchlist-storage')?.textContent.includes('本地数据库') && document.querySelectorAll('.watchlist-remove').length===7 && !document.getElementById('refresh').disabled")
    first=settings()
    check('Initial seven symbols persist in the isolated SQLite database',len(first['items'])==7 and len(first['groups'])==3 and first['storage']=='local')
    check('Every default symbol has the common remove control',evaluate("[...document.querySelectorAll('.watchlist-chip')].every(chip=>chip.querySelector('.watchlist-remove'))"))
    for element in ['overview','history','cboe-history-chart']: chart_drawn(element)
    check('Main and Cboe charts render real SVG/canvas through Shadow DOM')
    evaluate('window.scrollTo(0,0)');screenshot('unified-ui-desktop-initial.png')
    click('#language-toggle')
    wait("document.documentElement.lang==='en' && document.getElementById('cboe-heading').textContent.includes('Market-wide')")
    check('English translates controls, storage status and default groups',evaluate("document.getElementById('watchlist-storage').textContent.includes('local database') && document.getElementById('category-filter').textContent.includes('Semiconductors') && !document.getElementById('add-symbol').textContent.includes('SNDK')"))

    for symbol in ['AAPL','TSLA']:
        add(symbol)
        source=requests.get(BASE+'/api/symbol?symbol='+symbol,timeout=90).json()
        selected_day=evaluate("document.getElementById('daily-date').textContent")
        row=next(row for row in source['instrument']['rows'] if row['date']==selected_day)
        check('Generic Add loads real OCC history for '+symbol,evaluate("document.getElementById('symbol').value") == symbol and evaluate("document.getElementById('daily-date').textContent")==row['date'])
        check(symbol+' daily PCR agrees with the dated source',abs(float(evaluate("document.getElementById('daily-value').textContent"))-row['p']/row['c'])<.0051)
    for symbol in ['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD']:
        remove(symbol)
        assert not any(item['symbol']==symbol for item in settings()['items'])
        add(symbol)
        assert any(item['symbol']==symbol for item in settings()['items'])
    check('All seven default symbols can be removed and re-added through the same actions')

    input_value('group-name','QA 科技观察')
    evaluate("document.getElementById('group-form').dispatchEvent(new Event('submit',{cancelable:true}))")
    wait("[...document.getElementById('category-filter').options].some(option=>option.textContent==='QA 科技观察')")
    saved();group=next(group for group in settings()['groups'] if group['name']=='QA 科技观察')
    click('.watchlist-chip[data-symbol="AAPL"] .watchlist-select')
    change('category-editor',group['id']);saved()
    change('category-filter',group['id'])
    wait("document.getElementById('symbol').value==='AAPL'")
    check('Custom group assignment is stored in SQLite',next(item for item in settings()['items'] if item['symbol']=='AAPL')['category']==group['id'])
    click('#delete-group');saved()
    wait("![...document.getElementById('category-filter').options].some(option=>option.value==="+json.dumps(group['id'])+")")
    check('Deleting a custom group retains its stock as Unassigned',next(item for item in settings()['items'] if item['symbol']=='AAPL')['category'] is None)
    before=len(settings()['items']);change('category-filter','semi');click('#delete-group');saved()
    wait("![...document.getElementById('category-filter').options].some(option=>option.value==='semi')")
    after=settings()
    check('Default Semiconductor group is deletable without deleting stocks',len(after['items'])==before and all(item['category'] is None for item in after['items'] if item['symbol'] in ['NVDA','MU','AVGO','AMD']))
    for group in list(settings()['groups']): change('category-filter',group['id']);click('#delete-group');saved()
    check('All groups can be removed while symbols remain',settings()['groups']==[] and len(settings()['items'])==before)
    call('Page.reload',{'ignoreCache':True})
    wait("document.getElementById('watchlist-storage')?.textContent.includes('local database') && document.querySelectorAll('.watchlist-chip').length===9")
    check('Empty group list stays empty after reload',settings()['groups']==[] and len(evaluate("[...document.getElementById('category-filter').options].map(option=>option.value)"))==2)

    for item in list(settings()['items']): remove(item['symbol'])
    check('Removing the final symbol produces a usable empty state',settings()['items']==[] and evaluate("document.getElementById('overview').hidden && document.querySelector('section[aria-labelledby=\"history-heading\"]').hidden"))
    call('Page.reload',{'ignoreCache':True})
    wait("document.getElementById('watchlist-storage')?.textContent.includes('local database') && !document.getElementById('refresh').disabled")
    check('Page reload does not resurrect defaults in an empty watchlist',settings()['items']==[] and evaluate("document.querySelectorAll('.watchlist-chip').length===0"))
    click('#refresh')
    wait("!document.getElementById('refresh').disabled",105)
    check('Market-data refresh does not resurrect an empty watchlist',settings()['items']==[] and settings()['groups']==[] and evaluate("document.querySelectorAll('.watchlist-chip').length===0"))
    add('AAPL');add('NVDA')
    check('Common Add works after all symbols and groups were removed',all(item['category'] is None for item in settings()['items']) and settings()['groups']==[])

    for metric in ['index','total','etp']:
        change('cboe-metric',metric);chart_drawn('cboe-history-chart')
        config=evaluate("document.getElementById('cboe-history-chart').firstElementChild.config")
        check('Cboe '+metric+' retains daily/20/60 curves',len(set(row[1] for row in config['rows']))==3)
    change('cboe-metric','index')
    click('#language-toggle')
    wait("document.documentElement.lang==='zh-CN' && document.getElementById('cboe-heading').textContent.includes('整体市场')")
    chart_drawn('overview');chart_drawn('history');chart_drawn('cboe-history-chart')
    evaluate('window.scrollTo(0,0)');screenshot('unified-ui-desktop-final.png')
    call('Emulation.setDeviceMetricsOverride',{'width':390,'height':900,'deviceScaleFactor':1,'mobile':True})
    for element in ['overview','history','cboe-history-chart']: chart_drawn(element)
    check('390px mobile layout has no horizontal overflow',evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    evaluate('window.scrollTo(0,0)');screenshot('unified-ui-mobile.png')
    check('No unhandled JavaScript exceptions occurred',not errors)
    passed=True
finally:
    if not passed:
        try:screenshot('unified-ui-failure.png')
        except Exception:pass
    result={'passed':passed,'checks':checks,'errors':errors,'finalSettings':settings(),'url':BASE}
    (QA/'unified-browser-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False),flush=True)
    ws.close()
