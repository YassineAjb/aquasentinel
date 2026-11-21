"""Write demo_cache/manifest.json for an already-scanned site."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

API = "http://127.0.0.1:3000"
OUT = Path(__file__).resolve().parents[1] / "demo_cache"


def main(site_id: str) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    obs = requests.get(f"{API}/sites/{site_id}/observations", timeout=30).json()
    if not isinstance(obs, list) or len(obs) < 2:
        print("Need >=2 observations, got", len(obs) if isinstance(obs, list) else obs)
        return 1
    by = sorted(obs, key=lambda o: o.get("acquiredAt") or "")
    a, b = by[0], by[-1]
    cmp = requests.post(
        f"{API}/sites/{site_id}/compare",
        json={"aId": a["_id"], "bId": b["_id"]},
        timeout=60,
    ).json()
    report_url = f"{API}/sites/{site_id}/report?a={a['_id']}&b={b['_id']}"
    manifest = {
        "siteId": site_id,
        "siteName": "Kizuna demo field",
        "observations": [
            {
                "id": o["_id"],
                "acquiredAt": o.get("acquiredAt"),
                "mean": (o.get("stats") or {}).get("mean"),
                "cloudCover": o.get("cloudCover"),
                "sceneId": o.get("sceneId"),
            }
            for o in obs
        ],
        "compare": {
            "aId": a["_id"],
            "bId": b["_id"],
            "aDate": a.get("acquiredAt"),
            "bDate": b.get("acquiredAt"),
            "deltaMeanNdvi": cmp.get("deltaMeanNdvi"),
            "inspect": cmp.get("inspect"),
            "interpretation": cmp.get("interpretation"),
        },
        "reportUrl": report_url,
        "demoPath": [
            "Open http://localhost:5173",
            "History already in Mongo for Kizuna demo field",
            f"Compare {a.get('acquiredAt')} -> {b.get('acquiredAt')}",
            f"Report {report_url}",
        ],
    }
    path = OUT / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("wrote", path)
    print(
        "dates",
        a.get("acquiredAt"),
        "->",
        b.get("acquiredAt"),
        "delta",
        cmp.get("deltaMeanNdvi"),
        "inspect",
        (cmp.get("inspect") or {}).get("flag"),
    )
    return 0


if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else "6b00c10f59eef0c033c63335"
    raise SystemExit(main(sid))
