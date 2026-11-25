"""Wait for real chart resizing before recording device-sized screenshots."""
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
target=next(row for row in requests.get(DEBUG+'/json',timeout=10).json() if row.get('type')=='page' and row.get('url','').startswith(BASE))
ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=60,origin=DEBUG)
counter=0
def call(method,params=None):
    global counter
    counter+=1;ident=counter
    ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
    while True:
        result=json.loads(ws.recv())
        if result.get('id')==ident:
            if result.get('error'):raise RuntimeError(result['error'])
            return result.get('result',{})
def evaluate(expression):
    result=call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
    if result.get('exceptionDetails'):raise RuntimeError(result['exceptionDetails'])
    return result.get('result',{}).get('value')
def wait(expression):
    until=time.monotonic()+15
    while time.monotonic()<until:
        if evaluate(expression):return
        time.sleep(.2)
    raise AssertionError(expression)

# This is exactly the tested CSS addition in web/style.css, injected because the
# retained preview worker has already captured its previous embedded asset map.
evaluate("(()=>{let style=document.getElementById('qa-chart-containment');if(!style){style=document.createElement('style');style.id='qa-chart-containment';document.head.append(style);}style.textContent='.chart-host{max-width:100%;overflow-x:clip}';})()")
measure="""(()=>{function all(root){return [...root.querySelectorAll('*')].flatMap(el=>[el,...(el.shadowRoot?all(el.shadowRoot):[])]);}return {viewport:innerWidth,document:document.documentElement.scrollWidth,charts:['overview','history','cboe-history-chart'].map(id=>{const host=document.getElementById(id),rect=host.getBoundingClientRect();return {id,hostWidth:rect.width,hostRight:rect.right,svg:all(host).filter(el=>el.matches('svg,canvas')).map(el=>({width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))};})};})()"""
results=[]
for width,height,mobile,name in [(390,900,True,'unified-ui-mobile.png'),(1365,1000,False,'unified-ui-desktop-final.png')]:
    call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'screenWidth':width,'screenHeight':height,'deviceScaleFactor':1,'mobile':mobile})
    call('Emulation.setPageScaleFactor',{'pageScaleFactor':1})
    for element in ['overview','history','cboe-history-chart']:
        evaluate('document.getElementById('+json.dumps(element)+").scrollIntoView({block:'center'})")
        wait("(()=>{function all(root){return [...root.querySelectorAll('*')].flatMap(el=>[el,...(el.shadowRoot?all(el.shadowRoot):[])]);}const host=document.getElementById("+json.dumps(element)+"),rect=host.getBoundingClientRect(),svg=all(host).filter(el=>el.matches('svg,canvas'));return svg.length>0&&svg.every(el=>el.getBoundingClientRect().right<=rect.right+1&&el.getBoundingClientRect().width<=rect.width+1);})()")
    wait('innerWidth==='+str(width))
    measured=evaluate(measure)
    assert measured['document']<=width,measured
    evaluate('window.scrollTo(0,0)');time.sleep(.3)
    content=call('Page.getLayoutMetrics')['cssContentSize']
    image=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':width,'height':content['height'],'scale':1}})
    (QA/name).write_bytes(base64.b64decode(image['data']))
    results.append(measured)
    print(json.dumps({'passed':True,'width':width,'metrics':measured},ensure_ascii=True),flush=True)
record=json.loads((QA/'unified-browser-result.json').read_text(encoding='utf-8'))
record['checks'].append('Mobile and desktop SVG/canvas bounds fit their chart containers after responsive resizing')
record['visualQa']=results
(QA/'unified-browser-result.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
ws.close()
