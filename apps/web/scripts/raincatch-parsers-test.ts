/* Run: npx tsx scripts/raincatch-parsers-test.ts — builds real GeoTIFF / ASC / CSV / LAS files in memory and parses them. */
import { writeArrayBuffer } from 'geotiff';
import { parseDemFile } from '../src/raincatch/engine/parsers';
import { analyzeTerrain } from '../src/raincatch/engine/terrain';
import { DEFAULT_CONFIG } from '../src/raincatch/config';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const surf = (x: number, y: number) => 100 + 0.03 * x - 0.02 * y + 1.5 * Math.exp(-(((x - 150) ** 2 + (y - 120) ** 2) / 800));
async function expectFail(p: Promise<unknown>, code: string, label: string) {
  try { await p; ok(false, `${label}: should fail`); } catch (e) { const c = (e as { info?: { code: string } }).info?.code; ok(c === code, `${label}: ${c} (${(e as Error).message.slice(0, 60)})`); }
}

(async () => {
  // GeoTIFF in EPSG:4326, 120x100 px, 0.00003° (~3 m)
  const W = 120, H = 100, px = 0.00003, lon0 = 9.97, lat0 = 36.87;
  const vals = new Float32Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) vals[r * W + c] = surf(c * 3, r * 3);
  vals[5] = -9999;
  const tif = writeArrayBuffer(vals, {
    width: W, height: H, GTModelTypeGeoKey: 2, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326,
    ModelPixelScale: [px, px, 0], ModelTiepoint: [0, 0, 0, lon0, lat0, 0], GDAL_NODATA: '-9999',
  } as never);
  const dem = await parseDemFile('parcel_dtm.tif', tif);
  ok(dem.cols === W && dem.rows === H, `GeoTIFF dims ${dem.cols}x${dem.rows}`);
  ok(Math.abs(dem.bounds.north - lat0) < 1e-6 && Math.abs(dem.bounds.west - lon0) < 1e-6, 'GeoTIFF bounds');
  ok(Math.abs(dem.cellSizeX - 2.68) < 0.1 && Math.abs(dem.cellSizeY - 3.32) < 0.1, `cell size m ${dem.cellSizeX.toFixed(2)}×${dem.cellSizeY.toFixed(2)}`);
  ok(Number.isNaN(dem.z[5]), 'nodata → NaN');
  ok(dem.kind === 'DTM', 'kind from file name');
  const a = analyzeTerrain(dem, DEFAULT_CONFIG);
  ok(a.depressions.length >= 0 && a.validCells > 0, 'real GeoTIFF flows through the engine');

  // ESRI ASCII grid (UTM 32N, Tunisia ~ 36.8N, 10.2E → E≈ 590000, N≈4075000)
  let asc = 'ncols 80\nnrows 60\nxllcorner 590000\nyllcorner 4075000\ncellsize 5\nNODATA_value -9999\n';
  for (let r = 0; r < 60; r++) asc += Array.from({ length: 80 }, (_, c) => surf(c * 5, (59 - r) * 5).toFixed(2)).join(' ') + '\n';
  const enc = new TextEncoder().encode(asc).buffer as ArrayBuffer;
  await expectFail(parseDemFile('x.asc', enc), 'UNKNOWN_CRS', 'ASC without CRS');
  const d2 = await parseDemFile('x.asc', enc, { crs: 'EPSG:32632' });
  ok(Math.abs(d2.bounds.south - 36.8) < 0.1 && d2.bounds.west > 10 && d2.bounds.west < 10.4, `UTM→lat/lon ${d2.bounds.south.toFixed(4)}, ${d2.bounds.west.toFixed(4)}`);

  // CSV lon/lat/z
  let csv = 'lon,lat,elevation\n';
  for (let i = 0; i < 4000; i++) { const x = (i % 80) * 4, y = Math.floor(i / 80) * 4; csv += `${(9.97 + x / 89000).toFixed(7)},${(36.87 + y / 110574).toFixed(7)},${surf(x, y).toFixed(2)}\n`; }
  const d3 = await parseDemFile('survey.csv', new TextEncoder().encode(csv).buffer as ArrayBuffer);
  ok(d3.cols > 10 && d3.pointCount === 4000, `CSV gridded ${d3.cols}x${d3.rows} @ ${d3.cellSizeX.toFixed(1)} m`);
  await expectFail(parseDemFile('bad.csv', new TextEncoder().encode('a,b,c\n1,2,3\n').buffer as ArrayBuffer), 'INSUFFICIENT_TERRAIN', 'tiny CSV');
  await expectFail(parseDemFile('nz.csv', new TextEncoder().encode('x,y\n' + '1,2\n'.repeat(200)).buffer as ArrayBuffer), 'INCOMPATIBLE_FILE', 'CSV without z');

  // LAS 1.2 format 1, UTM 32N (GeoKey 3072 = 32632), ground-classified
  const N = 6000, recLen = 28, hdr = 227, vlrLen = 54 + 8 + 8 * 1;
  const buf = new ArrayBuffer(hdr + vlrLen + N * recLen); const dv = new DataView(buf);
  'LASF'.split('').forEach((ch, i) => dv.setUint8(i, ch.charCodeAt(0)));
  dv.setUint8(24, 1); dv.setUint8(25, 2); dv.setUint16(94, hdr, true); dv.setUint32(96, hdr + vlrLen, true); dv.setUint32(100, 1, true);
  dv.setUint8(104, 1); dv.setUint16(105, recLen, true); dv.setUint32(107, N, true);
  [0.01, 0.01, 0.01, 0, 0, 0].forEach((v, i) => dv.setFloat64(131 + i * 8, v, true));
  dv.setUint16(hdr + 18, 34735, true); dv.setUint16(hdr + 20, 16, true);
  const kb = hdr + 54; dv.setUint16(kb, 1, true); dv.setUint16(kb + 6, 1, true); // header: 1 key
  dv.setUint16(kb + 8, 3072, true); dv.setUint16(kb + 14, 32632, true);
  for (let i = 0; i < N; i++) {
    const x = (i % 100) * 3, y = Math.floor(i / 100) * 3, p = hdr + vlrLen + i * recLen;
    dv.setInt32(p, Math.round((590000 + x) * 100), true); dv.setInt32(p + 4, Math.round((4075000 + y) * 100), true); dv.setInt32(p + 8, Math.round(surf(x, y) * 100), true);
    dv.setUint8(p + 15, i % 7 === 0 ? 1 : 2);
  }
  const d4 = await parseDemFile('survey.las', buf);
  ok(d4.source === 'las' && d4.kind === 'DTM' && d4.pointCount === N && d4.crs === 'EPSG:32632', `LAS parsed: ${d4.cols}x${d4.rows}, ${d4.crs}, ${d4.kind}`);
  await expectFail(parseDemFile('a.laz', new ArrayBuffer(300)), 'LAZ_UNSUPPORTED', 'LAZ');
  await expectFail(parseDemFile('a.las', new ArrayBuffer(300)), 'INVALID_LIDAR', 'garbage LAS');
  await expectFail(parseDemFile('a.png', new ArrayBuffer(300)), 'INCOMPATIBLE_FILE', 'unsupported extension');
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PARSER CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
