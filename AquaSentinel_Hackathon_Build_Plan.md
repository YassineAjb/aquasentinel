# AquaSentinel — 48h Hackathon Build Plan

**Goal:** one field, end-to-end, judge-ready.  
Site → imagery → NDVI → weather → crop profile → irrigation plan (estimate + schedule).

**App shell now:** sidebar Home / Dashboard / Sites / Analysis (collapsible + logo icon).

------------------------------------------------------------------------

## Day 0 (before start) — 1–2h ✅

- Pick **one real field** (GeoJSON ready) and **2–3 clear dates** (low cloud).
- Confirm GEE access + Sentinel-2 NDVI pipeline that already worked.
- Freeze stack: **web map UI + Nest + Python/PC jobs** (skip Flutter).
- Decide roles:
  - **A** — data / imagery
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

**Demo (cached):** Dashboard → **Load demo** → Analysis → Compare / Report. Re-seed: `python scripts/precache_demo.py`

------------------------------------------------------------------------

## Hours 24–32 — Stretch + weather foundation ✅ DONE

1. [x] Original vs **enhanced** image toggle (clear **DERIVED VISUAL** badge; sharpening only, same S2 pixels).
2. [x] Multi-site list + Sites / Dashboard / Analysis split + landing.
3. [x] **Weather fetch + cache** (Open-Meteo archive/forecast → Mongo `WeatherCache`; rain / temp / ET₀).
4. [x] Weather on Analysis panel + Dashboard cards.
5. [x] Pi: **skipped** for pitch (not needed).

**API:** `GET /sites/:id/weather?around=YYYY-MM-DD`, `POST /sites/:id/weather/refresh`  
**Source:** [Open-Meteo](https://open-meteo.com/) at site centroid — context only, not a drought claim.

------------------------------------------------------------------------

## Hours 32–40 — Main module: irrigation plan 🔄 NOW

**Module name:** Irrigation Advisor (decision support, not a pump controller).

### Inputs

| Input | Source | Owner |
| ----- | ------ | ----- |
| Satellite / NDVI analysis | Latest (or compared) observation: mean/min/max, Δ, coverage, inspect flag | System |
| Weather | Cached Open-Meteo window (precip, temp, ET₀) around scene date | System |
| Type plante | Farmer entry on site (e.g. olivier, blé, tomate) | Farmer |
| Âge plante | Farmer entry (days / stage: jeune / végétatif / mature) | Farmer |
| Type terre | Farmer entry (sableux / limoneux / argileux) | Farmer |

### Pipeline (hybrid — rules first, LLM second)

```text
Crop profile + NDVI stats + weather days
        ↓
Rule engine (FAO-style sketch)
  Kc from plant type + age stage
  ETc ≈ ET₀ × Kc
  Soil store / interval from type terre
  Stress hint from NDVI mean / Δ / inspect flag
        ↓
Structured facts JSON (numbers + assumptions)
        ↓
LLM narrates only from those facts
        ↓
UI: estimated consumption + irrigation planification
```

### Outputs

1. **Estimated consumption** — mm/day and m³ for the field over ~7 days, with assumptions listed.
2. **Irrigation planification** — suggested days / volumes; reduce/skip if rain covers need; “inspect first” if NDVI flag is on.
3. **Honesty banner** — “Generated from structured stats — not a diagnosis / not an automatic command.”

### Build checklist

- [x] Extend Site model + Sites form: `plantType`, `plantAge`, `soilType` (+ optional area already known)
- [x] `POST /sites/:id/irrigation-plan` (body: optional `observationId`)
- [x] Rule service: Kc table + ETc + soil interval + NDVI stress adjustment
- [x] LLM optional (`OPENAI_API_KEY` / `LLM_API_KEY`); else template narration from facts
- [x] Analysis UI: crop summary + **Plan irrigation** button → estimate + schedule panel
- [x] Dashboard/Sites: show crop profile completeness
- [ ] Demo seed: one site with olive/wheat profile + plan that works offline-ish (cached facts)

### Exit criteria

Farmer fills crop fields → open Analysis → Plan irrigation → see **consumption estimate + 7-day plan** grounded in NDVI + weather + profile.  
Judges can ask “where did the number come from?” → show facts JSON / assumptions.

**Stop** if this threatens the live NDVI compare demo — fall back to rules-only text without LLM.

------------------------------------------------------------------------

## Hours 40–48 — Demo hardening + pitch

- Fixed demo path: Site (crop profile) → Scan / Load demo → Weather → **Plan irrigation** → Compare → Report.
- Backup: screenshots/video of the same flow.
- Kill features that aren’t on the happy path.
- One slide: problem → workflow → live → honesty (science vs AI).
- 3-minute script; each person has one beat.
- Q&A prep: NDVI ≠ soil moisture; Open-Meteo ≠ rain gauge; enhancement ≠ measurement; plan is indicative.

------------------------------------------------------------------------

## Must / Should / Won’t (hackathon)

| Must                         | Should                              | Won’t (this weekend)              |
| ---------------------------- | ----------------------------------- | --------------------------------- |
| Site + boundary              | Temporal compare                    | Full auth / multi-tenant          |
| Sentinel-2 + cloud filter    | Basic report                        | Drought diagnosis                 |
| NDVI + field stats           | Rule-based “inspect” flag           | IoT sensors / solar power         |
| Map + provenance             | Weather cache (Open-Meteo)          | Production PostGIS perfection     |
| Crop profile (type/âge/terre)| Hybrid irrigation estimate + plan   | Autonomous irrigation controller  |
| Async job that finishes      | LLM narration from facts only       | Broad land-degradation claims     |

------------------------------------------------------------------------

## Suggested milestones (clock)

```text
T+8h   Live: site → NDVI on map
T+16h  Live: two-date compare + ΔNDVI
T+24h  Live: flag + evidence + report
T+32h  Weather cached + UI
T+40h  Irrigation Advisor (rules + optional LLM)
T+48h  Demo frozen + pitch
```

------------------------------------------------------------------------

## Strategy

Ship a **trustworthy field monitoring → water advice loop**.  
NDVI and weather are evidence; crop fields are farmer truth; rules own the numbers; LLM only explains the plan.
