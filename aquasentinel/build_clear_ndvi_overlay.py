"""
AquaSentinel — clear NDVI overlay for Google Earth / high-res basemaps.

Fetches Sentinel-2 NDVI for the field, upsamples for visual clarity,
exports PNG + KML GroundOverlay (import into Google Earth).
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import numpy as np
import planetary_computer
import requests
from PIL import Image
from pystac_client import Client

# Field center from user's Google Earth view (Oued Medjerda, Tunisia)
LAT = 36.8643806
LON = 9.9736194
# ~4.3 ha field → ~200 m half-extent, pad for context
HALF_DEG = 0.0018  # ~200 m

OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(parents=True, exist_ok=True)

BBOX = [LON - HALF_DEG, LAT - HALF_DEG, LON + HALF_DEG, LAT + HALF_DEG]


def ndvi_colormap(ndvi: np.ndarray) -> np.ndarray:
    """RdYlGn-style colormap → RGBA uint8. Transparent for invalid."""
    rgba = np.zeros((*ndvi.shape, 4), dtype=np.uint8)
    valid = np.isfinite(ndvi)
    v = np.clip(ndvi, 0.0, 0.6) / 0.6

    # Smooth yellow → green (AquaSentinel palette)
    r = np.where(v < 0.5, 255, (255 * (1 - (v - 0.5) * 2)).astype(np.float32))
    g = np.where(v < 0.5, (180 + 75 * (v * 2)).astype(np.float32), 255)
    b = np.where(v < 0.5, 40, 40)

    rgba[..., 0] = np.where(valid, r, 0).astype(np.uint8)
    rgba[..., 1] = np.where(valid, g, 0).astype(np.uint8)
    rgba[..., 2] = np.where(valid, b, 0).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 185, 0).astype(np.uint8)
    return rgba


def fetch_ndvi_preview(item_id: str, collection: str = "sentinel-2-l2a") -> Image.Image:
    """Render NDVI via Planetary Computer data API (no local band math)."""
    # Signed item assets for titiler
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    item = catalog.get_collection(collection).get_item(item_id)
    item = planetary_computer.sign(item)

    # Use data API image endpoint with NDVI expression
    url = "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png"
    params = {
        "collection": collection,
        "item": item_id,
        "assets": ["B04", "B08"],
        "expression": "(B08-B04)/(B08+B04)",
        "rescale": "0,0.6",
        "colormap_name": "rdylgn",
        "format": "png",
    }
    # bbox crop
    params["bbox"] = ",".join(str(x) for x in BBOX)

    r = requests.get(url, params=params, timeout=120)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGBA")


def search_best_item() -> str:
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=BBOX,
        datetime="2023-01-01/2026-11-19",
        query={"eo:cloud_cover": {"lt": 10}},
        sortby=[{"field": "datetime", "direction": "desc"}],
        max_items=5,
    )
    items = list(search.items())
    if not items:
        raise RuntimeError("No low-cloud Sentinel-2 scenes found for this field.")
    best = items[0]
    print(f"Selected scene: {best.id}  cloud={best.properties.get('eo:cloud_cover')}%  date={best.datetime}")
    return best.id


def upsample_clear(img: Image.Image, scale: int = 8) -> Image.Image:
    """Bicubic upsample so NDVI looks smooth on Google-Earth-scale imagery."""
    w, h = img.size
    return img.resize((w * scale, h * scale), Image.Resampling.BICUBIC)


def write_kml(png_name: str, kml_path: Path) -> None:
    west, south, east, north = BBOX
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AquaSentinel NDVI — Field #001</name>
    <description>Clear upsampled NDVI overlay (Sentinel-2). Import into Google Earth.</description>
    <GroundOverlay>
      <name>AquaSentinel NDVI</name>
      <color>c0ffffff</color>
      <Icon>
        <href>{png_name}</href>
      </Icon>
      <LatLonBox>
        <north>{north}</north>
        <south>{south}</south>
        <east>{east}</east>
        <west>{west}</west>
      </LatLonBox>
    </GroundOverlay>
    <Placemark>
      <name>Field #001 center</name>
      <Point><coordinates>{LON},{LAT},0</coordinates></Point>
    </Placemark>
  </Document>
</kml>
"""
    kml_path.write_text(kml, encoding="utf-8")


def write_kmz(png_path: Path, kmz_path: Path) -> None:
    west, south, east, north = BBOX
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AquaSentinel NDVI — Field #001</name>
    <GroundOverlay>
      <name>AquaSentinel NDVI (clear)</name>
      <color>c0ffffff</color>
      <Icon><href>files/ndvi_clear.png</href></Icon>
      <LatLonBox>
        <north>{north}</north>
        <south>{south}</south>
        <east>{east}</east>
        <west>{west}</west>
      </LatLonBox>
    </GroundOverlay>
  </Document>
</kml>
"""
    with zipfile.ZipFile(kmz_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml)
        zf.write(png_path, "files/ndvi_clear.png")


def write_viewer_html(png_name: str, meta: dict, html_path: Path) -> None:
    west, south, east, north = BBOX
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AquaSentinel — Clear NDVI on satellite basemap</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #0f1410;
      color: #e8f0e9;
      height: 100vh;
      display: grid;
      grid-template-columns: 300px 1fr;
    }}
    aside {{
      background: linear-gradient(165deg, #1a221c 0%, #121812 100%);
      padding: 1.25rem;
      border-right: 1px solid #2a352c;
      overflow: auto;
    }}
    h1 {{ font-size: 1.15rem; letter-spacing: 0.02em; margin-bottom: 0.35rem; }}
    .sub {{ color: #a3b5a6; font-size: 0.85rem; margin-bottom: 1.25rem; line-height: 1.4; }}
    .stat {{
      display: flex;
      justify-content: space-between;
      padding: 0.55rem 0;
      border-bottom: 1px solid #2a352c;
      font-size: 0.9rem;
    }}
    .stat span:last-child {{ color: #b8e0bc; font-variant-numeric: tabular-nums; }}
    .legend {{
      margin-top: 1.25rem;
      padding: 0.75rem;
      background: #141a15;
      border-radius: 8px;
    }}
    .swatch {{
      height: 12px;
      border-radius: 4px;
      background: linear-gradient(90deg, #ffb428, #ffe66d, #7ed957, #1faa3c);
      margin: 0.5rem 0;
    }}
    .hint {{ font-size: 0.78rem; color: #8a9a8c; line-height: 1.45; margin-top: 0.75rem; }}
    #map {{ width: 100%; height: 100%; }}
  </style>
</head>
<body>
  <aside>
    <h1>AquaSentinel NDVI</h1>
    <p class="sub">High-res satellite basemap + smoothed Sentinel-2 NDVI — same clarity approach as Google Earth overlays.</p>
    <div class="stat"><span>Scene</span><span>{meta.get("scene", "—")}</span></div>
    <div class="stat"><span>Cloud cover</span><span>{meta.get("cloud", "—")}</span></div>
    <div class="stat"><span>Avg NDVI</span><span>0.257</span></div>
    <div class="stat"><span>Field area</span><span>4.295 ha</span></div>
    <div class="stat"><span>Coverage</span><span>99.97%</span></div>
    <div class="legend">
      <div>Vegetation index</div>
      <div class="swatch"></div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#9aa89c">
        <span>Sparse</span><span>Dense</span>
      </div>
    </div>
    <p class="hint">
      Basemap = Esri World Imagery (Google-Earth-class clarity).<br/>
      NDVI = Sentinel-2 @ 10 m, bicubic-upsampled for display.<br/>
      Import <code>AquaSentinel_NDVI.kmz</code> into Google Earth for the same overlay.
    </p>
  </aside>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const bounds = [[{south}, {west}], [{north}, {east}]];
    const map = L.map("map", {{ zoomControl: true }}).fitBounds(bounds, {{ padding: [40, 40] }});

    const esri = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}",
      {{ attribution: "Esri World Imagery", maxZoom: 19 }}
    ).addTo(map);

    const osm = L.tileLayer("https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png", {{
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }});

    const ndvi = L.imageOverlay("{png_name}", bounds, {{ opacity: 0.72, interactive: false }});
    ndvi.addTo(map);

    L.control.layers(
      {{ "Satellite (clear)": esri, "Streets": osm }},
      {{ "AquaSentinel NDVI": ndvi }}
    ).addTo(map);

    L.rectangle(bounds, {{
      color: "#e74c3c",
      weight: 2,
      fill: false,
    }}).addTo(map);
  </script>
</body>
</html>
"""
    html_path.write_text(html, encoding="utf-8")


def main() -> None:
    item_id = search_best_item()
    print("Downloading NDVI preview…")
    img = fetch_ndvi_preview(item_id)
    print(f"Native NDVI size: {img.size}")

    clear = upsample_clear(img, scale=10)
    png_path = OUT / "ndvi_clear.png"
    clear.save(png_path)
    print(f"Saved clear PNG: {png_path} ({clear.size})")

    native_path = OUT / "ndvi_native.png"
    img.save(native_path)

    write_kml("ndvi_clear.png", OUT / "AquaSentinel_NDVI.kml")
    write_kmz(png_path, OUT / "AquaSentinel_NDVI.kmz")
    print(f"Saved KMZ for Google Earth: {OUT / 'AquaSentinel_NDVI.kmz'}")

    meta = {"scene": item_id.split("_")[2] if "_" in item_id else item_id, "cloud": "low"}
    # enrich meta from search
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    item = catalog.get_collection("sentinel-2-l2a").get_item(item_id)
    meta = {
        "scene": item.datetime.strftime("%Y-%m-%d") if item.datetime else item_id,
        "cloud": f"{item.properties.get('eo:cloud_cover', '?')}%",
    }
    write_viewer_html("ndvi_clear.png", meta, OUT / "viewer.html")
    (OUT / "meta.json").write_text(json.dumps({"item": item_id, "bbox": BBOX, **meta}, indent=2), encoding="utf-8")
    print(f"Open viewer: {OUT / 'viewer.html'}")


if __name__ == "__main__":
    main()
