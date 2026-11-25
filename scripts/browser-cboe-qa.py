"""Verify Cboe daily and aggregate PCR history through the real browser UI."""
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
BASE = os.environ.get('PCR_QA_URL', 'http://127.0.0.1:8766')
target = next(row for row in requests.get('http://127.0.0.1:9225/json', timeout=10).json() if row.get('type') == 'page')
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
        value = json.loads(ws.recv())
        if value.get('method') == 'Runtime.exceptionThrown':
            errors.append(value['params']['exceptionDetails'].get('text', 'JS error'))
        if value.get('id') == request_id:
            if value.get('error'):
                raise RuntimeError(value['error'])
            return value.get('result', {})

def evaluate(expression):
    value = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if value.get('exceptionDetails'):
        raise RuntimeError(value['exceptionDetails'])
    return value.get('result', {}).get('value')

def wait(expression, timeout=35):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if evaluate(expression):
            return
        time.sleep(.2)
    raise AssertionError('Timed out: ' + expression)

def check(name, condition):
    assert condition, name
    checks.append(name)

def change(element, value):
    evaluate("document.getElementById(" + json.dumps(element) + ").value=" + json.dumps(value) + ";document.getElementById(" + json.dumps(element) + ").dispatchEvent(new Event('change'))")

def chart():
    return evaluate("document.getElementById('cboe-history-chart').firstElementChild?.config || null")

def screenshot(name):
    size = call('Page.getLayoutMetrics')['cssContentSize']
    image = call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True, 'clip': {'x': 0, 'y': 0, 'width': size['width'], 'height': size['height'], 'scale': 1}})
    (QA / name).write_bytes(base64.b64decode(image['data']))

expected = requests.get(BASE + '/api/cboe/history?end=2026-11-23&range=all', timeout=30).json()
latest = next(row for row in expected['rows'] if row['date'] == '2026-11-23')
check('Continuous official history is available', len(expected['rows']) >= 300)
call('Runtime.enable')
call('Page.enable')
call('Storage.clearDataForOrigin', {'origin': BASE, 'storageTypes': 'local_storage'})
call('Emulation.setDeviceMetricsOverride', {'width': 1365, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
call('Page.navigate', {'url': BASE + '/'})
wait("document.getElementById('cboe-history-p60')?.textContent !== '—' && document.getElementById('cboe-history-p60')?.textContent.length > 0")
evaluate("document.getElementById('cboe-history-chart').scrollIntoView({block:'center'})")
wait("document.getElementById('cboe-history-chart').firstElementChild?.config?.rows?.length > 0")
wait("(()=>{function drawn(root){return !!root.querySelector('svg,canvas')||[...root.querySelectorAll('*')].some(el=>el.shadowRoot&&drawn(el.shadowRoot));}return drawn(document.getElementById('cboe-history-chart'));})()")
for metric in ['index', 'total', 'etp']:
    change('cboe-metric', metric)
    check(metric + ' daily, 20 and 60 values match API', all(evaluate("document.getElementById('cboe-history-" + key + "').textContent") == f"{latest[metric][field]:.2f}" for key, field in [('daily','daily'),('p20','r20'),('p60','r60')]))
    config = chart()
    check(metric + ' chart has three simultaneous series', len(set(row[1] for row in config['rows'])) == 3)
    check(metric + ' selected date bounds the chart', max(row[0] for row in config['rows']) == '2026-11-23')
change('cboe-metric', 'index')
before = evaluate("document.getElementById('cboe-history-p60').textContent")
change('cboe-range', '126')
wait("document.getElementById('cboe-history-chart').firstElementChild?.config?.rows?.length === 378")
check('Visible range does not restart rolling calculation', evaluate("document.getElementById('cboe-history-p60').textContent") == before)
change('cboe-range', 'all')
wait("document.getElementById('cboe-history-chart').firstElementChild?.config?.rows?.length >= 900")
check('All saved history remains within the chart row limit', len(chart()['rows']) < 2000)
change('cboe-date', '2026-11-24')
wait("document.getElementById('cboe-status').textContent.length > 0 && document.getElementById('cboe-index-value').textContent === '—' && !document.getElementById('cboe-refresh').disabled")
check('Unpublished selected date does not borrow daily cards', evaluate("document.getElementById('cboe-total-value').textContent==='—' && document.getElementById('cboe-etp-value').textContent==='—'"))
check('History explicitly retains its earlier end date', evaluate("document.getElementById('cboe-history-date').textContent.includes('2026-11-24') && document.getElementById('cboe-history-date').textContent.includes('2026-11-23')"))
check('Unpublished date is not inserted into history', max(row[0] for row in chart()['rows']) == '2026-11-23')
change('cboe-date', '2025-08-15')
wait("document.getElementById('cboe-history-date').textContent.includes('2025-08-15')")
check('Insufficient history leaves 20 and 60 windows empty', evaluate("document.getElementById('cboe-history-p20').textContent==='—' && document.getElementById('cboe-history-p60').textContent==='—'"))
change('cboe-date', '2026-11-23')
wait("document.getElementById('cboe-history-p60').textContent !== '—'")
evaluate("document.getElementById('language-toggle').click()")
wait("document.getElementById('cboe-trend-title').textContent.includes('Daily')")
check('English legend and method translate', any('60-session' in row[1] for row in chart()['rows']) and evaluate("document.getElementById('cboe-history-method').textContent.includes('not the arithmetic mean')"))
change('cboe-metric', 'total')
call('Page.reload')
wait("document.getElementById('cboe-metric')?.value==='total' && document.getElementById('cboe-history-p60')?.textContent !== '—'")
check('Measure and language survive reload', evaluate("document.documentElement.lang==='en'"))
change('cboe-metric', 'index')
evaluate("document.getElementById('cboe-history-chart').scrollIntoView({block:'center'})")
time.sleep(.3)
screenshot('cboe-history-desktop.png')
call('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 900, 'deviceScaleFactor': 1, 'mobile': True})
time.sleep(.4)
check('Mobile Cboe history has no horizontal overflow', evaluate('document.documentElement.scrollWidth <= innerWidth'))
screenshot('cboe-history-mobile.png')
check('No uncaught JavaScript errors', not errors)
result = {'passed': True, 'checks': checks, 'errors': errors, 'sourceRows': len(expected['rows'])}
(QA / 'browser-cboe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(result, ensure_ascii=False))
ws.close()
