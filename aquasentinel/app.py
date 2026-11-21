"""AquaSentinel — draw field borders, then run NDVI scan."""

from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from scan_engine import polygon_bbox, _ring_lonlat, scan_field, search_scenes

ROOT = Path(__file__).resolve().parent
# Keep static under /static so /health and /api/* are not shadowed
app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "aquasentinel-scan"})


@app.post("/api/scan")
def api_scan():
    data = request.get_json(force=True, silent=True) or {}
    feature = data.get("feature") or data.get("polygon") or data
    scene_index = int(data.get("scene_index") or 0)
    exclude = data.get("exclude_item_ids") or []
    if not isinstance(exclude, list):
        exclude = []
    exclude_dates = data.get("exclude_dates") or []
    if not isinstance(exclude_dates, list):
        exclude_dates = []
    item_id = data.get("item_id")
    try:
        result = scan_field(
            feature,
            scene_index=scene_index,
            exclude_item_ids=[str(x) for x in exclude],
            exclude_dates=[str(x) for x in exclude_dates],
            item_id=str(item_id) if item_id else None,
        )
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001 — return clean API error
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.post("/api/scenes")
def api_scenes():
    data = request.get_json(force=True, silent=True) or {}
    feature = data.get("feature") or data.get("polygon") or data
    try:
        geom = feature.get("geometry") or feature
        ring = _ring_lonlat(geom["coordinates"][0])
        bbox = polygon_bbox(ring)
        scenes = search_scenes(bbox, max_items=int(data.get("max_items") or 10))
        return jsonify({"ok": True, "scenes": scenes, "bbox": bbox})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(exc)}), 400


def main() -> None:
    print("AquaSentinel analysis service")
    print("Health http://127.0.0.1:8766/health")
    print("Scan   POST http://127.0.0.1:8766/api/scan")
    app.run(host="127.0.0.1", port=8766, debug=False)


if __name__ == "__main__":
    main()
