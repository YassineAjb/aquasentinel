import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Site } from '../api';

const START: L.LatLngExpression = [36.8643806, 9.9736194];

type NdviOverlay = {
  url: string;
  bounds: [[number, number], [number, number]];
  opacity?: number;
};

type Props = {
  editable?: boolean;
  boundary?: Site['boundary'] | null;
  ndvi?: NdviOverlay | null;
  onBoundaryChange?: (feature: GeoJSON.Feature | null) => void;
  onDrawHint?: (hint: string) => void;
};

function ringKey(boundary: Site['boundary'] | null | undefined): string {
  if (!boundary?.coordinates?.[0]?.length) return '';
  return JSON.stringify(boundary.coordinates[0]);
}

function featureRingKey(feature: GeoJSON.Feature | null): string {
  if (!feature || feature.geometry.type !== 'Polygon') return '';
  return JSON.stringify(feature.geometry.coordinates[0]);
}

export default function FieldMap({
  editable = false,
  boundary = null,
  ndvi = null,
  onBoundaryChange,
  onDrawHint,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<L.Map | null>(null);
  const drawnItems = useRef<L.FeatureGroup | null>(null);
  const drawControl = useRef<L.Control.Draw | null>(null);
  const ndviOverlayRef = useRef<L.ImageOverlay | null>(null);
  const onBoundaryChangeRef = useRef(onBoundaryChange);
  const onDrawHintRef = useRef(onDrawHint);
  const editableRef = useRef(editable);
  const lastRingKeyRef = useRef('');

  onBoundaryChangeRef.current = onBoundaryChange;
  onDrawHintRef.current = onDrawHint;
  editableRef.current = editable;

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      boxZoom: false,
      doubleClickZoom: true,
      minZoom: 3,
      maxZoom: 18,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 0.8,
    }).setView(START, 14);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Esri World Imagery',
        minZoom: 3,
        maxZoom: 18,
        maxNativeZoom: 17,
        noWrap: true,
      },
    ).addTo(map);

    map.createPane('ndviPane');
    const ndviPane = map.getPane('ndviPane');
    if (ndviPane) {
      ndviPane.style.zIndex = '350';
      ndviPane.style.pointerEvents = 'none';
    }
    map.createPane('labelsPane');
    const labelsPane = map.getPane('labelsPane');
    if (labelsPane) {
      labelsPane.style.zIndex = '450';
      labelsPane.style.pointerEvents = 'none';
    }
    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Esri Boundaries & Places',
        minZoom: 3,
        maxZoom: 18,
        maxNativeZoom: 17,
        noWrap: true,
        pane: 'labelsPane',
        opacity: 0.95,
      },
    ).addTo(map);

    const group = new L.FeatureGroup().addTo(map);
    drawnItems.current = group;

    const shapeOpts = {
      color: '#e74c3c',
      weight: 2,
      fillColor: '#e74c3c',
      fillOpacity: 0,
    };
    const control = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: shapeOpts,
        },
        rectangle: {
          showArea: false,
          metric: false,
          shapeOptions: shapeOpts,
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: group,
        remove: true,
      },
    });
    drawControl.current = control;
    if (editableRef.current) {
      map.addControl(control);
    }

    const readFeature = (): GeoJSON.Feature | null => {
      const layers = group.getLayers();
      if (!layers.length) return null;
      const layer = layers[0] as L.Polygon;
      return layer.toGeoJSON() as GeoJSON.Feature;
    };

    const emitFeature = (feature: GeoJSON.Feature | null) => {
      lastRingKeyRef.current = featureRingKey(feature);
      onBoundaryChangeRef.current?.(feature);
    };

    const onCreated = (e: L.LeafletEvent) => {
      map.dragging.enable();
      const layer = (e as unknown as { layer: L.Layer }).layer;
      group.clearLayers();
      group.addLayer(layer);
      emitFeature(readFeature());
      onDrawHintRef.current?.(
        'Field ready — enter a name and Save site (or Update).',
      );
    };
    const onEdited = () => {
      emitFeature(readFeature());
      onDrawHintRef.current?.('Boundary edited — click Update site to save.');
    };
    const onDeleted = () => {
      emitFeature(null);
      onDrawHintRef.current?.('Drawing cleared — draw a polygon or rectangle.');
    };
    const onDrawStart = (e: L.LeafletEvent) => {
      // Prevent map pan from eating rectangle drag / polygon clicks
      map.dragging.disable();
      const kind = (e as unknown as { layerType?: string }).layerType;
      if (kind === 'rectangle') {
        onDrawHintRef.current?.(
          'Rectangle: click, hold, drag, then release.',
        );
      } else if (kind === 'polygon') {
        onDrawHintRef.current?.(
          'Polygon: click each corner, then click the first point to close.',
        );
      }
    };
    const onDrawStop = () => {
      map.dragging.enable();
    };

    map.on('draw:created', onCreated);
    map.on('draw:edited', onEdited);
    map.on('draw:deleted', onDeleted);
    map.on('draw:drawstart', onDrawStart);
    map.on('draw:drawstop', onDrawStop);

    mapObj.current = map;

    // Prefer the user's current location when no field boundary is loaded yet.
    let locateCancelled = false;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (locateCancelled || !mapObj.current) return;
          if (lastRingKeyRef.current) return;
          mapObj.current.setView(
            [pos.coords.latitude, pos.coords.longitude],
            15,
          );
        },
        () => {
          /* keep START fallback */
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
      );
    }

    // Grid layout often mounts at 0 height — fix tiles + click hit-testing
    const fixSize = () => map.invalidateSize();
    requestAnimationFrame(fixSize);
    const t1 = window.setTimeout(fixSize, 100);
    const t2 = window.setTimeout(fixSize, 400);
    const ro =
      typeof ResizeObserver !== 'undefined' && mapRef.current
        ? new ResizeObserver(fixSize)
        : null;
    if (mapRef.current && ro) ro.observe(mapRef.current);

    return () => {
      locateCancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      map.off('draw:created', onCreated);
      map.off('draw:edited', onEdited);
      map.off('draw:deleted', onDeleted);
      map.off('draw:drawstart', onDrawStart);
      map.off('draw:drawstop', onDrawStop);
      map.dragging.enable();
      map.remove();
      mapObj.current = null;
      drawnItems.current = null;
      drawControl.current = null;
      ndviOverlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    const control = drawControl.current;
    if (!map || !control) return;
    const has = Boolean(
      (control as unknown as { _map?: L.Map | null })._map,
    );
    if (editable && !has) {
      map.addControl(control);
    } else if (!editable && has) {
      map.removeControl(control);
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [editable]);

  useEffect(() => {
    const map = mapObj.current;
    const group = drawnItems.current;
    if (!map || !group) return;

    const nextKey = ringKey(boundary);
    if (nextKey === lastRingKeyRef.current) return;

    group.clearLayers();
    lastRingKeyRef.current = nextKey;

    if (!boundary) return;

    const layer = L.polygon(
      boundary.coordinates[0].map(
        ([lon, lat]) => [lat, lon] as L.LatLngExpression,
      ),
      {
        color: '#e74c3c',
        weight: 2,
        fillColor: '#e74c3c',
        fillOpacity: 0,
      },
    );
    group.addLayer(layer);
    try {
      map.fitBounds(layer.getBounds(), { padding: [48, 48], maxZoom: 18 });
    } catch {
      /* empty geom */
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [boundary]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (ndviOverlayRef.current) {
      map.removeLayer(ndviOverlayRef.current);
      ndviOverlayRef.current = null;
    }
    if (!ndvi?.url || !ndvi.bounds) return;
    ndviOverlayRef.current = L.imageOverlay(ndvi.url, ndvi.bounds, {
      opacity: ndvi.opacity ?? 0.78,
      interactive: false,
      className: 's2-overlay',
      pane: 'ndviPane',
    }).addTo(map);
  }, [ndvi]);

  return <div className="map-wrap" ref={mapRef} />;
}
