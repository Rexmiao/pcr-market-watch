"""Exercise language, real symbol loading, classifications and dated data in Edge."""
import base64
import json
import os
import time
from pathlib import Path
import requests
import websocket

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa'
QA.mkdir(exist_ok=True)
BASE = os.environ.get('PCR_QA_URL', 'http://127.0.0.1:8765')
targets = requests.get('http://127.0.0.1:9225/json', timeout=10).json()
target = next(item for item in targets if item.get('type') == 'page')
ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=90, origin='http://127.0.0.1:9225')
counter = 0
errors = []
checks = []

def call(method, params=None):
    global counter
    counter += 1
    request_id = counter
    ws.send(json.dumps({'id': request_id, 'method': method, 'params': params or {}}))
    while True:
        message = json.loads(ws.recv())
        if message.get('method') == 'Runtime.exceptionThrown':
            errors.append(message['params']['exceptionDetails'].get('text', 'JS exception'))
        if message.get('id') == request_id:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message.get('result', {})

def evaluate(expression):
    result = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if result.get('exceptionDetails'):
        raise RuntimeError(result['exceptionDetails'])
    return result.get('result', {}).get('value')

def wait_for(expression, seconds=45):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if evaluate(expression):
            return
        time.sleep(.25)
    raise AssertionError('Timed out: ' + expression)

def check(name, condition):
    assert condition, name
    checks.append(name)

def date(day):
    evaluate("document.getElementById('date').value=" + json.dumps(day) + ";document.getElementById('date').dispatchEvent(new Event('change'))")

def screenshot(name):
    size = call('Page.getLayoutMetrics')['cssContentSize']
    clip = {'x': 0, 'y': 0, 'width': size['width'], 'height': size['height'], 'scale': 1}
    image = call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True, 'clip': clip})
    (QA / name).write_bytes(base64.b64decode(image['data']))

call('Runtime.enable')
call('Page.enable')
call('Storage.clearDataForOrigin', {'origin': BASE, 'storageTypes': 'local_storage'})
call('Emulation.setDeviceMetricsOverride', {'width': 1365, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
call('Page.navigate', {'url': BASE + '/'})
wait_for("document.getElementById('date') && !document.getElementById('date').disabled")
for chart in ['overview', 'history']:
    evaluate("document.getElementById(" + json.dumps(chart) + ").scrollIntoView({block:'center'})")
    wait_for("(()=>{const host=document.getElementById(" + json.dumps(chart) + ");function drawn(node){return !!node.querySelector('svg,canvas')||[...node.querySelectorAll('*')].some(el=>el.shadowRoot&&drawn(el.shadowRoot));}return drawn(host);})()")
check('Main page renders both charts', True)
evaluate('window.scrollTo(0,0)')
check('Initial source publication status is explicit', evaluate("document.getElementById('source-status').textContent.includes('2026-11-24')"))
evaluate("document.getElementById('language-toggle').click()")
check('English dashboard', evaluate("document.documentElement.lang === 'en' && document.querySelector('h1').textContent.includes('PCR')"))
wait_for("document.getElementById('cboe-heading')?.textContent.includes('Market-wide')")

evaluate("document.getElementById('symbol-search').value='SNDK';document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}))")
wait_for("document.querySelector('#search-results button') && document.getElementById('search-results').textContent.includes('SNDK')")
evaluate("document.querySelector('#search-results button').click()")
wait_for("[...document.getElementById('symbol').options].some(option=>option.value==='SNDK') && !document.getElementById('quick-sndk').disabled", 90)
check('SNDK loads real dated OCC history', evaluate("document.getElementById('symbol').value==='SNDK' && document.getElementById('daily-date').textContent==='2026-11-23' && /[0-9]/.test(document.getElementById('daily-value').textContent)"))
check('Added watchlist persists', evaluate("Object.keys(localStorage).some(key=>key.includes('watchlist') && localStorage.getItem(key).includes('SNDK'))"))
date('2025-01-02')
check('Missing symbol history is not substituted', evaluate("document.getElementById('daily-value').textContent==='—' && !document.getElementById('history-note').hidden"))
date('2026-11-13')
check('Historical date changes daily PCR', evaluate("document.getElementById('daily-date').textContent==='2026-11-13'"))
evaluate("document.getElementById('today').click()")
check('Today keeps requested and data dates distinct', evaluate("document.getElementById('date').value==='2026-11-24' && document.getElementById('date-note').textContent.includes('2026-11-23')"))
wait_for("document.getElementById('cboe-date').value==='2026-11-24' && !document.getElementById('cboe-status').hidden", 35)
check('Unpublished Cboe day stays blank', evaluate("document.getElementById('cboe-index-value').textContent==='—'"))

evaluate("document.getElementById('latest').click()")
wait_for("document.getElementById('cboe-index-value').textContent==='1.21'", 35)
check('Cboe universes stay separate', evaluate("document.getElementById('cboe-total-value').textContent==='0.94' && document.getElementById('cboe-etp-value').textContent==='1.13'"))

category_id = evaluate("document.getElementById('category-filter')?.id || document.querySelector('select[id*=category]')?.id")
assert category_id, 'Category control missing'
categories = evaluate("[...document.getElementById(" + json.dumps(category_id) + ").options].map(option=>({value:option.value,text:option.textContent}))")
semis = next(item['value'] for item in categories if 'semi' in item['text'].lower())
etfs = next(item['value'] for item in categories if 'etf' in item['text'].lower())
def category(value):
    evaluate("document.getElementById(" + json.dumps(category_id) + ").value=" + json.dumps(value) + ";document.getElementById(" + json.dumps(category_id) + ").dispatchEvent(new Event('change'))")
category(semis)
check('Semiconductor category includes SNDK', evaluate("[...document.getElementById('symbol').options].some(option=>option.value==='SNDK') && ![...document.getElementById('symbol').options].some(option=>option.value==='SPY')"))
evaluate("document.getElementById('symbol').value='SNDK';document.getElementById('symbol').dispatchEvent(new Event('change'));document.getElementById('category-editor').value='other';document.getElementById('category-editor').dispatchEvent(new Event('change'))")
check('Symbol classifications are editable and saved', evaluate("JSON.parse(localStorage.getItem('pcr-dashboard:categories:v1')).SNDK==='other'"))
category('other')
check('Edited symbol appears in its chosen category', evaluate("[...document.getElementById('symbol').options].some(option=>option.value==='SNDK')"))
call('Page.reload')
wait_for("document.getElementById('category-filter')?.value==='other' && [...document.getElementById('symbol').options].some(option=>option.value==='SNDK') && !document.getElementById('date').disabled")
check('Watchlist, language and classification survive reload', evaluate("document.documentElement.lang==='en' && document.getElementById('category-editor').value==='other'"))
evaluate("document.getElementById('category-editor').value='semi';document.getElementById('category-editor').dispatchEvent(new Event('change'))")
category(etfs)
check('ETF category excludes individual stocks', evaluate("[...document.getElementById('symbol').options].map(option=>option.value).sort().join(',')==='DIA,QQQ,SPY'"))
category('all')
evaluate("document.getElementById('language-toggle').click()")
check('Chinese language switches back', evaluate("document.documentElement.lang==='zh-CN'"))
screenshot('v5-desktop.png')

call('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 900, 'deviceScaleFactor': 1, 'mobile': True})
time.sleep(.5)
check('Mobile page has no horizontal overflow', evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
screenshot('v5-mobile.png')
evaluate("document.getElementById('language-toggle').click()")
call('Page.navigate', {'url': BASE + '/charts.html'})
wait_for("document.documentElement.lang==='en' && document.querySelector('h1')?.textContent==='Chart library'")
check('Chart library inherits language', True)
call('Page.navigate', {'url': BASE + '/market-brief.html'})
wait_for("document.documentElement.lang==='en' && document.querySelector('h1')?.textContent.includes('Intraday market brief')")
check('Saved market brief inherits language and preserves date', evaluate("document.querySelector('h1').textContent.includes('2026-11-23')"))
check('No uncaught JavaScript errors', not errors)
result = {'passed': True, 'checks': checks, 'errors': errors}
(QA / 'browser-v5-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(result, ensure_ascii=False))
ws.close()
