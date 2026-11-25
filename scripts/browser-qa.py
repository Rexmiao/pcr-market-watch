"""Check the task-owned headless Edge target through its local DevTools endpoint."""
import base64
import json
import time
from pathlib import Path

import requests
import websocket

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa"
QA.mkdir(exist_ok=True)
targets = requests.get("http://127.0.0.1:9225/json", timeout=10).json()
target = next(x for x in targets if x.get("type") == "page" and (x.get("url") == "about:blank" or x.get("url", "").startswith("http://127.0.0.1:8765")))
ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=40, origin="http://127.0.0.1:9225")
counter = 0
errors = []


def call(method, params=None):
    global counter
    counter += 1
    request_id = counter
    ws.send(json.dumps({"id": request_id, "method": method, "params": params or {}}))
    while True:
        message = json.loads(ws.recv())
        if message.get("method") == "Runtime.exceptionThrown":
            errors.append(message["params"]["exceptionDetails"].get("text", "exception"))
        if message.get("id") == request_id:
            if "error" in message:
                raise RuntimeError(message["error"])
            return message.get("result", {})


def evaluate(code):
    result = call("Runtime.evaluate", {"expression": code, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in result:
        raise RuntimeError(result["exceptionDetails"])
    return result.get("result", {}).get("value")


call("Page.enable")
call("Runtime.enable")
call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 1050, "deviceScaleFactor": 1, "mobile": False})
call("Page.navigate", {"url": "http://127.0.0.1:8765/"})
deadline = time.monotonic() + 35
while time.monotonic() < deadline:
    ready = evaluate("document.getElementById('daily-value')?.textContent === '0.87' && !document.getElementById('date')?.disabled")
    if ready:
        break
    time.sleep(.2)
else:
    raise RuntimeError("App did not become ready: " + str(evaluate("({body:document.body.innerText.slice(0,1500),scripts:Array.from(document.scripts).map(s=>s.src)})")))
call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})
png = call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})["data"]
(QA / "desktop.png").write_bytes(base64.b64decode(png))
initial = evaluate("({daily:document.getElementById('daily-value').textContent, date:document.getElementById('date').value, canvases:document.querySelectorAll('canvas').length, hosts:[...document.querySelectorAll('.chart-host')].map(x=>x.innerHTML.slice(0,250))})")
evaluate("document.getElementById('date').value='2026-11-13';document.getElementById('date').dispatchEvent(new Event('change'))")
assert evaluate("document.getElementById('daily-value').textContent") == "0.76"
assert "未保存" in evaluate("document.getElementById('oi-note').textContent")
evaluate("document.getElementById('date').value='2026-11-22';document.getElementById('date').dispatchEvent(new Event('change'))")
assert "2026-11-20" in evaluate("document.getElementById('date-note').textContent")
evaluate("document.getElementById('symbol').value='AMD';document.getElementById('symbol').dispatchEvent(new Event('change'))")
assert evaluate("document.getElementById('daily-value').textContent") == "1.34"
evaluate("document.getElementById('date').value='2024-12-02';document.getElementById('date').dispatchEvent(new Event('change'))")
assert evaluate("document.getElementById('p20-value').textContent") == "样本不足"
assert evaluate("document.getElementById('p60-value').textContent") == "样本不足"
evaluate("document.getElementById('latest').click();document.getElementById('symbol').value='NVDA';document.getElementById('symbol').dispatchEvent(new Event('change'))")
call("Emulation.setDeviceMetricsOverride", {"width": 375, "height": 900, "deviceScaleFactor": 1, "mobile": True})
time.sleep(.4)
assert evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile horizontal overflow"
png = call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})["data"]
(QA / "mobile.png").write_bytes(base64.b64decode(png))
result = {"passed": True, "initial": initial, "interactions": ["historical date", "weekend fallback", "all-symbol selection", "warmup null", "latest date", "mobile width"], "errors": errors}
(QA / "browser-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
ws.close()
