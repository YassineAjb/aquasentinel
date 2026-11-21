import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Site } from '../api';
import { legendFor, renderTerrainDataUrl, type VizMode } from '../raincatch/renderOverlay';
import type { HarvestCandidate, TerrainAnalysis } from '../raincatch/types';

type Props = {
  site: Site | null;
  analysis: TerrainAnalysis | null;
  floodScore?: Float32Array | null;
  waterDepth?: Float32Array | null;
  candidates?: HarvestCandidate[];
  selectedCandidateId?: string | null;
  mode: VizMode;
  opacity: number;
  onPickCandidate?: (id: string) => void;
};

const START: L.LatLngExpression = [36.8644, 9.9736];

export default function RainCatchMap({
  site,
  analysis,
  floodScore,
  waterDepth,
  candidates = [],
  selectedCandidateId,
  mode,
  opacity,
  onPickCandidate,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const boundaryRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPickCandidate);
  onPickRef.current = onPickCandidate;

  const overlayUrl = useMemo(() => {
    if (!analysis) return null;
    return renderTerrainDataUrl(analysis, mode, floodScore, waterDepth);
  }, [analysis, mode, floodScore, waterDepth]);

  const legend = legendFor(mode);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 18,
    }).setView(START, 14);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Esri',
        maxNativeZoom: 17,
        maxZoom: 18,
      },
    ).addTo(map);

    map.createPane('terrainPane');
    const pane = map.getPane('terrainPane');
    if (pane) {
      pane.style.zIndex = '350';
      pane.style.pointerEvents = 'none';
    }

    markersRef.current = L.layerGroup().addTo(map);
    mapObj.current = map;

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapObj.current = null;
      overlayRef.current = null;
      boundaryRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Site boundary + fit
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (boundaryRef.current) {
      map.removeLayer(boundaryRef.current);
      boundaryRef.current = null;
    }
    const ring = site?.boundary?.coordinates?.[0];
    if (!ring?.length) return;
    const latlngs = ring.map(([lon, lat]) => L.latLng(lat, lon));
    const poly = L.polygon(latlngs, {
      color: '#ffe08a',
      weight: 2.5,
      opacity: 0.95,
      fillOpacity: 0.04,
      fillColor: '#ffe08a',
      dashArray: undefined,
    }).addTo(map);
    boundaryRef.current = poly;
    map.fitBounds(poly.getBounds().pad(0.18), { animate: true });
  }, [site]);

  // Terrain image overlay
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
    if (!analysis || !overlayUrl) return;
    const b = analysis.bounds;
    const bounds = L.latLngBounds(
      [b.south, b.west],
      [b.north, b.east],
    );
    const overlay = L.imageOverlay(overlayUrl, bounds, {
      opacity,
      pane: 'terrainPane',
      interactive: false,
    }).addTo(map);
    overlayRef.current = overlay;
    if (!site) map.fitBounds(bounds.pad(0.12), { animate: true });
  }, [analysis, overlayUrl, opacity, site]);

  useEffect(() => {
    overlayRef.current?.setOpacity(opacity);
  }, [opacity]);

  // Harvest markers
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const c of candidates) {
      const selected = c.id === selectedCandidateId;
      const color = c.blocked
        ? '#ffb4a8'
        : c.suitability.startsWith('Excellent')
          ? '#3ecf6a'
          : c.suitability.startsWith('Good')
            ? '#9ec5a3'
            : '#ffe08a';
      const marker = L.circleMarker([c.lat, c.lon], {
        radius: selected ? 9 : 6,
        color: selected ? '#fff' : 'rgba(0,0,0,0.55)',
        weight: selected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      });
      marker.bindTooltip(
        `<strong>${c.id}</strong> · ${c.suitability.replace(' Candidate', '')}<br/>Harvest ${c.harvestM3.toFixed(0)} m³`,
        { direction: 'top', opacity: 0.95 },
      );
      marker.on('click', () => onPickRef.current?.(c.id));
      group.addLayer(marker);
    }
  }, [candidates, selectedCandidateId]);

  return (
    <div className="rc-map-root">
      <div ref={mapRef} className="rc-leaflet" />
      {analysis && (
        <div className="rc-legend" aria-hidden>
          <span className="rc-legend-title">{legend.title}</span>
          <div className={`rc-legend-bar mode-${mode}`} />
          <div className="rc-legend-ends">
            <span>{legend.low}</span>
            <span>{legend.high}</span>
          </div>
          {mode === 'elevation' && (
            <p className="rc-legend-meta">
              {analysis.elevation.min.toFixed(1)}–{analysis.elevation.max.toFixed(1)} m
            </p>
          )}
        </div>
      )}
    </div>
  );
}
