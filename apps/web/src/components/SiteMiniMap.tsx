import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Site } from '../api';

type Props = {
  boundary: Site['boundary'];
  className?: string;
};

export default function SiteMiniMap({ boundary, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const ring = boundary?.coordinates?.[0];
    if (!ring?.length) return;

    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 17, maxZoom: 18 },
    ).addTo(map);

    const latLngs = ring.map(
      ([lon, lat]) => [lat, lon] as L.LatLngExpression,
    );
    const poly = L.polygon(latLngs, {
      color: '#7ed957',
      weight: 2,
      fillColor: '#2f9e44',
      fillOpacity: 0.25,
    }).addTo(map);

    map.fitBounds(poly.getBounds(), { padding: [12, 12], maxZoom: 17 });
    mapRef.current = map;

    const fix = () => map.invalidateSize();
    requestAnimationFrame(fix);
    const t = window.setTimeout(fix, 120);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [boundary]);

  return <div ref={ref} className={className || 'site-mini-map'} />;
}
