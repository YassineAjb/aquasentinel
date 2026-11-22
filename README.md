# SAKIYA

Intelligent agriculture for water, energy, and crops.

SAKIYA helps farmers map fields, scan crop health from satellite imagery, compare dates, plan irrigation, detect water loss, and read terrain with LiDAR — with an accessible first-run experience for real farm use.
```text
React (Vite) + Leaflet
        ↓
NestJS  (sites, compare, Mongo)
        ↓
Python Flask  (scan_engine + Planetary Computer)
        ↓
MongoDB Atlas
```

## Setup

1. Copy `apps/api/.env.example` → `apps/api/.env` and set your Atlas password.
2. Install deps (already done if you scaffolded here):

```bash
cd apps/api && npm install
cd ../web && npm install
```

3. Python scan service:

```bash
cd aquasentinel
pip install flask numpy pillow requests pystac-client planetary-computer
python app.py
```

## Run (3 terminals)

```bash
# 1 analysis
cd aquasentinel && python app.py
# → http://127.0.0.1:8766/health

# 2 API
cd apps/api && npm run start:dev
# → http://127.0.0.1:3000/health

# 3 web
cd apps/web && npm run dev
# → http://127.0.0.1:5173
```

## Demo flow

1. Draw a field polygon on the map  
2. **Save site** → Mongo  
3. **Scan** → Nest → Python NDVI → observation saved  
4. Scan again later / compare two observations  
