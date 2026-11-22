# SAKIYA — Locked stack (Kizuna 2026)

```text
React (Vite) + Leaflet
        ↓
NestJS  (sites, compare, reports, talk to DB)
        ↓
Python Flask/FastAPI  (scan_engine — keep as-is)
        ↓
MongoDB Atlas
```

**Principle:** Nest owns product APIs + persistence. Python owns satellite/NDVI only. Do not reimplement analysis in TypeScript.

------------------------------------------------------------------------

## Locked choices

| Layer | Choice | Notes |
| ----- | ------ | ----- |
| Frontend | **React (Vite) + Leaflet + leaflet-draw** | Rebuild UI; reuse scan UX from `static/index.html` |
| API (BFF) | **NestJS** | Sites, observations, compare, reports, Mongo |
| Analysis | **Python Flask** (`aquasentinel/`) | Keep `scan_engine.py` + Planetary Computer |
| Satellites | **Microsoft Planetary Computer** (Sentinel-2 L2A) | Already working |
| Database | **MongoDB Atlas** | Sites, observations, job metadata |
| Auth | **None for demo** | Shared demo instance |
| AI (stretch) | Rule-based flag; optional LLM from JSON facts | Nest can call later |
| Hardware | Out of MVP | Optional Pi later |

------------------------------------------------------------------------

## Repo layout (target)

```text
kizuna0/
  apps/
    web/                 # React + Vite + Leaflet
    api/                 # NestJS
  aquasentinel/          # Python analysis service (existing)
    app.py
    scan_engine.py
    static/              # legacy UI — reference only
    output/
  STACK.md
  AquaSentinel_Hackathon_Build_Plan.md
```

------------------------------------------------------------------------

## Service contracts

### Python analysis (`http://127.0.0.1:8766`)

Keep / extend existing Flask app. Nest is the only caller in the product path.

| Method | Path | Body | Response (shape) |
| ------ | ---- | ---- | ---------------- |
| POST | `/api/scan` | GeoJSON polygon / feature | NDVI stats, overlay, provenance *(exists)* |
| POST | `/api/scan/dated` *(add)* | `{ feature, datetime? }` | Same + chosen scene date |
| GET | `/health` *(add)* | — | `{ ok: true }` |

**Do not** put Mongo or site CRUD in Python.

Example Nest → Python call:

```http
POST /api/scan
Content-Type: application/json

{ "feature": { "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [...] } } }
```

Nest stores the result in Mongo as an **observation** linked to a **site**.

### NestJS API (`http://127.0.0.1:3000`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/health` | API up |
| POST | `/sites` | Create site (name + GeoJSON boundary) |
| GET | `/sites` | List sites |
| GET | `/sites/:id` | Site detail |
| POST | `/sites/:id/scan` | Proxy → Python scan → save observation |
| GET | `/sites/:id/observations` | List dated observations |
| POST | `/sites/:id/compare` | Body: `{ aId, bId }` → Δ NDVI + flags |
| GET | `/sites/:id/report` | HTML/JSON report *(stretch)* |

### React web (`http://127.0.0.1:5173`)

Talks **only to Nest**, never to Python directly.

Screens (MVP):

1. Map — draw/upload boundary, save site  
2. Scan — trigger Nest `/sites/:id/scan`, show NDVI + stats + provenance  
3. History — list observations by date  
4. Compare — pick two dates, show Δ + inspect flag  

------------------------------------------------------------------------

## MongoDB collections (minimal)

### `sites`
```json
{
  "_id": "...",
  "name": "Field Demo Nabeul",
  "boundary": { "type": "Polygon", "coordinates": [] },
  "areaM2": 12345,
  "createdAt": "ISO-8601"
}
```

### `observations`
```json
{
  "_id": "...",
  "siteId": "...",
  "acquiredAt": "2026-11-15",
  "sensor": "sentinel-2-l2a",
  "sceneId": "S2A_...",
  "cloudCover": 0.18,
  "stats": { "mean": 0.26, "min": 0.05, "max": 0.55, "validPct": 92 },
  "overlayPathOrUrl": "...",
  "raw": {},
  "createdAt": "ISO-8601"
}
```

------------------------------------------------------------------------

## Env vars

```bash
# Nest
MONGODB_URI=mongodb+srv://...
PYTHON_SCAN_URL=http://127.0.0.1:8766
PORT=3000

# React
VITE_API_URL=http://127.0.0.1:3000

# Python
# (Planetary Computer: public STAC; no key required for basic use)
```

------------------------------------------------------------------------

## Local run (3 terminals)

```bash
# 1 — analysis
cd aquasentinel
pip install flask numpy pillow requests pystac-client planetary-computer
python app.py
# → :8766

# 2 — API
cd apps/api
npm i && npm run start:dev
# → :3000

# 3 — web
cd apps/web
npm i && npm run dev
# → :5173
```

------------------------------------------------------------------------

## Team roles

| Role | Owns |
| ---- | ---- |
| A — Data / Python | `scan_engine`, dated scan, cache overlays, `/health` |
| B — Nest + Mongo | sites, observations, scan proxy, compare |
| C — React | map draw, scan UI, history, compare view |
| D — Pitch / Atlas | Mongo cluster, demo field, slides, script |

------------------------------------------------------------------------

## Build order (do not skip)

1. Atlas cluster + Nest connects + `POST/GET /sites`  
2. Nest `POST /sites/:id/scan` → Python `/api/scan` → save observation  
3. React: draw → save site → scan → show stats  
4. Multi-date / compare + inspect flag  
5. Report + polish  

**Freeze:** no GEE, no Flutter, no PostGIS, no IoT until compare works.

------------------------------------------------------------------------

## Explicitly deferred

- Google Earth Engine  
- Reimplementing NDVI in Nest  
- Auth / multi-tenant  
- Super-resolution model  
- Raspberry Pi / solar  
