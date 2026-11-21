# AquaSentinel — 48h Hackathon Build Plan

**Goal:** one field, end-to-end, judge-ready.  
Site → imagery → NDVI → stats → before/after → short explanation.

------------------------------------------------------------------------

## Day 0 (before start) — 1–2h

- Pick **one real field** (GeoJSON ready) and **2–3 clear dates** (low cloud).
- Confirm GEE access + Sentinel-2 NDVI pipeline that already worked.
- Freeze stack: **web map UI + Nest/FastAPI + Python/GEE jobs** (skip Flutter unless someone is already fluent).
- Decide roles:
  - **A** — data / GEE
  - **B** — API / jobs
  - **C** — frontend / map
  - **D** — pitch / demo data

------------------------------------------------------------------------

## Hours 0–8 — Vertical slice (must ship) ✅ DONE

| Track    | Deliverable                                                              |
| -------- | ------------------------------------------------------------------------ |
| Data     | Fetch scenes for the fixed site; cloud filter; store scene date, source, cloud % |
| Analysis | NDVI raster + mean/min/max + valid-pixel %                               |
| API      | `POST /sites`, `POST /sites/:id/scan`, `GET /sites/:id/observations`     |
| UI       | Draw polygon → map with boundary + NDVI overlay + numbers                |

**Exit criteria:** create site → run job → see NDVI + metadata on map.  
No AI, no Pi, no enhancement.

------------------------------------------------------------------------

## Hours 8–16 — Monitoring story ✅ DONE

- [x] List observations by date; load onto map
- [x] **Scan older** for a second clear scene (real multi-date)
- [x] Side-by-side compare (true color + NDVI thumbs)
- [x] **Δ mean NDVI** + coverage-too-low warning
- [x] Provenance on observation panel (sensor, date, cloud, original vs derived)
- [x] One-page **HTML report** (`GET /sites/:id/report?a=&b=`)

**Exit criteria:** demo script works without live coding: “here’s change between date A and B.” ✅

**Demo path:** Save site → Scan latest → Scan older → Compare → Open HTML report.

------------------------------------------------------------------------

## Hours 16–24 — Polish + light “AI” ✅ DONE

- [x] **Anomaly = rule first:** NDVI drop ≥ 0.08 vs earlier clear scene → flag “inspect” + evidence list
- [x] Plain-language blurb from **structured facts only** (stats + dates + cloud), labeled “generated interpretation”
- [x] UX: NDVI legend + units; empty history; clearer “no clear scene” errors
- [x] Soften NDVI wash on Esri (keep alignment)
- [x] Pre-cache 3 runs (`scripts/precache_demo.py` → Mongo + `demo_cache/` + UI **Load demo**)

**Exit criteria:** flag + evidence + plain-language blurb; demo survives offline-ish. ✅

**Demo (cached):** Dashboard → **Open Kizuna demo** → Analysis → Compare / Report. Re-seed: `python scripts/precache_demo.py`

**App flow:** Dashboard (sites CRUD + polygon edit) → Analysis (scan latest / older / compare / report).

------------------------------------------------------------------------

## Hours 24–32 — Stretch only if core is solid ✅ DONE

Priority order:

1. [x] Original vs **enhanced** image toggle (clear **DERIVED VISUAL** badge; sharpening only, same S2 pixels).
2. [x] Multi-site list (Recent sites — still 1–2 sites max in demo).
3. [x] Optional weather row (Open-Meteo daily rainfall next to NDVI — no drought claims).
4. [x] Pi: **skipped** for pitch (not needed).

**Stop** if any of these threaten the live demo.

------------------------------------------------------------------------

## Hours 32–40 — Demo hardening

- Fixed demo path: Site X → Oct date → Nov date → flag → report download.
- Backup: screenshots/video of the same flow.
- Kill features that aren’t on the happy path.
- One slide: problem → workflow → live → honesty (science vs AI).

------------------------------------------------------------------------

## Hours 40–48 — Pitch lock

- 3-minute script; each person has one beat.
- Success checklist (from product spec §15): site, imagery, provenance, NDVI reproducible, dates visible, report.
- Q&A prep: resolution limits, clouds, no ground truth yet, enhancement ≠ measurement.

------------------------------------------------------------------------

## Must / Should / Won’t (hackathon)

| Must                         | Should                        | Won’t (this weekend)              |
| ---------------------------- | ----------------------------- | --------------------------------- |
| Site + boundary              | Temporal compare              | Full auth / multi-tenant          |
| Sentinel-2 + cloud filter    | Basic report                  | Drought diagnosis                 |
| NDVI + field stats           | Rule-based “inspect” flag     | IoT sensors / solar power         |
| Map + provenance             | LLM explanation from facts    | Production PostGIS perfection     |
| Async job that finishes      | Enhancement toggle            | Broad land-degradation claims     |

------------------------------------------------------------------------

## Suggested milestones (clock)

```text
T+8h   Live: site → NDVI on map
T+16h  Live: two-date compare + ΔNDVI
T+24h  Live: flag + evidence + report
T+32h  Optional wow (enhance / Pi worker)
T+40h  Demo frozen
T+48h  Pitch
```

------------------------------------------------------------------------

## Strategy

Ship a **trustworthy field monitoring loop**; use AI and enhancement as garnish, not the meal.
