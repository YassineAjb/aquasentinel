import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  elevColor,
  floodColor,
  legendFor,
  slopeColor,
  type VizMode,
} from '../raincatch/renderOverlay';
import type { HarvestCandidate, TerrainAnalysis } from '../raincatch/types';

type Props = {
  analysis: TerrainAnalysis;
  floodScore?: Float32Array | null;
  waterDepth?: Float32Array | null;
  candidates?: HarvestCandidate[];
  selectedCandidateId?: string | null;
  mode: VizMode;
  heightStretch: number;
  onPickCandidate?: (id: string) => void;
};

function cellColor(
  analysis: TerrainAnalysis,
  i: number,
  mode: VizMode,
  floodScore: Float32Array | null | undefined,
  waterDepth: Float32Array | null | undefined,
  floodMax: number,
  depthMax: number,
): [number, number, number] {
  const { z, hillshade, slope, elevation } = analysis;
  const zi = z[i];
  if (!Number.isFinite(zi)) return [20, 24, 22];
  const shade = 0.5 + 0.5 * (Number.isFinite(hillshade[i]) ? hillshade[i] : 0.65);
  const zMin = elevation.min;
  const zRange = Math.max(1e-6, elevation.max - elevation.min);
  const slopeMax = Math.max(1e-6, analysis.slopeStats.maxDeg || 30);
  let rgb: [number, number, number];
  if (mode === 'flood' && floodScore) {
    rgb = floodColor(Math.min(1, floodScore[i] / floodMax));
  } else if (mode === 'water' && waterDepth) {
    const d = Math.min(1, waterDepth[i] / depthMax);
    const base = elevColor((zi - zMin) / zRange);
    rgb = [
      base[0] * (1 - d * 0.85) + 35 * d,
      base[1] * (1 - d * 0.85) + 150 * d,
      base[2] * (1 - d * 0.85) + 230 * d,
    ];
  } else if (mode === 'slope') {
    rgb = slopeColor(Math.min(1, slope[i] / slopeMax));
  } else {
    rgb = elevColor((zi - zMin) / zRange);
  }
  return [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
}

export default function RainCatchTerrain3D({
  analysis,
  floodScore,
  waterDepth,
  candidates = [],
  selectedCandidateId,
  mode,
  heightStretch,
  onPickCandidate,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stretchRef = useRef(heightStretch);
  const modeRef = useRef(mode);
  const pickRef = useRef(onPickCandidate);
  stretchRef.current = heightStretch;
  modeRef.current = mode;
  pickRef.current = onPickCandidate;

  const sceneApi = useRef<{
    mesh: THREE.Mesh | null;
    waterMesh: THREE.Mesh | null;
    markers: THREE.Group;
    baseHeights: Float32Array;
    rebuildColors: () => void;
    applyStretch: () => void;
    placeMarkers: () => void;
  } | null>(null);

  // Init scene once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121816);
    scene.fog = new THREE.Fog(0x121816, 400, 1400);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / Math.max(1, mount.clientHeight),
      0.5,
      5000,
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 40;
    controls.maxDistance = 900;

    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x2a3a28, 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(120, 220, 80);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.35);
    fill.position.set(-80, 60, -100);
    scene.add(fill);

    const markers = new THREE.Group();
    scene.add(markers);

    const { cols, rows, z, cellSizeX, cellSizeY, elevation } = analysis;
    const widthM = cols * cellSizeX;
    const heightM = rows * cellSizeY;
    const geo = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const baseHeights = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const zMin = elevation.min;
    let floodMax = 1;
    if (floodScore) {
      for (let i = 0; i < floodScore.length; i++) {
        if (Number.isFinite(floodScore[i])) floodMax = Math.max(floodMax, floodScore[i]);
      }
    }
    let depthMax = 0.05;
    if (waterDepth) {
      for (let i = 0; i < waterDepth.length; i++) {
        if (Number.isFinite(waterDepth[i])) depthMax = Math.max(depthMax, waterDepth[i]);
      }
    }

    // PlaneGeometry vertices are row-major from top-left in local XY before rotate;
    // after rotateX(-90): y is up. Index order: for v from rows-1..0, u 0..cols-1 typically
    // Three.js PlaneGeometry: segmentsX = cols-1, segmentsY = rows-1
    // vertices laid out: y from +height/2 to -height/2, x from -width/2 to +width/2
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const vi = iy * cols + ix;
        // Map three.js row iy (0 = north/+Z in plane before rotate → +height/2) to DEM row
        const r = iy;
        const c = ix;
        const di = r * cols + c;
        const elev = Number.isFinite(z[di]) ? z[di] : zMin;
        baseHeights[vi] = elev - zMin;
        pos.setY(vi, baseHeights[vi] * stretchRef.current);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Water sheet: same topology, raised by ponding depth
    const waterGeo = geo.clone();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3aa0d8,
      transparent: true,
      opacity: 0.45,
      roughness: 0.25,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.visible = false;
    scene.add(waterMesh);

    const applyStretch = () => {
      const s = stretchRef.current;
      const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const wp = waterMesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let vi = 0; vi < p.count; vi++) {
        const r = (vi / cols) | 0;
        const c = vi - r * cols;
        const di = r * cols + c;
        const base = baseHeights[vi];
        const pond = waterDepth && Number.isFinite(waterDepth[di]) ? waterDepth[di] : 0;
        p.setY(vi, base * s);
        wp.setY(vi, base * s + pond * Math.max(2, s * 0.35));
      }
      p.needsUpdate = true;
      wp.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      waterMesh.geometry.computeVertexNormals();
      waterMesh.visible = modeRef.current === 'water' && !!waterDepth;
    };

    const rebuildColors = () => {
      const colAttr = mesh.geometry.attributes.color as THREE.BufferAttribute;
      let fMax = 1;
      if (floodScore) {
        for (let i = 0; i < floodScore.length; i++) {
          if (Number.isFinite(floodScore[i])) fMax = Math.max(fMax, floodScore[i]);
        }
      }
      let dMax = 0.05;
      if (waterDepth) {
        for (let i = 0; i < waterDepth.length; i++) {
          if (Number.isFinite(waterDepth[i])) dMax = Math.max(dMax, waterDepth[i]);
        }
      }
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const vi = iy * cols + ix;
          const di = iy * cols + ix;
          const [r, g, b] = cellColor(
            analysis,
            di,
            modeRef.current,
            floodScore,
            waterDepth,
            fMax,
            dMax,
          );
          colAttr.setXYZ(vi, r / 255, g / 255, b / 255);
        }
      }
      colAttr.needsUpdate = true;
      waterMesh.visible = modeRef.current === 'water' && !!waterDepth;
      applyStretch();
    };

    const placeMarkers = () => {
      while (markers.children.length > 0) {
        const ch = markers.children[0];
        markers.remove(ch);
        if (ch instanceof THREE.Mesh) {
          ch.geometry.dispose();
          (ch.material as THREE.Material).dispose();
        }
      }
      const s = stretchRef.current;
      const halfW = widthM / 2;
      const halfH = heightM / 2;
      for (const cand of candidates) {
        const x = -halfW + (cand.c + 0.5) * cellSizeX;
        const zPos = -halfH + (cand.r + 0.5) * cellSizeY;
        const di = cand.r * cols + cand.c;
        const elev = Number.isFinite(z[di]) ? z[di] - zMin : 0;
        const y = elev * s + 2.5;
        const selected = cand.id === selectedCandidateId;
        const color = cand.blocked
          ? 0xffb4a8
          : cand.suitability.startsWith('Excellent')
            ? 0x3ecf6a
            : cand.suitability.startsWith('Good')
              ? 0x9ec5a3
              : 0xffe08a;
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(selected ? 3.2 : 2.2, 14, 12),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: selected ? 0.35 : 0.12,
            roughness: 0.4,
          }),
        );
        m.position.set(x, y, zPos);
        m.userData.candidateId = cand.id;
        markers.add(m);
      }
    };

    rebuildColors();
    placeMarkers();

    // Camera framing
    const midH = ((elevation.max - elevation.min) * stretchRef.current) / 2;
    const span = Math.max(widthM, heightM);
    camera.position.set(span * 0.55, midH + span * 0.45, span * 0.65);
    controls.target.set(0, midH * 0.35, 0);
    controls.update();

    sceneApi.current = {
      mesh,
      waterMesh,
      markers,
      baseHeights,
      rebuildColors,
      applyStretch,
      placeMarkers,
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markers.children, false);
      if (hits[0]?.object.userData.candidateId) {
        pickRef.current?.(hits[0].object.userData.candidateId as string);
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneApi.current = null;
    };
    // analysis identity drives full rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  useEffect(() => {
    sceneApi.current?.rebuildColors();
  }, [mode, floodScore, waterDepth]);

  useEffect(() => {
    sceneApi.current?.applyStretch();
    sceneApi.current?.placeMarkers();
  }, [heightStretch, candidates, selectedCandidateId]);

  const legend = legendFor(mode);

  return (
    <div className="rc-3d-wrap">
      <div className="rc-3d-root" ref={mountRef} />
      <div className="rc-legend" aria-hidden>
        <span className="rc-legend-title">{legend.title}</span>
        <div className={`rc-legend-bar mode-${mode}`} />
        <div className="rc-legend-ends">
          <span>{legend.low}</span>
          <span>{legend.high}</span>
        </div>
        <p className="rc-legend-meta">{heightStretch}× height</p>
      </div>
      <p className="rc-3d-hint">Drag to orbit · scroll to zoom</p>
    </div>
  );
}
