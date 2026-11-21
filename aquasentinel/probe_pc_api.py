import requests

LAT, LON = 36.8643806, 9.9736194
HALF = 0.0025
BBOX = [LON - HALF, LAT - HALF, LON + HALF, LAT + HALF]
item_id = "S2A_MSIL2A_20261115T101211_R022_T32SNF_20261115T164806"

url = (
    f"https://planetarycomputer.microsoft.com/api/data/v1/item/crop/"
    f"{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}.png"
)
params = {
    "collection": "sentinel-2-l2a",
    "item": item_id,
    "assets": "B04,B08",
    "expression": "(B08-B04)/(B08+B04)",
    "rescale": "0,0.6",
    "colormap_name": "rdylgn",
    "width": 512,
    "height": 512,
}
r = requests.get(url, params=params, timeout=120)
print("crop assets str", r.status_code, r.headers.get("content-type"), len(r.content))
if r.status_code >= 400:
    print(r.text[:500])

params2 = {
    "collection": "sentinel-2-l2a",
    "item": item_id,
    "assets": ["B04", "B08"],
    "expression": "(B08-B04)/(B08+B04)",
    "rescale": "0,0.6",
    "colormap_name": "rdylgn",
    "width": 512,
    "height": 512,
}
r2 = requests.get(url, params=params2, timeout=120)
print("crop assets list", r2.status_code, r2.headers.get("content-type"), len(r2.content))
if r2.status_code >= 400:
    print(r2.text[:500])

# visual crop
params3 = {
    "collection": "sentinel-2-l2a",
    "item": item_id,
    "assets": "visual",
    "width": 512,
    "height": 512,
}
r3 = requests.get(url, params=params3, timeout=120)
print("visual crop", r3.status_code, r3.headers.get("content-type"), len(r3.content))

# tilejson / info
r4 = requests.get(
    "https://planetarycomputer.microsoft.com/api/data/v1/item/info",
    params={"collection": "sentinel-2-l2a", "item": item_id},
    timeout=60,
)
print("info", r4.status_code, r4.text[:400])
