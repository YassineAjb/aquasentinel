"""AquaSentinel — NDVI scan for a user-drawn field polygon."""

from __future__ import annotations

import base64
import io
import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
import planetary_computer
import requests
from PIL import Image, ImageDraw, ImageFilter
from pystac_client import Client

# Vegetation classes (crop-agnostic defaults; tune later by crop type)
SPARSE_MAX = 0.20
DENSE_MIN = 0.40
NDVI_RESCALE = (0.0, 0.6)


def _ring_lonlat(coords: list) -> list[tuple[float, float]]:
    """Normalize GeoJSON ring → list of (lon, lat). Drop closing duplicate."""
    ring = [(float(c[0]), float(c[1])) for c in coords]
    if len(ring) >= 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        raise ValueError("Polygon needs at least 3 vertices.")
    return ring


def polygon_bbox(ring: list[tuple[float, float]], pad: float = 0.00015) -> list[float]:
    """Slight pad around the drawn field (same as working v0)."""
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return [
        min(lons) - pad,
        min(lats) - pad,
        max(lons) + pad,
        max(lats) + pad,
    ]


def polygon_area_m2(ring: list[tuple[float, float]]) -> float:
    """Approximate geodesic area via equirectangular shoelace (good for small fields)."""
    if not ring:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat0))
    pts = [(p[0] * m_per_deg_lon, p[1] * m_per_deg_lat) for p in ring]
    area = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _item_meta(item: Any) -> dict:
    return {
        "item": item.id,
        "date": item.datetime.strftime("%Y-%m-%d") if item.datetime else "?",
        "cloud": round(float(item.properties.get("eo:cloud_cover", 0)), 3),
    }


def search_scenes(
    bbox: list[float],
    *,
    max_items: int = 24,
    exclude_item_ids: list[str] | None = None,
    exclude_dates: list[str] | None = None,
    unique_dates: bool = True,
) -> list[dict]:
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=f"2023-01-01/{end}",
        query={"eo:cloud_cover": {"lt": 15}},
        sortby=[{"field": "datetime", "direction": "desc"}],
        max_items=max_items,
    )
    exclude_ids = set(exclude_item_ids or [])
    exclude_day = set(exclude_dates or [])
    seen_dates: set[str] = set()
    scenes: list[dict] = []
    for item in search.items():
        if item.id in exclude_ids:
            continue
        meta = _item_meta(item)
        day = str(meta["date"])
        if day in exclude_day:
            continue
        # One product per calendar day (S2 can return several items same day)
        if unique_dates and day in seen_dates:
            continue
        seen_dates.add(day)
        scenes.append(meta)
    return scenes


def search_best_item(
    bbox: list[float],
    *,
    scene_index: int = 0,
    exclude_item_ids: list[str] | None = None,
    exclude_dates: list[str] | None = None,
    item_id: str | None = None,
) -> tuple[str, dict]:
    if item_id:
        return item_id, {
            "item": item_id,
            "date": "?",
            "cloud": None,
            "note": "explicit item id",
        }

    scenes = search_scenes(
        bbox,
        max_items=max(30, scene_index + 10),
        exclude_item_ids=exclude_item_ids,
        exclude_dates=exclude_dates,
        unique_dates=True,
    )
    if not scenes:
        raise RuntimeError(
            "No low-cloud Sentinel-2 scenes found for this field "
            "(or all available dates were already scanned)."
        )
    if scene_index < 0 or scene_index >= len(scenes):
        raise RuntimeError(
            f"scene_index {scene_index} out of range (found {len(scenes)} distinct dates)."
        )
    meta = scenes[scene_index]
    return str(meta["item"]), meta


def _fetch_bbox_png(
    item_id: str,
    bbox: list[float],
    size: int,
    *,
    colormap: str | None,
) -> Image.Image:
    """Square PC fetch — same as working v0 (Leaflet stretches to geo bounds)."""
    west, south, east, north = bbox
    url = (
        "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/"
        f"{west},{south},{east},{north}.png"
    )
    params: dict[str, Any] = {
        "collection": "sentinel-2-l2a",
        "item": item_id,
        "assets": ["B04", "B08"],
        "expression": "(B08-B04)/(B08+B04)",
        "asset_as_band": "True",
        "rescale": f"{NDVI_RESCALE[0]},{NDVI_RESCALE[1]}",
        "width": size,
        "height": size,
    }
    if colormap:
        params["colormap_name"] = colormap
    r = requests.get(url, params=params, timeout=180)
    if r.status_code >= 400:
        raise RuntimeError(f"NDVI fetch failed ({r.status_code}): {r.text[:300]}")
    return Image.open(io.BytesIO(r.content)).convert("RGBA" if colormap else "L")


def _fetch_truecolor_png(item_id: str, bbox: list[float], size: int) -> Image.Image:
    """Same Sentinel-2 scene as NDVI, rendered as RGB (reports only)."""
    west, south, east, north = bbox
    url = (
        "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/"
        f"{west},{south},{east},{north}.png"
    )
    attempts: list[dict[str, Any]] = [
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": "visual",
            "width": size,
            "height": size,
        },
        {
            "collection": "sentinel-2-l2a",
            "item": item_id,
            "assets": ["B04", "B03", "B02"],
            "rescale": "0,3000",
            "width": size,
            "height": size,
        },
    ]
    last_err = "true-color fetch failed"
    for params in attempts:
        r = requests.get(url, params=params, timeout=180)
        if r.status_code < 400 and r.content:
            return Image.open(io.BytesIO(r.content)).convert("RGBA")
        last_err = f"{r.status_code}: {r.text[:200]}"
    raise RuntimeError(f"True-color fetch failed ({last_err})")


def _png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _lonlat_to_px(
    lon: float, lat: float, bbox: list[float], width: int, height: int
) -> tuple[float, float]:
    west, south, east, north = bbox
    x = (lon - west) / (east - west) * (width - 1)
    y = (north - lat) / (north - south) * (height - 1)
    return x, y


def polygon_mask(
    ring: list[tuple[float, float]], bbox: list[float], width: int, height: int
) -> np.ndarray:
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)
    pts = [_lonlat_to_px(lon, lat, bbox, width, height) for lon, lat in ring]
    draw.polygon(pts, outline=255, fill=255)
    return np.array(img) > 0


def grayscale_to_ndvi(gray: np.ndarray) -> np.ndarray:
    lo, hi = NDVI_RESCALE
    return lo + (gray.astype(np.float64) / 255.0) * (hi - lo)


def classify_vegetation(ndvi: np.ndarray, mask: np.ndarray) -> dict:
    vals = ndvi[mask]
    if vals.size == 0:
        raise RuntimeError("No valid NDVI pixels inside the drawn field.")
    sparse = vals < SPARSE_MAX
    dense = vals >= DENSE_MIN
    moderate = (~sparse) & (~dense)
    pixel_area_m2 = 100.0  # Sentinel-2 10 m → will scale by coverage below
    return {
        "values": vals,
        "sparse_n": int(sparse.sum()),
        "moderate_n": int(moderate.sum()),
        "dense_n": int(dense.sum()),
        "pixel_area_m2": pixel_area_m2,
    }


def make_clear_overlay(
    color_img: Image.Image, mask: np.ndarray, scale: int = 22
) -> Image.Image:
    """Soft NDVI wash: blur RGB hard, keep sharp polygon alpha (no spill)."""
    rgb = color_img.convert("RGB")
    target = (max(1, rgb.width * scale), max(1, rgb.height * scale))
    soft = rgb.resize(target, Image.Resampling.BICUBIC).filter(
        ImageFilter.GaussianBlur(radius=max(4.0, scale * 0.35))
    )
    mask_img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    mask_big = mask_img.resize(target, Image.Resampling.NEAREST)
    alpha = np.where(np.array(mask_big) > 127, 165, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([np.array(soft), alpha]), "RGBA")


def scan_field(
    geojson_polygon: dict,
    *,
    scene_index: int = 0,
    exclude_item_ids: list[str] | None = None,
    exclude_dates: list[str] | None = None,
    item_id: str | None = None,
) -> dict:
    """
    Run AquaSentinel NDVI scan on a GeoJSON Polygon.
    Returns stats + base64 clear overlay + bounds for the map.
    """
    geom = geojson_polygon.get("geometry") or geojson_polygon
    if geom.get("type") != "Polygon":
        raise ValueError("Expected a Polygon geometry.")
    ring = _ring_lonlat(geom["coordinates"][0])
    bbox = polygon_bbox(ring)
    area_m2 = polygon_area_m2(ring)
    area_ha = area_m2 / 10_000.0

    # v0 resolution: ~10 m native sampling, square PC fetch
    west, south, east, north = bbox
    width_m = (east - west) * 111_320.0 * math.cos(math.radians((south + north) / 2))
    height_m = (north - south) * 111_320.0
    native_px = max(32, min(128, int(max(width_m, height_m) / 10)))

    item_id, scene = search_best_item(
        bbox,
        scene_index=scene_index,
        exclude_item_ids=exclude_item_ids,
        exclude_dates=exclude_dates,
        item_id=item_id,
    )
    gray = _fetch_bbox_png(item_id, bbox, native_px, colormap=None)
    color = _fetch_bbox_png(item_id, bbox, native_px, colormap="rdylgn")
    # Truecolor for HTML reports only (not shown on live map)
    truecolor = _fetch_truecolor_png(item_id, bbox, max(64, min(256, native_px * 2)))

    w, h = gray.size
    mask = polygon_mask(ring, bbox, w, h)
    ndvi = grayscale_to_ndvi(np.array(gray))
    cls = classify_vegetation(ndvi, mask)
    vals = cls["values"]
    n = int(vals.size)

    # Scale class areas so they sum to polygon area
    sparse_ha = area_ha * (cls["sparse_n"] / n)
    moderate_ha = area_ha * (cls["moderate_n"] / n)
    dense_ha = area_ha * (cls["dense_n"] / n)

    overlay = make_clear_overlay(color, mask)
    overlay_b64 = _png_b64(overlay)

    tc_display = truecolor.resize(
        (truecolor.width * 4, truecolor.height * 4), Image.Resampling.BICUBIC
    )
    bounds = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]]  # [[s,w],[n,e]]

    return {
        "ok": True,
        "scene": {
            **scene,
            "source": "Microsoft Planetary Computer",
            "collection": "sentinel-2-l2a",
        },
        "bbox": bbox,
        "field": {
            "geometry_type": "Polygon",
            "vertices": len(ring),
            "area_m2": round(area_m2, 2),
            "area_ha": round(area_ha, 4),
        },
        "ndvi": {
            "average": float(vals.mean()),
            "minimum": float(vals.min()),
            "maximum": float(vals.max()),
            "valid_pixels": n,
            "valid_coverage_pct": round(100.0 * n / max(mask.sum(), 1), 4),
        },
        "quality": {
            "coverage_too_low": (100.0 * n / max(float(mask.sum()), 1.0)) < 70.0,
            "valid_coverage_pct": round(100.0 * n / max(mask.sum(), 1), 4),
            "cloud_cover": scene.get("cloud"),
            "note": "coverage_too_low if valid field pixels < 70%",
        },
        "provenance": {
            "sensor": "Sentinel-2 L2A",
            "provider": "Microsoft Planetary Computer",
            "acquired_at": scene.get("date"),
            "scene_id": scene.get("item"),
            "cloud_cover_pct": scene.get("cloud"),
            "measurement": "original multispectral (B04/B08) — not enhanced",
            "display_truecolor": "derived visualization from same scene",
            "display_ndvi": "derived NDVI colormap overlay",
        },
        "vegetation": {
            "sparse": {
                "area_ha": round(sparse_ha, 4),
                "percentage": round(100.0 * cls["sparse_n"] / n, 4),
            },
            "moderate": {
                "area_ha": round(moderate_ha, 4),
                "percentage": round(100.0 * cls["moderate_n"] / n, 4),
            },
            "dense": {
                "area_ha": round(dense_ha, 4),
                "percentage": round(100.0 * cls["dense_n"] / n, 4),
            },
        },
        "truecolor": {
            "image_base64": _png_b64(tc_display),
            "bounds": bounds,
            "opacity": 1.0,
            "label": "Sentinel-2 true color (same scene as NDVI)",
        },
        "overlay": {
            "image_base64": overlay_b64,
            "bounds": bounds,
            "opacity": 0.78,
            "label": "NDVI overlay",
        },
        "thresholds": {
            "sparse_max": SPARSE_MAX,
            "dense_min": DENSE_MIN,
            "note": "Defaults — calibrate by crop type next.",
        },
    }
