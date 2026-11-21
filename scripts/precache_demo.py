"""
Pre-cache 3 clear Sentinel-2 scans for the Kizuna demo path.

Requires Nest (:3000) + Python scan (:8766) + Mongo running.
Usage:
  python scripts/precache_demo.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

API = "http://127.0.0.1:3000"
OUT = Path(__file__).resolve().parents[1] / "demo_cache"
# Fixed Ariana demo field (same as browser check)
BOUNDARY = {
    "type": "Polygon",
    "coordinates": [
        [
            [10.180829, 36.900652],
            [10.180829, 36.901347],
            [10.182009, 36.901347],
            [10.182009, 36.900652],
            [10.180829, 36.900652],
        ]
    ],
}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    health = requests.get(f"{API}/health", timeout=10)
    health.raise_for_status()
    body = health.json()
    if not body.get("ok") or not (body.get("python") or {}).get("ok"):
        print("Nest/Python unhealthy:", body)
        return 1

    print("Creating demo site…")
    site = requests.post(
        f"{API}/sites",
        json={"name": "Kizuna demo field", "boundary": BOUNDARY},
        timeout=30,
    ).json()
    if "_id" not in site:
        print("Create site failed:", site)
        return 1
    site_id = site["_id"]
    print("  site", site_id)

    observations = []
    for i, older in enumerate([False, True, True]):
        label = "latest" if not older else f"older#{i}"
        print(f"Scanning {label}…")
        t0 = time.time()
        r = requests.post(
            f"{API}/sites/{site_id}/scan",
            json={"older": older},
            timeout=300,
        )
        elapsed = time.time() - t0
        if r.status_code >= 400:
            print(f"  FAIL {r.status_code}: {r.text[:400]}")
            if observations:
                break
            return 1
        obs = r.json()
        obs_id = obs.get("_id")
        print(
            f"  ok {obs.get('acquiredAt')} NDVI={obs.get('stats', {}).get('mean')} "
            f"({elapsed:.1f}s) id={obs_id}"
        )
        observations.append(
            {
                "id": obs_id,
                "acquiredAt": obs.get("acquiredAt"),
                "mean": (obs.get("stats") or {}).get("mean"),
                "cloudCover": obs.get("cloudCover"),
                "sceneId": obs.get("sceneId"),
            }
        )
        # Persist NDVI PNG for offline backup
        if obs_id:
            img = requests.get(
                f"{API}/sites/{site_id}/observations/{obs_id}/image/ndvi",
                timeout=60,
            )
            if img.status_code < 400:
                path = OUT / f"ndvi_{obs.get('acquiredAt') or obs_id}.png"
                path.write_bytes(img.content)
                print(f"  saved {path.name}")

    if len(observations) < 2:
        print("Need ≥2 observations for compare demo.")
        return 1

    # Oldest → newest for compare (list is latest-first from our loop: [latest, older1, older2])
    # Use last two chronological by date string if possible
    by_date = sorted(
        [o for o in observations if o.get("acquiredAt")],
        key=lambda o: o["acquiredAt"] or "",
    )
    a, b = by_date[0], by_date[-1]
    cmp = requests.post(
        f"{API}/sites/{site_id}/compare",
        json={"aId": a["id"], "bId": b["id"]},
        timeout=60,
    ).json()
    report_url = f"{API}/sites/{site_id}/report?a={a['id']}&b={b['id']}"

    manifest = {
        "siteId": site_id,
        "siteName": "Kizuna demo field",
        "boundary": BOUNDARY,
        "observations": observations,
        "compare": {
            "aId": a["id"],
            "bId": b["id"],
            "aDate": a.get("acquiredAt"),
            "bDate": b.get("acquiredAt"),
            "deltaMeanNdvi": cmp.get("deltaMeanNdvi"),
            "inspect": cmp.get("inspect"),
            "interpretation": cmp.get("interpretation"),
        },
        "reportUrl": report_url,
        "demoPath": [
            "Open http://localhost:5173",
            f"Or load site {site_id} history from Mongo (already scanned)",
            f"Compare {a.get('acquiredAt')} → {b.get('acquiredAt')}",
            f"Report: {report_url}",
        ],
    }
    man_path = OUT / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("\nCached", len(observations), "scenes ->", man_path)
    print("delta NDVI", cmp.get("deltaMeanNdvi"), "| inspect", (cmp.get("inspect") or {}).get("flag"))
    print("Report", report_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
