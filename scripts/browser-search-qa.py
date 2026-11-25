"""Real pointer and keyboard QA against an isolated local watchlist database."""
import base64,json,time
from pathlib import Path
import requests,websocket

ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa'
BASE='http://127.0.0.1:8769';DEBUG='http://127.0.0.1:9229'
target=next(row for row in requests.get(DEBUG+'/json',timeout=10).json() if row.get('type')=='page')
ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=60,origin=DEBUG)
counter=0;errors=[];checks=[]
def call(method,params=None):
    global counter
    counter+=1;ident=counter;ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
    while True:
        result=json.loads(ws.recv())
        if result.get('method')=='Runtime.exceptionThrown':errors.append(result['params']['exceptionDetails'].get('text','JS exception'))
        if result.get('id')==ident:
            if result.get('error'):raise RuntimeError(result['error'])
            return result.get('result',{})
def evaluate(expression):
    result=call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
    if result.get('exceptionDetails'):raise RuntimeError(result['exceptionDetails'])
    return result.get('result',{}).get('value')
def wait(expression,timeout=30):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if evaluate(expression):return
        time.sleep(.15)
    raise AssertionError('Timed out: '+expression)
def check(name,condition=True):
    assert condition,name;checks.append(name);print('PASS '+name,flush=True)
def key(value):
    code={'ArrowDown':40,'ArrowUp':38,'Home':36,'End':35,'Enter':13,'Escape':27,'Tab':9}[value]
    for event in ['keyDown','keyUp']:call('Input.dispatchKeyEvent',{'type':event,'key':value,'code':value,'windowsVirtualKeyCode':code})
def query(value):
    evaluate("document.getElementById('symbol-search').scrollIntoView({block:'center'});document.getElementById('symbol-search').focus();document.getElementById('symbol-search').value="+json.dumps(value)+";document.getElementById('symbol-search').dispatchEvent(new Event('input'));document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}))")
    wait("document.getElementById('symbol-search').getAttribute('aria-expanded')==='true' && document.querySelectorAll('#search-results [role=option]').length>0")
def settings():return requests.get(BASE+'/api/watchlist-settings',timeout=10).json()
def active():return evaluate("document.querySelector('#search-results [aria-selected=true]')?.dataset.symbol || null")
def screenshot(name):
    result=call('Page.captureScreenshot',{'format':'png'});(QA/name).write_bytes(base64.b64decode(result['data']))

passed=False
try:
    call('Runtime.enable');call('Page.enable');call('Storage.clearDataForOrigin',{'origin':BASE,'storageTypes':'local_storage'});call('Emulation.setDeviceMetricsOverride',{'width':1365,'height':1000,'deviceScaleFactor':1,'mobile':False})
    call('Page.navigate',{'url':BASE+'/'})
    wait("document.getElementById('watchlist-storage')?.textContent.includes('本地数据库') && !document.getElementById('search-submit').disabled")
    baseline=settings()['revision'];query('a')
    check('Combobox points to a listbox of non-interactive options',evaluate("document.getElementById('symbol-search').getAttribute('role')==='combobox' && document.getElementById('search-results').getAttribute('role')==='listbox' && !document.querySelector('#search-results button')"))
    options=evaluate("[...document.querySelectorAll('#search-results [role=option]')].map(option=>option.dataset.symbol)")
    check('New results highlight the first suggestion',active()==options[0])
    key('ArrowDown');check('ArrowDown moves the visible and ARIA highlight',active()==options[1] and evaluate("document.getElementById('symbol-search').getAttribute('aria-activedescendant')==='search-option-1'"))
    key('ArrowUp');check('ArrowUp returns to the previous suggestion',active()==options[0])
    key('ArrowUp');check('Up navigation wraps from first to last',active()==options[-1])
    key('ArrowDown');check('Down navigation wraps from last to first',active()==options[0])
    key('End');check('End highlights the last result',active()==options[-1])
    key('Home');check('Home highlights the first result',active()==options[0])
    evaluate("document.getElementById('search-option-2').scrollIntoView({block:'nearest'})")
    rect=evaluate("document.getElementById('search-option-2').getBoundingClientRect().toJSON()")
    call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':rect['left']+20,'y':rect['top']+15})
    wait("document.getElementById('symbol-search').getAttribute('aria-activedescendant')==='search-option-2'")
    check('Real mouse hover shares the keyboard highlight',active()==options[2] and evaluate("document.querySelectorAll('#search-results .is-active').length===1"))
    screenshot('search-hover-desktop.png')
    key('Home');chosen=active();before_enter=settings();already_watched=any(item['symbol']==chosen for item in before_enter['items']);key('Enter')
    wait("document.getElementById('symbol-search').value==="+json.dumps(chosen)+" && !!document.querySelector('.watchlist-chip[data-symbol=\""+chosen+"\"]') && !document.getElementById('search-submit').disabled",90)
    check('Enter adds the highlighted ticker once, or preserves an already watched ticker',settings()['revision']==before_enter['revision']+(0 if already_watched else 1) and sum(item['symbol']==chosen for item in settings()['items'])==1)
    check('Selection closes the popup and clears active-descendant',evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false' && !document.getElementById('symbol-search').hasAttribute('aria-activedescendant')"))
    key('ArrowDown');wait("document.getElementById('symbol-search').getAttribute('aria-expanded')==='true'")
    key('Escape');check('Escape closes suggestions without clearing input',evaluate("document.getElementById('symbol-search').value")==chosen and evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false'"))
    key('ArrowDown');key('Tab');check('Tab dismisses the popup and preserves normal focus movement',evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false' && document.activeElement.id==='search-submit'"))
    query('a');key('ArrowDown');before=active();evaluate("document.getElementById('language-toggle').click()")
    check('Language change preserves active symbol and translates popup',active()==before and evaluate("document.getElementById('search-results').getAttribute('aria-label')==='Symbol suggestions'"))
    evaluate("document.getElementById('symbol-search').value='AMD';document.getElementById('symbol-search').dispatchEvent(new Event('input'))")
    check('Input change immediately clears stale active descendants',evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false' && !document.getElementById('symbol-search').hasAttribute('aria-activedescendant')"))
    query('AMD');wait("document.querySelector('#search-results [role=option]').dataset.symbol==='AMD'")
    evaluate("document.querySelector('.watchlist-remove[data-symbol=AMD]').click()")
    wait("!document.querySelector('.watchlist-chip[data-symbol=AMD]')")
    check('Removing a watched ticker updates its open suggestion state',active()=='AMD' and evaluate("document.querySelector('#search-results .search-option-status').textContent==='Select' && !document.getElementById('add-symbol').disabled"))
    revision=settings()['revision'];key('Enter')
    wait("!!document.querySelector('.watchlist-chip[data-symbol=AMD]') && !document.getElementById('search-submit').disabled",90)
    check('Enter directly restores a removed ticker once',settings()['revision']==revision+1 and sum(item['symbol']=='AMD' for item in settings()['items'])==1)
    evaluate("document.getElementById('add-symbol').click()")
    wait("!!document.querySelector('.watchlist-chip[data-symbol=AMD]') && !document.getElementById('search-status').textContent.includes('Saving')")
    check('Common Add does not duplicate the ticker restored by Enter',settings()['revision']==revision+1 and sum(item['symbol']=='AMD' for item in settings()['items'])==1)
    evaluate("document.getElementById('symbol-search').focus();document.getElementById('symbol-search').value='闪迪';document.getElementById('symbol-search').dispatchEvent(new InputEvent('input',{isComposing:true,bubbles:true}))")
    time.sleep(.4);check('IME composition does not expose stale suggestions',evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false'"))
    evaluate("document.getElementById('symbol-search').dispatchEvent(new CompositionEvent('compositionend'))")
    wait("document.querySelector('#search-results [role=option]')?.dataset.symbol==='SNDK' && document.getElementById('symbol-search').getAttribute('aria-expanded')==='true'")
    before_enter=settings();already_watched=any(item['symbol']=='SNDK' for item in before_enter['items']);key('Enter')
    wait("document.getElementById('symbol-search').value==='SNDK' && !!document.querySelector('.watchlist-chip[data-symbol=SNDK]') && !document.getElementById('search-submit').disabled",90)
    check('Completed Chinese-name selection adds SNDK once on Enter',settings()['revision']==before_enter['revision']+(0 if already_watched else 1) and sum(item['symbol']=='SNDK' for item in settings()['items'])==1)
    query('a');evaluate("document.getElementById('symbol-search').value='';document.getElementById('symbol-search').dispatchEvent(new Event('input'))")
    check('Clearing the query empties and closes the listbox',evaluate("document.querySelectorAll('#search-results [role=option]').length===0 && document.getElementById('symbol-search').getAttribute('aria-expanded')==='false'"))
    query('a');evaluate("document.querySelector('h1').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))")
    check('Outside pointer interaction dismisses suggestions',evaluate("document.getElementById('symbol-search').getAttribute('aria-expanded')==='false'"))
    call('Emulation.setDeviceMetricsOverride',{'width':390,'height':900,'screenWidth':390,'screenHeight':900,'deviceScaleFactor':1,'mobile':True})
    query('a');key('ArrowDown');time.sleep(.3)
    check('Mobile suggestion popup stays within the viewport',evaluate("document.getElementById('search-results').getBoundingClientRect().right<=innerWidth && document.getElementById('search-results').scrollHeight>=document.getElementById('search-results').clientHeight"))
    screenshot('search-active-mobile.png');check('No unhandled JavaScript exceptions',not errors);passed=True
finally:
    if not passed:
        try:screenshot('search-failure.png')
        except Exception:pass
    result={'passed':passed,'checks':checks,'errors':errors}
    (QA/'search-browser-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True),flush=True);ws.close()
