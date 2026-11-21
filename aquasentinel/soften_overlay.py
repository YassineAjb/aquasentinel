from pathlib import Path
import zipfile

from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent / "output"
LAT, LON = 36.8643806, 9.9736194
HALF = 0.0018
BBOX = [LON - HALF, LAT - HALF, LON + HALF, LAT + HALF]

native = Image.open(OUT / "ndvi_native.png").convert("RGBA")
clear = native.resize((1280, 1280), Image.Resampling.BICUBIC)
clear = clear.filter(ImageFilter.GaussianBlur(radius=2.2))
clear.save(OUT / "ndvi_clear.png")
print("saved", clear.size)

west, south, east, north = BBOX
kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AquaSentinel NDVI — Field #001</name>
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
  </Document>
</kml>
"""
with zipfile.ZipFile(OUT / "AquaSentinel_NDVI.kmz", "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("doc.kml", kml)
    zf.write(OUT / "ndvi_clear.png", "files/ndvi_clear.png")
print("kmz updated")
