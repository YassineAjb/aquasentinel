import io
from pathlib import Path

import requests
from PIL import Image

LAT, LON = 36.8643806, 9.9736194
HALF = 0.0025
BBOX = [LON - HALF, LAT - HALF, LON + HALF, LAT + HALF]
item_id = "S2A_MSIL2A_20261115T101211_R022_T32SNF_20261115T164806"
OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(exist_ok=True)

candidates = [
    (
        "bbox ndvi",
        f"https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}.png",
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": ["B04", "B08"],
            "expression": "(B08-B04)/(B08+B04)",
            "rescale": "0,0.6",
            "colormap_name": "rdylgn",
            "width": 512,
            "height": 512,
        },
    ),
    (
        "bbox visual",
        f"https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}.png",
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": "visual",
            "width": 512,
            "height": 512,
        },
    ),
    (
        "preview visual",
        "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png",
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": "visual",
        },
    ),
    (
        "preview B04",
        "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png",
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": "B04",
            "rescale": "0,3000",
            "colormap_name": "viridis",
        },
    ),
    (
        "WebMercator tile z15",
        "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/15/17580/12420.png",
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": "visual",
        },
    ),
]

for name, url, params in candidates:
    try:
        r = requests.get(url, params=params, timeout=120)
        ctype = r.headers.get("content-type", "")
        print(f"{name}: {r.status_code} {ctype} bytes={len(r.content)}")
        if r.status_code == 200 and "image" in ctype:
            img = Image.open(io.BytesIO(r.content))
            path = OUT / f"probe_{name.replace(' ', '_')}.png"
            img.save(path)
            print(f"  saved {path} size={img.size}")
        elif r.status_code >= 400:
            print(" ", r.text[:250])
    except Exception as e:
        print(f"{name}: ERROR {e}")
