"""Build a continuous Cboe daily PCR seed from individually verified official pages.

Raw HTML, payloads and coverage logs stay outside the deployable project. The
published ratios are retained alongside daily put/call volume so moving PCRs can
be computed as sum(put) / sum(call), not an average of rounded daily ratios.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import threading
import time
from pathlib import Path

import requests

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = "https://www.cboe.com/markets/us/options/market-statistics/daily"
METRICS = {
    "total": ("TOTAL PUT/CALL RATIO", "SUM OF ALL PRODUCTS"),
    "index": ("INDEX PUT/CALL RATIO", "INDEX OPTIONS"),
    "etp": ("EXCHANGE TRADED PRODUCTS PUT/CALL RATIO", "EXCHANGE TRADED PRODUCTS"),
}
LOCAL = threading.local()


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def is_session(day):
    """Regular U.S. equity-option calendar; matches the dashboard's holiday rules."""
    if day.weekday() >= 5:
        return False
    year = day.year

    def observed(value):
        return value - dt.timedelta(days=1) if value.weekday() == 5 else value + dt.timedelta(days=1) if value.weekday() == 6 else value

    def monday(month, number):
        first = dt.date(year, month, 1)
        return first + dt.timedelta(days=(-first.weekday()) % 7 + (number - 1) * 7)

    a, b, c = year % 19, year // 100, year % 100
    d, e, f = b // 4, b % 4, (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    remainder = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * remainder) // 451
    easter_value = h + remainder - 7 * m + 114
    easter = dt.date(year, easter_value // 31, easter_value % 31 + 1)
    memorial = dt.date(year, 5, 31)
    memorial -= dt.timedelta(days=memorial.weekday())
    thanksgiving_first = dt.date(year, 11, 1)
    thanksgiving = thanksgiving_first + dt.timedelta(days=(3 - thanksgiving_first.weekday()) % 7 + 21)
    new_year = dt.date(year, 1, 1)
    holidays = {new_year + dt.timedelta(days=1) if new_year.weekday() == 6 else new_year,
                monday(1, 3), monday(2, 3), easter - dt.timedelta(days=2), memorial,
                observed(dt.date(year, 7, 4)), monday(9, 1), thanksgiving, observed(dt.date(year, 12, 25))}
    if year >= 2022:
        holidays.add(observed(dt.date(year, 6, 19)))
    return day not in holidays and day.isoformat() != "2025-01-09"


def parse_page(body):
    if len(body) > 3_000_000:
        raise ValueError("Official HTML exceeds the expected size")
    chunks = []
    for match in re.finditer(r"self\.__next_f\.push\((\[.*?\])\)</script>", body, re.S):
        try:
            value = json.loads(match[1])
        except json.JSONDecodeError:
            continue
        if len(value) > 1 and isinstance(value[1], str):
            chunks.append(value[1])
    for line in "".join(chunks).splitlines():
        if '"optionsData"' not in line:
            continue
        try:
            value = json.loads(line.split(":", 1)[1])
            data = value[3]["data"]
        except (json.JSONDecodeError, KeyError, TypeError, IndexError):
            continue
        if isinstance(data, dict) and "optionsData" in data:
            return data
    raise ValueError("Official daily statistics payload was not found")


def normalize(data, requested_day):
    if data.get("selectedDate") != requested_day:
        raise ValueError(f"Requested {requested_day}; source returned {data.get('selectedDate')}")
    if not data.get("optionsData"):
        raise ValueError(f"Statistics not published for {requested_day}")
    published = data["optionsData"]
    ratios = {row["name"]: row["value"] for row in published["ratios"]}
    metrics = {}
    for key, (name, group) in METRICS.items():
        raw_ratio = ratios.get(name)
        if not isinstance(raw_ratio, str) or not re.fullmatch(r"\d+(?:\.\d+)?", raw_ratio):
            raise ValueError(f"Missing or invalid official {name}")
        ratio = float(raw_ratio)
        volume = next((row for row in published.get(group, []) if row.get("name") == "VOLUME"), None)
        if not volume:
            raise ValueError(f"Missing {group} daily put/call volumes")
        put, call = volume.get("put"), volume.get("call")
        if any(type(value) is not int or not 0 <= value <= 9_007_199_254_740_991 for value in (put, call)):
            raise ValueError(f"Invalid {group} volume counts")
        if volume.get("total") != put + call:
            raise ValueError(f"{group} daily put/call do not sum to the published total")
        if call > 0 and abs(put / call - ratio) > 0.011:
            raise ValueError(f"{group} published ratio and volume disagree")
        metrics[key] = {"name": name, "ratio": ratio, "put": put, "call": call}
    return {"date": requested_day, "sourceUrl": SOURCE + "?dt=" + requested_day, "metrics": metrics}


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def session():
    if not hasattr(LOCAL, "session"):
        LOCAL.session = requests.Session()
        LOCAL.session.headers.update({"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    return LOCAL.session


def fetch_payload(day, evidence, legacy=None, force=False):
    path = evidence / f"daily-{day}.json"
    if path.exists() and not force:
        stored = json.loads(path.read_text(encoding="utf-8"))
        return normalize(stored["publishedData"], day)
    if legacy and not force:
        prior_path = legacy / f"daily-{day}.json"
        if prior_path.exists():
            prior = json.loads(prior_path.read_text(encoding="utf-8"))
            value = normalize(prior["publishedData"], day)
            write_json(path, {"requestedDate": day, "sourceUrl": value["sourceUrl"], "importedOfficialEvidence": str(prior_path), "publishedData": prior["publishedData"]})
            return value
    last_error = None
    for attempt in range(3):
        try:
            response = session().get(SOURCE + "?dt=" + day, timeout=(10, 35))
            response.raise_for_status()
            body = response.text
            data = parse_page(body)
            value = normalize(data, day)
            html = evidence / f"daily-{day}.html"
            html.write_text(body, encoding="utf-8")
            write_json(path, {"requestedDate": day, "sourceUrl": response.url, "checkedAt": utc_now(), "htmlSHA256": hashlib.sha256(body.encode("utf-8")).hexdigest(), "publishedData": data})
            return value
        except (requests.RequestException, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(str(last_error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2025-08-01")
    parser.add_argument("--end", help="Defaults to the latest activity date on the official Cboe daily page")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--evidence-dir", type=Path, default=PROJECT.parent / "cboe-history-evidence")
    parser.add_argument("--legacy-evidence", type=Path)
    parser.add_argument("--dates", nargs="*", help="Retry only specific days, retaining already verified records")
    args = parser.parse_args()
    start = dt.date.fromisoformat(args.start).isoformat()
    evidence = args.evidence_dir.resolve()
    if evidence == PROJECT or PROJECT in evidence.parents:
        raise ValueError("Evidence directory must stay outside the deployable project")
    evidence.mkdir(parents=True, exist_ok=True)
    latest_response = session().get(SOURCE, timeout=(10, 35))
    latest_response.raise_for_status()
    latest_payload = parse_page(latest_response.text)
    latest_day = latest_payload["selectedDate"]
    normalize(latest_payload, latest_day)
    end = dt.date.fromisoformat(args.end or latest_day).isoformat()
    if end > latest_day:
        raise ValueError(f"End date {end} exceeds official latest date {latest_day}")
    (evidence / "latest-official-page.html").write_text(latest_response.text, encoding="utf-8")
    write_json(evidence / "latest-official-page.json", {"sourceUrl": SOURCE, "checkedAt": utc_now(), "publishedData": latest_payload})

    # Compare the dashboard's retained SPY calendar with a regular session calendar.
    # Generate days independently, so a stale SPY seed cannot silently omit new sessions.
    ticker_seed = json.loads((PROJECT / "data/seed.json").read_text(encoding="utf-8"))
    known_sessions = {row["date"] for row in ticker_seed["instruments"]["SPY"]["rows"] if start <= row["date"] <= end}
    expected_set = set(known_sessions)
    current, last_day = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    while current <= last_day:
        if is_session(current):
            expected_set.add(current.isoformat())
        current += dt.timedelta(days=1)
    expected = sorted(expected_set)
    if not expected or expected[0] < start:
        raise ValueError("No verified session calendar in the requested range")
    selected = args.dates or expected
    if any(day not in expected for day in selected):
        raise ValueError("Retry date is outside the verified session calendar")
    values, errors = {}, []
    # Resume from evidence for all dates even when only missing days are retried.
    for day in expected:
        path = evidence / f"daily-{day}.json"
        if path.exists():
            try:
                values[day] = normalize(json.loads(path.read_text(encoding="utf-8"))["publishedData"], day)
            except (ValueError, KeyError, TypeError):
                pass
    requested = [day for day in selected if day not in values]
    print(json.dumps({"stage": "start", "calendarStart": expected[0], "calendarEnd": expected[-1], "expectedSessions": len(expected), "alreadyVerified": len(values), "requestsNeeded": len(requested), "officialLatestDate": latest_day}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        futures = {pool.submit(fetch_payload, day, evidence, args.legacy_evidence): day for day in requested}
        for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
            day = futures[future]
            try:
                values[day] = future.result()
            except Exception as error:
                errors.append({"date": day, "error": str(error)})
            if count % 25 == 0 or count == len(requested):
                progress = {"stage": "progress", "completedRequests": count, "requested": len(requested), "verified": len(values), "errors": len(errors)}
                print(json.dumps(progress), flush=True)
                write_json(evidence / "progress.json", progress)
    observations = [values[day] for day in expected if day in values]
    missing = [day for day in expected if day not in values]
    report = {"checkedAt": utc_now(), "source": SOURCE, "expectedStart": expected[0], "expectedEnd": expected[-1], "expectedSessions": len(expected), "verifiedSessions": len(observations), "continuous": not missing, "missingDates": missing, "errors": errors, "sessionCalendarSource": "Dashboard U.S. session calendar, cross-checked against OCC SPY seed activity dates"}
    write_json(evidence / "coverage-report.json", report)
    if not observations:
        raise RuntimeError("No verified official observations; existing seed was retained")
    seed = {"schemaVersion": 1, "asof": observations[-1]["date"], "checkedAt": report["checkedAt"], "sourceUrl": SOURCE, "sourceLatestDate": latest_day, "historyStartDate": expected[0], "expectedSessionDates": expected, "observations": observations, "coverage": {key: report[key] for key in ("expectedStart", "expectedEnd", "expectedSessions", "verifiedSessions", "continuous", "missingDates", "sessionCalendarSource")}, "coverageNotice": "Official daily Cboe snapshots. Rolling PCR must use daily put/call sums and remain unavailable across missing sessions."}
    write_json(PROJECT / "data/cboe-seed.json", seed)
    print(json.dumps({"stage": "complete", **report, "seedBytes": (PROJECT / "data/cboe-seed.json").stat().st_size}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
