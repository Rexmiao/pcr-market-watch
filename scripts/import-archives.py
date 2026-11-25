"""Export the two completed research visuals; preserve their immutable snapshots.

Uses the installed Visualize skill's official standalone renderer. No network
access is performed by this importer. The chart module remains version pinned.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from html import escape
from html.parser import HTMLParser
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
WORKSPACE = SITE.parent
PAGES = (
    ("us-market-pcr.html", "index-trends", "三指数 PCR 与价格上下文", "SPY、QQQ、DIA 的 PCR 趋势与指数价格上下文，保留原有标的、区间和图表交互。", "pcr-dataset"),
    ("watchlist-pcr.html", "seven-watchlist", "七标的 Put / Call", "NVDA、MU、SPY、QQQ、DIA、AVGO、AMD 的成交量 PCR、历史分位和原有 OI 查询快照。", "watch-data"),
)


class Document(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.frame = None
        self.scripts = []
        self.current = None
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "iframe" and a.get("id") == "codex-visualization":
            self.frame = a.get("data-srcdoc")
        if tag == "script":
            self.current = [a, ""]

    def handle_data(self, text):
        if self.current is not None:
            self.current[1] += text

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append(self.current)
            self.current = None


def parsed(text: str) -> Document:
    doc = Document()
    doc.feed(text)
    doc.close()
    return doc


def dataset(text: str, identity: str):
    for attrs, body in parsed(text).scripts:
        if attrs.get("id") == identity:
            return json.loads(body)
    raise ValueError(f"Missing snapshot dataset: {identity}")


def skill_directory(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit.resolve()
    root = Path.home() / ".codex/plugins/cache/openai-curated-remote/visualize"
    options = list(root.glob("*/skills/visualize"))
    if not options:
        raise ValueError("Visualize skill not found; pass --skill-dir to its directory")
    return max(options, key=lambda p: tuple(int(x) for x in re.findall(r"\d+", p.parts[-3])))


def add_archive_navigation(document: str, title: str, dates: str) -> str:
    style = """<style>
.archive-banner{max-width:1200px;margin:0 auto 1rem;display:grid;gap:.6rem;font-family:system-ui,sans-serif;line-height:1.5;color:CanvasText}
.archive-banner nav{display:flex;gap:1rem;flex-wrap:wrap}.archive-banner a{color:LinkText;text-underline-offset:.2em}
.archive-banner h1{font-size:1.25rem;font-weight:600;margin:0}.archive-banner p{margin:0}
.archive-banner .archive-label{font-weight:600}.archive-banner .archive-dates{font-size:.9rem}
@media(max-width:480px){body{padding:.75rem}.archive-banner{gap:.5rem}}
</style>"""
    banner = f"""<header class="archive-banner">
<nav aria-label="历史图表导航"><a href="/">返回首页</a><a href="/charts.html">图表目录</a></nav>
<div class="archive-label">历史快照，非实时</div>
<h1>{escape(title)}</h1>
<p class="archive-dates">{escape(dates)}</p>
<p class="archive-dates">此页保留当时的数据和交互；最新数据请返回首页查看。</p>
</header>
<noscript><p>图表交互需要启用 JavaScript。</p></noscript>"""
    document = document.replace('<html lang="en"', '<html lang="zh-CN"', 1)
    document = document.replace("</head>", style + "\n</head>", 1)
    return document.replace("<body>", "<body>\n" + banner, 1)


def validate(source: str, exported: str, identity: str) -> None:
    outer = parsed(exported)
    if not exported.lower().startswith("<!doctype html>") or not outer.frame:
        raise ValueError("Official renderer did not produce a complete standalone document")
    inner = parsed(outer.frame)
    if dataset(source, identity) != dataset(outer.frame, identity):
        raise ValueError("Archive export changed original numerical data")
    if "widget-state-write" not in exported or "setWidgetState" not in outer.frame:
        raise ValueError("Standalone widget-state bridge is missing")
    if "--font-size-base" not in outer.frame or "data-theme" not in outer.frame:
        raise ValueError("Standalone runtime/theme styles are missing")
    if re.search(r"(?:(?<![A-Za-z0-9])[A-Za-z]:[\\/]|file://|/Users/|/home/)", exported):
        raise ValueError("A machine-local absolute path would be exposed")
    if any(name not in {"widgetState", "setWidgetState"} for name in re.findall(r"window\.openai\??\.([A-Za-z_$][\w$]*)", source)):
        raise ValueError("A host-only interaction needs replacement before export")
    for reference in re.findall(r'(?:document\.getElementById\(|(?:root|controlsRoot)\.querySelector\()\s*[\"\']#?([\w-]+)[\"\']', source):
        if reference not in parsed(source).ids:
            raise ValueError(f"Source script references missing DOM element: {reference}")
    node = shutil.which("node")
    if not node:
        raise ValueError("Node is required for JavaScript syntax checks")
    for attrs, body in outer.scripts + inner.scripts:
        kind = attrs.get("type", "")
        if kind in {"application/json", "application/ld+json"}:
            # The wrapper intentionally contains a bootstrap placeholder before load.
            if not body.startswith("__CODEX_"):
                json.loads(body)
            continue
        if attrs.get("src"):
            continue
        command = [node, "--check"]
        if kind == "module":
            command.append("--input-type=module")
        subprocess.run(command, input=body, text=True, capture_output=True, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", type=Path)
    parser.add_argument("--source-dir", type=Path, default=WORKSPACE / "output/us-market-pcr")
    parser.add_argument("--output-dir", type=Path, default=SITE / "web/archive")
    args = parser.parse_args()
    renderer = skill_directory(args.skill_dir) / "scripts/render.py"
    args.output_dir.mkdir(parents=True, exist_ok=True)
    items = []
    for filename, identity, title, description, dataset_id in PAGES:
        source = args.source_dir / filename
        original = source.read_bytes()
        fragment = original.decode("utf-8")
        snapshot = dataset(fragment, dataset_id)
        cutoff = snapshot.get("through") or snapshot["asof"]
        snapshots = {"pcr": cutoff}
        if identity == "index-trends":
            snapshots["prices"] = {symbol: value["priceThrough"] for symbol, value in snapshot["instruments"].items()}
            date_text = f"PCR 截至 {cutoff}；价格上下文：标普500／纳指100截至 {snapshots['prices']['SPY']}，道指截至 {snapshots['prices']['DIA']}。"
            sources = ["https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query", "https://fred.stlouisfed.org/series/SP500", "https://fred.stlouisfed.org/series/NASDAQ100", "https://fred.stlouisfed.org/series/DJIA"]
        else:
            snapshots["oiQuery"] = snapshot["queryDate"]
            snapshots["oiSettlement"] = None
            date_text = f"PCR 截至 {cutoff}；OI 查询于 {snapshot['queryDate']}，实际结算日未披露。"
            sources = ["https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query"]
            sources += sorted({value["oi"]["source"] for value in snapshot["instruments"].values() if value.get("oi", {}).get("source")})
        destination = args.output_dir / f"{identity}.html"
        result = subprocess.run([sys.executable, str(renderer), str(source.resolve()), str(destination.resolve()), "--title", title + " · 历史快照", "--force"], capture_output=True, text=True, timeout=90)
        if result.returncode:
            raise RuntimeError("Official renderer failed: " + result.stderr[-2000:])
        exported = add_archive_navigation(destination.read_text(encoding="utf-8"), title, date_text)
        validate(fragment, exported, dataset_id)
        if source.read_bytes() != original:
            raise ValueError("Original source changed during export")
        destination.write_text(exported, encoding="utf-8", newline="\n")
        items.append({"id": identity, "path": f"/archive/{identity}.html", "title": title, "description": description, "snapshotDate": cutoff, "snapshotDates": snapshots, "status": "historical", "sourceFile": filename, "sourceSha256": hashlib.sha256(original).hexdigest(), "sources": sources, "renderer": "Visualize official standalone export", "preservesOriginalData": True})
        print(f"Exported {identity}: original JSON unchanged; runtime/DOM/JavaScript checks passed")
    (args.output_dir / "catalog.json").write_text(json.dumps({"version": 1, "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
