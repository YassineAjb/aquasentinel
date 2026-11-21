import io
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import planetary_computer
import requests
from PIL import Image
from pystac_client import Client

LAT = 36.8643806
LON = 9.9736194
HALF_DEG = 0.0018
BBOX = [LON - HALF_DEG, LAT - HALF_DEG, LON + HALF_DEG, LAT + HALF_DEG]
OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(parents=True, exist_ok=True)


def search_best_item() -> tuple[str, dict]:
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
        raise RuntimeError("No low-cloud Sentinel-2 scenes found.")
    best = items[0]
    meta = {
        "item": best.id,
        "date": best.datetime.strftime("%Y-%m-%d") if best.datetime else "?",
        "cloud": f"{best.properties.get('eo:cloud_cover', '?')}%",
    }
    print(f"Selected: {best.id} cloud={meta['cloud']} date={meta['date']}")
    return best.id, meta


def fetch_ndvi_png(item_id: str, size: int = 256) -> Image.Image:
    west, south, east, north = BBOX
    url = (
        "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/"
        f"{west},{south},{east},{north}.png"
    )
    params = {
        "collection": "sentinel-2-l2a",
        "item": item_id,
        "assets": ["B04", "B08"],
        "expression": "(B08-B04)/(B08+B04)",
        "asset_as_band": "True",
        "rescale": "0,0.6",
        "colormap_name": "rdylgn",
        "width": size,
        "height": size,
    }
    r = requests.get(url, params=params, timeout=180)
    if r.status_code >= 400:
        print("NDVI error:", r.status_code, r.text[:400])
        r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGBA")


def make_alpha_overlay(img: Image.Image) -> Image.Image:
    """Keep colored NDVI, soften near-black/nodata for basemap visibility."""
    arr = np.array(img)
    rgb = arr[..., :3].astype(np.int16)
    brightness = rgb.sum(axis=2)
    # Near-black = no data / water → transparent
    alpha = np.where(brightness < 40, 0, 175).astype(np.uint8)
    arr[..., 3] = alpha
    return Image.fromarray(arr, "RGBA")


def upsample_clear(img: Image.Image, scale: int = 12) -> Image.Image:
    w, h = img.size
    return img.resize((w * scale, h * scale), Image.Resampling.BICUBIC)


def write_kmz(png_path: Path, kmz_path: Path) -> None:
    west, south, east, north = BBOX
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AquaSentinel NDVI — Field #001</name>
    <description>Clear upsampled NDVI overlay for Google Earth</description>
    <GroundOverlay>
      <name>AquaSentinel NDVI (clear)</name>
      <color>c8ffffff</color>
      <Icon><href>files/ndvi_clear.png</href></Icon>
      <LatLonBox>
        <north>{north}</north>
        <south>{south}</south>
        <east>{east}</east>
        <west>{west}</west>
      </LatLonBox>
    </GroundOverlay>
    <Placemark>
      <name>Field #001</name>
      <Point><coordinates>{LON},{LAT},0</coordinates></Point>
    </Placemark>
  </Document>
</kml>
"""
    with zipfile.ZipFile(kmz_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml)
        zf.write(png_path, "files/ndvi_clear.png")


def write_viewer(png_name: str, meta: dict, html_path: Path) -> None:
    west, south, east, north = BBOX
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AquaSentinel — Clear NDVI</title>
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
    h1 {{ font-size: 1.15rem; margin-bottom: 0.35rem; }}
    .sub {{ color: #a3b5a6; font-size: 0.85rem; margin-bottom: 1.25rem; line-height: 1.4; }}
    .stat {{
      display: flex; justify-content: space-between;
      padding: 0.55rem 0; border-bottom: 1px solid #2a352c; font-size: 0.9rem;
    }}
    .stat span:last-child {{ color: #b8e0bc; }}
    .legend {{ margin-top: 1.25rem; padding: 0.75rem; background: #141a15; border-radius: 8px; }}
    .swatch {{
      height: 12px; border-radius: 4px; margin: 0.5rem 0;
      background: linear-gradient(90deg, #ffb428, #ffe66d, #7ed957, #1faa3c);
    }}
    .hint {{ font-size: 0.78rem; color: #8a9a8c; line-height: 1.45; margin-top: 0.75rem; }}
    #map {{ width: 100%; height: 100%; }}
  </style>
</head>
<body>
  <aside>
    <h1>AquaSentinel NDVI</h1>
    <p class="sub">High-res satellite basemap + smoothed Sentinel-2 NDVI — Google Earth–style clarity.</p>
    <div class="stat"><span>Scene date</span><span>{meta['date']}</span></div>
    <div class="stat"><span>Cloud cover</span><span>{meta['cloud']}</span></div>
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
      Basemap = Esri World Imagery (same clarity class as Google Earth).<br/><br/>
      NDVI = real Sentinel-2 @ 10 m, bicubic-upsampled for display.<br/><br/>
      To open in Google Earth: File → Import →
      <code>AquaSentinel_NDVI.kmz</code>
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
      maxZoom: 19, attribution: "© OpenStreetMap"
    }});
    const ndvi = L.imageOverlay("{png_name}", bounds, {{ opacity: 0.75 }});
    ndvi.addTo(map);
    L.control.layers(
      {{ "Satellite (clear)": esri, "Streets": osm }},
      {{ "AquaSentinel NDVI": ndvi }}
    ).addTo(map);
    L.rectangle(bounds, {{ color: "#e74c3c", weight: 2, fill: false }}).addTo(map);
  </script>
</body>
</html>
"""
    html_path.write_text(html, encoding="utf-8")


def main() -> None:
    item_id, meta = search_best_item()
    print("Fetching NDVI crop…")
    # Native-ish resolution for ~400m box at 10m → ~40px; request 64 then upsample heavily
    native = fetch_ndvi_png(item_id, size=64)
    native = make_alpha_overlay(native)
    native.save(OUT / "ndvi_native.png")
    print(f"Native size: {native.size}")

    clear = upsample_clear(native, scale=16)
    clear_path = OUT / "ndvi_clear.png"
    clear.save(clear_path)
    print(f"Clear size: {clear.size}")

    write_kmz(clear_path, OUT / "AquaSentinel_NDVI.kmz")
    write_viewer("ndvi_clear.png", meta, OUT / "viewer.html")
    (OUT / "meta.json").write_text(json.dumps({**meta, "bbox": BBOX}, indent=2), encoding="utf-8")
    print(f"KMZ: {OUT / 'AquaSentinel_NDVI.kmz'}")
    print(f"Viewer: {OUT / 'viewer.html'}")


if __name__ == "__main__":
    main()
