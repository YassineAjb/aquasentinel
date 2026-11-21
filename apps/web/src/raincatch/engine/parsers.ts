import { fromArrayBuffer } from 'geotiff';
import type { DemGrid, DemKind } from '../types';
import { RainCatchFailure } from './errors';
import { boxToBounds, cellSizeMeters, localFrame, parseCrs, type CrsInfo } from './projection';

export interface ParseOptions {
  /** CRS to assume when the file does not declare one (e.g. "EPSG:4326", "EPSG:32632") */
  crs?: string;
  verticalErrorM?: number;
  onProgress?: (fraction: number, stage: string) => void;
}

export const MAX_CELLS = 250_000;
export const MAX_FILE_BYTES = 600 * 1024 * 1024;
export const SUPPORTED = ['.tif', '.tiff', '.asc', '.csv', '.txt', '.xyz', '.las', '.laz', '.dem', '.dtm', '.mnt'];

const extOf = (name: string) => (/\.[^.]+$/.exec(name.toLowerCase()) ?? [''])[0];
const NODATA_LIMITS = { lo: -500, hi: 9000 };

/* ------------------------------------------------------------------ entry */

export async function parseDemFile(name: string, buffer: ArrayBuffer, opt: ParseOptions = {}): Promise<DemGrid> {
  const ext = extOf(name);
  if (buffer.byteLength === 0)
    throw new RainCatchFailure('INCOMPATIBLE_FILE', 'The file is empty.', 'Choose a valid GeoTIFF, ASCII grid, XYZ/CSV or LAS file.');
  if (buffer.byteLength > MAX_FILE_BYTES)
    throw new RainCatchFailure('FILE_TOO_LARGE', `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 'Clip it to your parcel (QGIS: Raster → Extraction → Clip) or thin the point cloud (PDAL).');
  if (!SUPPORTED.includes(ext))
    throw new RainCatchFailure('INCOMPATIBLE_FILE', `Unsupported format "${ext || name}".`, `Supported: ${SUPPORTED.join(', ')}.`);
  opt.onProgress?.(0.05, 'Reading file');
  let dem: DemGrid;
  if (ext === '.tif' || ext === '.tiff') dem = await parseGeoTiff(name, buffer, opt);
  else if (ext === '.las') dem = parseLas(name, buffer, opt);
  else if (ext === '.laz')
    throw new RainCatchFailure(
      'LAZ_UNSUPPORTED',
      'LAZ (compressed LAS) cannot be decoded in the browser by RainCatch.',
      'Convert it first, e.g.  pdal translate in.laz out.las   (or  laszip -i in.laz -o out.las), or directly rasterise a DTM:  pdal translate in.laz dtm.tif --filters.range.limits="Classification[2:2]" --writers.gdal.resolution=1 --writers.gdal.output_type=min. Then import the .las or .tif.',
    );
  else {
    const text = new TextDecoder().decode(new Uint8Array(buffer));
    if (/^\s*ncols\s/i.test(text)) dem = parseAsciiGrid(name, text, opt);
    else dem = parseXyz(name, text, opt);
  }
  dem.fileName = name;
  dem.fileSizeBytes = buffer.byteLength;
  opt.onProgress?.(0.9, 'Validating');
  return finalizeDem(dem);
}

/* ------------------------------------------------------------------ validation + resampling */

export function finalizeDem(dem: DemGrid): DemGrid {
  const { z } = dem;
  let bad = 0;
  let valid = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    if (!Number.isFinite(v) || v < NODATA_LIMITS.lo || v > NODATA_LIMITS.hi) {
      if (!Number.isNaN(v)) bad++;
      z[i] = NaN;
      continue;
    }
    valid++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (bad) dem.notes.push(`${bad} out-of-range value(s) (< ${NODATA_LIMITS.lo} m or > ${NODATA_LIMITS.hi} m) were treated as no-data.`);
  if (dem.cols < 20 || dem.rows < 20)
    throw new RainCatchFailure('INSUFFICIENT_TERRAIN', `The grid is only ${dem.cols}×${dem.rows} cells.`, 'RainCatch needs at least 20×20 cells. Use a higher-resolution DEM or a larger extent.');
  if (valid < 0.5 * z.length)
    throw new RainCatchFailure('INVALID_LIDAR', `Only ${((valid / z.length) * 100).toFixed(0)} % of the grid has valid elevations.`, 'Check the no-data value and the coordinate system of the file, or fill gaps in QGIS (GDAL fill nodata).');
  if (mx - mn < 0.3)
    throw new RainCatchFailure('INSUFFICIENT_TERRAIN', `The relief is only ${(mx - mn).toFixed(2)} m: the terrain is flat or the vertical unit is wrong.`, 'Check that elevations are in metres and that the file is a terrain model, not a constant raster.');
  const b = dem.bounds;
  if (!(b.south < b.north && b.west < b.east) || Math.abs(b.south) > 90 || Math.abs(b.north) > 90 || Math.abs(b.west) > 180 || Math.abs(b.east) > 180)
    throw new RainCatchFailure('INVALID_COORDINATES', 'The geographic extent of the file is invalid.', 'Verify the CRS of the file or choose the correct EPSG code at import.');

  // resample (box average) when too many cells — keeps the UI and the worker responsive
  if (dem.cols * dem.rows > MAX_CELLS) {
    const f = Math.ceil(Math.sqrt((dem.cols * dem.rows) / MAX_CELLS));
    const cols = Math.floor(dem.cols / f);
    const rows = Math.floor(dem.rows / f);
    const out = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let s = 0;
        let k = 0;
        for (let dr = 0; dr < f; dr++)
          for (let dc = 0; dc < f; dc++) {
            const v = dem.z[(r * f + dr) * dem.cols + (c * f + dc)];
            if (!Number.isNaN(v)) {
              s += v;
              k++;
            }
          }
        out[r * cols + c] = k ? s / k : NaN;
      }
    }
    const latSpan = dem.bounds.north - dem.bounds.south;
    const lonSpan = dem.bounds.east - dem.bounds.west;
    dem.originalCellSizeM = Math.sqrt(dem.cellSizeX * dem.cellSizeY);
    dem.notes.push(`Resampled ×${f} (${dem.cols}×${dem.rows} → ${cols}×${rows}) to stay interactive; native resolution ${dem.originalCellSizeM.toFixed(2)} m.`);
    dem.bounds = {
      north: dem.bounds.north,
      west: dem.bounds.west,
      south: dem.bounds.north - (latSpan * rows * f) / dem.rows,
      east: dem.bounds.west + (lonSpan * cols * f) / dem.cols,
    };
    dem.cellSizeX *= f;
    dem.cellSizeY *= f;
    dem.cols = cols;
    dem.rows = rows;
    dem.z = out;
    dem.resampled = true;
  }
  return dem;
}

function needCrs(opt: ParseOptions, declared: string | null, hint: string): CrsInfo {
  const crs = parseCrs(declared) ?? parseCrs(opt.crs);
  if (!crs)
    throw new RainCatchFailure(
      'UNKNOWN_CRS',
      declared ? `Coordinate system "${declared}" is not supported.` : `The file does not declare a coordinate system (${hint}).`,
      'Pick the CRS in the import form (EPSG:4326, WGS84 UTM 326xx, EPSG:3857), or reproject the file: gdalwarp -t_srs EPSG:4326 in.tif out.tif. For Tunisia, WGS84/UTM 32N is EPSG:32632.',
    );
  return crs;
}

/* ------------------------------------------------------------------ GeoTIFF */

async function parseGeoTiff(name: string, buffer: ArrayBuffer, opt: ParseOptions): Promise<DemGrid> {
  let tiff;
  try {
    tiff = await fromArrayBuffer(buffer);
  } catch (e) {
    throw new RainCatchFailure('INCOMPATIBLE_FILE', `Not a readable TIFF/GeoTIFF (${(e as Error).message}).`, 'Export again as GeoTIFF from QGIS (Raster → Conversion → Translate).');
  }
  const image = await tiff.getImage();
  const fd = image.getFileDirectory() as unknown as Record<string, unknown>;
  if (fd.ModelTransformation && (fd.ModelTransformation as number[])[1] !== 0)
    throw new RainCatchFailure('INCOMPATIBLE_FILE', 'The raster is rotated / sheared.', 'Reproject to a north-up raster: gdalwarp -t_srs EPSG:4326 in.tif out.tif');
  const keys = image.getGeoKeys() as Record<string, number> | null;
  let declared: string | null = null;
  if (keys) {
    const proj = keys.ProjectedCSTypeGeoKey;
    const geog = keys.GeographicTypeGeoKey;
    if (proj && proj !== 32767) declared = `EPSG:${proj}`;
    else if (geog && geog !== 32767) declared = `EPSG:${geog}`;
  }
  const crs = needCrs(opt, declared, 'GeoTIFF keys missing');
  const width = image.getWidth();
  const height = image.getHeight();
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution();
  if (!Number.isFinite(ox) || !Number.isFinite(rx) || rx === 0)
    throw new RainCatchFailure('INVALID_COORDINATES', 'The GeoTIFF has no valid georeferencing (origin / pixel size).', 'Georeference the raster in QGIS before importing.');
  opt.onProgress?.(0.3, 'Decoding raster');
  const rasters = await image.readRasters({ interleave: false });
  const band = (rasters as unknown as ArrayLike<number>[])[0];
  const nd = image.getGDALNoData();
  const z = new Float32Array(width * height);
  for (let i = 0; i < z.length; i++) {
    const v = band[i];
    z[i] = nd !== null && v === nd ? NaN : v;
  }
  const minX = ox;
  const maxX = ox + rx * width;
  const maxY = oy;
  const minY = oy + ry * height; // ry is negative for north-up rasters
  const bounds = boxToBounds(crs, Math.min(minX, maxX), Math.min(minY, maxY), Math.max(minX, maxX), Math.max(minY, maxY));
  const cs = cellSizeMeters(crs, rx, ry, (bounds.north + bounds.south) / 2);
  const bandsN = (rasters as unknown as unknown[]).length;
  const notes = [`GeoTIFF ${width}×${height}, CRS ${crs.code}${declared ? '' : ' (chosen at import)'}.`];
  if (bandsN > 1) notes.push(`${bandsN} bands found: band 1 was used as elevation.`);
  const kind: DemKind = /dsm|mns/i.test(name) ? 'DSM' : /dtm|mnt/i.test(name) ? 'DTM' : /dem/i.test(name) ? 'DEM' : 'unknown';
  if (kind === 'DSM') notes.push('DSM: buildings and vegetation are included in the surface — water routing may be wrong under canopy. A DTM is preferred.');
  if (kind === 'unknown') notes.push('Type of model (DEM/DTM/DSM) is not stated in the file name — verify that it is a bare-earth terrain model.');
  notes.push('Elevations are assumed to be in metres.');
  return {
    id: `file-${Date.now()}`,
    name: name.replace(/\.[^.]+$/, ''),
    source: 'geotiff',
    isDemo: false,
    kind,
    cols: width,
    rows: height,
    cellSizeX: cs.x,
    cellSizeY: cs.y,
    bounds,
    z,
    crs: crs.code,
    verticalErrorM: opt.verticalErrorM ?? 0.2,
    notes,
  };
}

/* ------------------------------------------------------------------ ESRI ASCII grid */

function parseAsciiGrid(name: string, text: string, opt: ParseOptions): DemGrid {
  const lines = text.split(/\r?\n/);
  const hdr: Record<string, number> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^\s*([A-Za-z_]+)\s+(-?[\d.eE+-]+)\s*$/.exec(lines[i]);
    if (!m) break;
    hdr[m[1].toLowerCase()] = Number(m[2]);
  }
  const { ncols, nrows, cellsize } = hdr;
  if (!ncols || !nrows || !cellsize)
    throw new RainCatchFailure('INCOMPATIBLE_FILE', 'ASCII grid header is incomplete (ncols / nrows / cellsize).', 'Export again as ESRI ASCII Grid (.asc) from QGIS.');
  const xll = hdr.xllcorner ?? (hdr.xllcenter !== undefined ? hdr.xllcenter - cellsize / 2 : undefined);
  const yll = hdr.yllcorner ?? (hdr.yllcenter !== undefined ? hdr.yllcenter - cellsize / 2 : undefined);
  if (xll === undefined || yll === undefined)
    throw new RainCatchFailure('INVALID_COORDINATES', 'The ASCII grid has no xllcorner / yllcorner.', 'Georeference the grid and export it again.');
  const nd = hdr.nodata_value ?? -9999;
  const z = new Float32Array(ncols * nrows);
  let k = 0;
  for (; i < lines.length && k < z.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    for (const tok of t.split(/\s+/)) {
      if (k < z.length) {
        const v = Number(tok);
        z[k++] = v === nd ? NaN : v;
      }
    }
  }
  if (k < z.length) throw new RainCatchFailure('INVALID_LIDAR', `Grid truncated: ${k} of ${z.length} values.`, 'Re-export the file; it appears to be incomplete.');
  const looksGeographic = Math.abs(xll) <= 180 && Math.abs(yll) <= 90 && cellsize < 1;
  const crs = needCrs(opt, looksGeographic ? 'EPSG:4326' : null, 'ASCII grids carry no CRS');
  const bounds = boxToBounds(crs, xll, yll, xll + ncols * cellsize, yll + nrows * cellsize);
  const cs = cellSizeMeters(crs, cellsize, cellsize, (bounds.north + bounds.south) / 2);
  return {
    id: `file-${Date.now()}`,
    name: name.replace(/\.[^.]+$/, ''),
    source: 'asc',
    isDemo: false,
    kind: /dsm|mns/i.test(name) ? 'DSM' : /dtm|mnt/i.test(name) ? 'DTM' : 'DEM',
    cols: ncols,
    rows: nrows,
    cellSizeX: cs.x,
    cellSizeY: cs.y,
    bounds,
    z,
    crs: crs.code,
    verticalErrorM: opt.verticalErrorM ?? 0.2,
    notes: [`ESRI ASCII grid ${ncols}×${nrows}, CRS ${crs.code}.`, 'Elevations are assumed to be in metres.'],
  };
}

/* ------------------------------------------------------------------ scattered points → grid */

export interface PointSet {
  x: Float64Array;
  y: Float64Array;
  z: Float32Array;
  n: number;
}

/** Bins points to a regular grid (mean per cell, or minimum for non-classified LiDAR) and fills small gaps (IDW-like). */
export function pointsToGrid(
  pts: PointSet,
  crs: CrsInfo,
  mode: 'mean' | 'min',
  name: string,
  source: 'csv' | 'las',
  opt: ParseOptions,
): DemGrid {
  if (pts.n < 100)
    throw new RainCatchFailure('INSUFFICIENT_TERRAIN', `Only ${pts.n} usable points.`, 'At least ~100 well-distributed points are needed; use a denser survey or a raster DEM.');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.n; i++) {
    if (pts.x[i] < minX) minX = pts.x[i];
    if (pts.x[i] > maxX) maxX = pts.x[i];
    if (pts.y[i] < minY) minY = pts.y[i];
    if (pts.y[i] > maxY) maxY = pts.y[i];
  }
  const frame = localFrame(crs, (minX + maxX) / 2, (minY + maxY) / 2);
  const [lx0, ly0] = frame.toLocal(minX, minY);
  const [lx1, ly1] = frame.toLocal(maxX, maxY);
  const w = lx1 - lx0;
  const h = ly1 - ly0;
  if (!(w > 10 && h > 10))
    throw new RainCatchFailure('INVALID_COORDINATES', `The point extent is only ${w.toFixed(1)} × ${h.toFixed(1)} m.`, 'Check the coordinate columns (lon/lat vs. x/y) and the selected CRS.');
  // about 4 points per cell, never finer than 0.5 m, never more than MAX_CELLS cells
  let cell = Math.max(0.5, Math.sqrt((4 * w * h) / pts.n));
  cell = Math.max(cell, Math.sqrt((w * h) / MAX_CELLS));
  const cols = Math.max(2, Math.ceil(w / cell));
  const rows = Math.max(2, Math.ceil(h / cell));
  const sum = new Float64Array(cols * rows);
  const cnt = new Uint32Array(cols * rows);
  const mn = new Float32Array(cols * rows).fill(Infinity);
  for (let i = 0; i < pts.n; i++) {
    const [lx, ly] = frame.toLocal(pts.x[i], pts.y[i]);
    const c = Math.min(cols - 1, Math.floor((lx - lx0) / cell));
    const r = Math.min(rows - 1, Math.floor((ly1 - ly) / cell)); // row 0 = north
    const k = r * cols + c;
    sum[k] += pts.z[i];
    cnt[k]++;
    if (pts.z[i] < mn[k]) mn[k] = pts.z[i];
  }
  let z = new Float32Array(cols * rows).fill(NaN);
  for (let k = 0; k < z.length; k++) if (cnt[k]) z[k] = mode === 'min' ? mn[k] : sum[k] / cnt[k];
  // fill gaps: up to 6 passes of neighbour averaging (radius 1), real holes stay NaN
  let filledTotal = 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = z.slice();
    let changed = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        if (!Number.isNaN(z[k])) continue;
        let s = 0, n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
            const v = z[rr * cols + cc];
            if (!Number.isNaN(v)) { s += v; n++; }
          }
        if (n >= 3) { next[k] = s / n; changed++; }
      }
    z = next;
    filledTotal += changed;
    if (!changed) break;
  }
  const bounds = boxToBounds(crs, minX, minY, maxX, maxY);
  const nodata = z.reduce((t, v) => t + (Number.isNaN(v) ? 1 : 0), 0);
  return {
    id: `file-${Date.now()}`,
    name: name.replace(/\.[^.]+$/, ''),
    source,
    isDemo: false,
    kind: mode === 'min' ? 'DEM' : 'DTM',
    cols,
    rows,
    cellSizeX: cell,
    cellSizeY: cell,
    bounds,
    z,
    crs: crs.code,
    pointCount: pts.n,
    verticalErrorM: opt.verticalErrorM ?? 0.3,
    notes: [
      `${pts.n.toLocaleString()} points gridded at ${cell.toFixed(2)} m (${mode === 'min' ? 'lowest point per cell' : 'mean per cell'}); ${filledTotal} gap cell(s) interpolated, ${nodata} cell(s) left as no-data.`,
    ],
  };
}

/* ------------------------------------------------------------------ XYZ / CSV */

function parseXyz(name: string, text: string, opt: ParseOptions): DemGrid {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 101) throw new RainCatchFailure('INSUFFICIENT_TERRAIN', `Only ${Math.max(0, lines.length - 1)} data lines.`, 'Provide at least 100 points with coordinates and elevation.');
  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : /\s+/;
  const split = (l: string) => l.trim().split(delim).map((t) => t.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]);
  const hasHeader = first.some((t) => Number.isNaN(Number(t)));
  let ix = 0, iy = 1, iz = 2;
  let geographic = false;
  if (hasHeader) {
    const low = first.map((t) => t.toLowerCase());
    const find = (...names: string[]) => low.findIndex((t) => names.includes(t));
    const lon = find('lon', 'lng', 'long', 'longitude');
    const lat = find('lat', 'latitude');
    const xx = find('x', 'easting', 'east');
    const yy = find('y', 'northing', 'north');
    const zz = find('z', 'alt', 'altitude', 'elevation', 'elev', 'height', 'h', 'ele');
    if (zz < 0) throw new RainCatchFailure('INCOMPATIBLE_FILE', 'No elevation column found in the CSV header.', 'Name the column z, elevation, altitude, alt or height.');
    iz = zz;
    if (lon >= 0 && lat >= 0) { ix = lon; iy = lat; geographic = true; }
    else if (xx >= 0 && yy >= 0) { ix = xx; iy = yy; }
    else throw new RainCatchFailure('INCOMPATIBLE_FILE', 'No coordinate columns found (lon/lat or x/y).', 'Use headers lon,lat,z  or  x,y,z.');
  }
  const body = hasHeader ? lines.slice(1) : lines;
  const x = new Float64Array(body.length), y = new Float64Array(body.length), zz = new Float32Array(body.length);
  let n = 0, bad = 0;
  for (const l of body) {
    const t = split(l);
    const vx = Number(t[ix]), vy = Number(t[iy]), vz = Number(t[iz]);
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) { bad++; continue; }
    x[n] = vx; y[n] = vy; zz[n] = vz; n++;
  }
  if (bad > body.length * 0.2) throw new RainCatchFailure('INVALID_LIDAR', `${bad} of ${body.length} lines are not numeric.`, 'Check the delimiter and the header of the CSV.');
  let declared: string | null = null;
  if (geographic || (Math.abs(x[0]) <= 180 && Math.abs(y[0]) <= 90 && !hasHeader)) declared = 'EPSG:4326';
  else if (Math.abs(x[0]) <= 180 && Math.abs(y[0]) <= 90) declared = 'EPSG:4326';
  const crs = needCrs(opt, declared, 'projected x/y values need an EPSG code');
  if (crs.kind === 'geographic' && (Math.abs(x[0]) > 180 || Math.abs(y[0]) > 90))
    throw new RainCatchFailure('INVALID_COORDINATES', 'Coordinates are outside the valid lon/lat range.', 'Select the right projected CRS (e.g. EPSG:32632) at import.');
  const out = pointsToGrid({ x, y, z: zz, n }, crs, 'mean', name, 'csv', opt);
  if (bad) out.notes.push(`${bad} invalid line(s) skipped.`);
  return out;
}

/* ------------------------------------------------------------------ LAS (uncompressed, 1.0–1.4) */

export function parseLas(name: string, buffer: ArrayBuffer, opt: ParseOptions): DemGrid {
  const dv = new DataView(buffer);
  const sig = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (buffer.byteLength < 227 || sig !== 'LASF')
    throw new RainCatchFailure('INVALID_LIDAR', 'Not a valid LAS file (missing "LASF" signature).', 'Re-export the point cloud as LAS 1.2–1.4, uncompressed.');
  const vMinor = dv.getUint8(25);
  const headerSize = dv.getUint16(94, true);
  const dataOffset = dv.getUint32(96, true);
  const nVlr = dv.getUint32(100, true);
  const fmtRaw = dv.getUint8(104);
  const fmt = fmtRaw & 0x3f;
  if (fmtRaw & 0x80) throw new RainCatchFailure('LAZ_UNSUPPORTED', 'This file uses LAZ compression.', 'Decompress it first: laszip -i in.laz -o out.las (or pdal translate in.laz out.las).');
  const recLen = dv.getUint16(105, true);
  let nPts = dv.getUint32(107, true);
  if (vMinor >= 4 && headerSize >= 375) {
    const big = Number(dv.getBigUint64(247, true));
    if (big > 0) nPts = big;
  }
  if (fmt > 10 || recLen < 20 || nPts === 0)
    throw new RainCatchFailure('INVALID_LIDAR', `Unsupported or empty LAS (format ${fmt}, ${nPts} points).`, 'Use point formats 0–10 with at least one point.');
  if (dataOffset + nPts * recLen > buffer.byteLength + recLen)
    throw new RainCatchFailure('INVALID_LIDAR', 'The point records are truncated.', 'The file seems incomplete: download or export it again.');
  const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true);
  const ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);

  // CRS from VLRs: GeoKeyDirectory (34735) → ProjectedCSTypeGeoKey 3072 / GeographicTypeGeoKey 2048; fallback WKT
  let declared: string | null = null;
  let off = headerSize;
  for (let v = 0; v < nVlr && off + 54 <= buffer.byteLength; v++) {
    const recId = dv.getUint16(off + 18, true);
    const len = dv.getUint16(off + 20, true);
    const body = off + 54;
    if (recId === 34735) {
      const nKeys = dv.getUint16(body + 6, true);
      for (let k = 0; k < nKeys; k++) {
        const kb = body + 8 + k * 8;
        const keyId = dv.getUint16(kb, true);
        const val = dv.getUint16(kb + 6, true);
        if (keyId === 3072 && val && val !== 32767) declared = `EPSG:${val}`;
        if (keyId === 2048 && val && val !== 32767 && !declared) declared = `EPSG:${val}`;
      }
    } else if ((recId === 2112 || recId === 2111) && !declared) {
      const wkt = new TextDecoder().decode(new Uint8Array(buffer, body, Math.min(len, 8000)));
      const all = [...wkt.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/g)];
      if (all.length) declared = `EPSG:${all[all.length - 1][1]}`;
    }
    off = body + len;
  }
  const crs = needCrs(opt, declared, 'no GeoKey / WKT VLR found in the LAS header');

  opt.onProgress?.(0.2, 'Reading points');
  const clsOffset = fmt >= 6 ? 16 : 15;
  const x = new Float64Array(nPts), y = new Float64Array(nPts), zz = new Float32Array(nPts);
  const cls = new Uint8Array(nPts);
  let hasGround = false;
  for (let i = 0; i < nPts; i++) {
    const p = dataOffset + i * recLen;
    x[i] = dv.getInt32(p, true) * sx + ox;
    y[i] = dv.getInt32(p + 4, true) * sy + oy;
    zz[i] = dv.getInt32(p + 8, true) * sz + oz;
    const c = fmt >= 6 ? dv.getUint8(p + clsOffset) : dv.getUint8(p + clsOffset) & 0x1f;
    cls[i] = c;
    if (c === 2) hasGround = true;
    if (i % 500000 === 0) opt.onProgress?.(0.2 + 0.4 * (i / nPts), 'Reading points');
  }
  // keep ground (class 2) when the cloud is classified; otherwise all points except noise (7, 18) with min-per-cell
  const keep = new Uint8Array(nPts);
  let n = 0;
  for (let i = 0; i < nPts; i++) {
    const c = cls[i];
    if (c === 7 || c === 18) continue;
    if (hasGround && c !== 2) continue;
    keep[i] = 1;
    n++;
  }
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < nPts; i++) if (keep[i]) { px[j] = x[i]; py[j] = y[i]; pz[j] = zz[i]; j++; }
  opt.onProgress?.(0.65, 'Gridding points');
  const dem = pointsToGrid({ x: px, y: py, z: pz, n }, crs, hasGround ? 'mean' : 'min', name, 'las', opt);
  dem.pointCount = nPts;
  dem.kind = hasGround ? 'DTM' : 'DSM';
  dem.notes.push(
    hasGround
      ? `LAS ${(vMinor ? `1.${vMinor}` : '1.0')}: ${n.toLocaleString()} ground-classified points (class 2) of ${nPts.toLocaleString()} were used → bare-earth DTM.`
      : `LAS: the cloud is NOT ground-classified. The lowest point per cell was used as an approximation — this is closer to a DSM; vegetation/buildings may bias the terrain. Classify ground (PDAL SMRF / CSF / LAStools) for reliable results.`,
  );
  return dem;
}
