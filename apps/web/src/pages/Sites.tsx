import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { api, type Site } from '../api';
import FieldMap from '../components/FieldMap';
import { useConfirm } from '../confirm';
import { useLanguage } from '../i18n';

type DockPos = { x: number; y: number };

export default function Sites() {
  const { t } = useLanguage();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dockPos, setDockPos] = useState<DockPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState('');
  const [plantType, setPlantType] = useState('');
  const [plantAge, setPlantAge] = useState('');
  const [soilType, setSoilType] = useState('');
  const [editing, setEditing] = useState<Site | null>(null);
  const [draftBoundary, setDraftBoundary] = useState<Site['boundary'] | null>(
    null,
  );
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'busy' | 'error' | ''>(
    '',
  );

  const clampDockPos = useCallback((x: number, y: number): DockPos => {
    const root = rootRef.current;
    const dock = dockRef.current;
    if (!root || !dock) return { x, y };
    const pad = 8;
    const maxX = Math.max(pad, root.clientWidth - dock.offsetWidth - pad);
    const maxY = Math.max(pad, root.clientHeight - dock.offsetHeight - pad);
    return {
      x: Math.min(maxX, Math.max(pad, x)),
      y: Math.min(maxY, Math.max(pad, y)),
    };
  }, []);

  function onDockPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const dock = dockRef.current;
    const root = rootRef.current;
    if (!dock || !root) return;
    const rect = dock.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const origX = rect.left - rootRect.left;
    const origY = rect.top - rootRect.top;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDockPos({ x: origX, y: origY });
  }

  function onDockPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setDockPos(
      clampDockPos(
        drag.origX + (e.clientX - drag.startX),
        drag.origY + (e.clientY - drag.startY),
      ),
    );
  }

  function onDockPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  const refresh = useCallback(async () => {
    const list = await api.listSites();
    setSites(list);
  }, []);

  useEffect(() => {
    setStatus(t('sites.drawHint'));
  }, [t]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus(t('sites.loadError'));
      setStatusKind('error');
    });
  }, [refresh, t]);

  useEffect(() => {
    if (!dockPos) return;
    const onResize = () => {
      setDockPos((pos) => (pos ? clampDockPos(pos.x, pos.y) : pos));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dockPos, clampDockPos]);

  function fillForm(site: Site | null) {
    if (!site) {
      setEditing(null);
      setDraftBoundary(null);
      setSiteName('');
      setPlantType('');
      setPlantAge('');
      setSoilType('');
      return;
    }
    setEditing(site);
    setDraftBoundary(site.boundary);
    setSiteName(site.name);
    setPlantType(site.plantType || '');
    setPlantAge(site.plantAge || '');
    setSoilType(site.soilType || '');
  }

  function startNew() {
    fillForm(null);
    setStatus(t('sites.drawNew'));
    setStatusKind('');
  }

  function selectSite(id: string) {
    if (!id) {
      startNew();
      return;
    }
    const site = sites.find((s) => s._id === id);
    if (!site) return;
    fillForm(site);
    setStatus(t('sites.editing', { name: site.name }));
    setStatusKind('ok');
  }

  function onBoundaryChange(feature: GeoJSON.Feature | null) {
    if (!feature || feature.geometry.type !== 'Polygon') {
      setDraftBoundary(null);
      return;
    }
    setDraftBoundary(feature.geometry as Site['boundary']);
    setStatus(
      editing ? t('sites.boundaryReadyEdit') : t('sites.boundaryReadyNew'),
    );
    setStatusKind('ok');
  }

  async function saveNew() {
    if (!draftBoundary) {
      setStatus(t('sites.drawFirst'));
      setStatusKind('error');
      return;
    }
    try {
      setStatusKind('busy');
      setStatus(t('sites.saving'));
      const created = await api.createSite({
        name: siteName.trim() || t('sites.untitled'),
        boundary: draftBoundary,
        plantType: plantType || undefined,
        plantAge: plantAge || undefined,
        soilType: soilType || undefined,
      });
      fillForm(created);
      await refresh();
      setStatus(t('sites.saved', { name: created.name }));
      setStatusKind('ok');
      confirm(t('confirm.fieldSaved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.saveFailed'));
      setStatusKind('error');
      confirm(t('confirm.failed'), 'error');
    }
  }

  async function updateExisting() {
    if (!editing || !draftBoundary) {
      setStatus(t('sites.nothingUpdate'));
      setStatusKind('error');
      return;
    }
    try {
      setStatusKind('busy');
      setStatus(t('sites.updating'));
      const updated = await api.updateSite(editing._id, {
        name: siteName.trim() || editing.name,
        boundary: draftBoundary,
        plantType: plantType || undefined,
        plantAge: plantAge || undefined,
        soilType: soilType || undefined,
      });
      fillForm(updated);
      await refresh();
      setStatus(t('sites.updated', { name: updated.name }));
      setStatusKind('ok');
      confirm(t('confirm.fieldUpdated'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.updateFailed'));
      setStatusKind('error');
      confirm(t('confirm.failed'), 'error');
    }
  }

  async function removeSite() {
    if (!editing) return;
    const name = editing.name;
    if (!window.confirm(t('sites.confirmDelete', { name }))) {
      return;
    }
    try {
      setStatusKind('busy');
      await api.deleteSite(editing._id);
      await refresh();
      fillForm(null);
      setStatus(t('sites.deleted', { name }));
      setStatusKind('ok');
      confirm(t('confirm.fieldDeleted'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.deleteFailed'));
      setStatusKind('error');
      confirm(t('confirm.failed'), 'error');
    }
  }

  return (
    <div className="sites-manage" ref={rootRef}>
      <FieldMap
        editable
        boundary={draftBoundary}
        onBoundaryChange={onBoundaryChange}
        onDrawHint={(hint) => {
          setStatus(hint);
          setStatusKind('busy');
        }}
      />

      <div
        className={`sites-dock${dragging ? ' is-dragging' : ''}${dockPos ? ' is-placed' : ''}`}
        ref={dockRef}
        style={
          dockPos
            ? { left: dockPos.x, top: dockPos.y, right: 'auto' }
            : undefined
        }
      >
        <header
          className="sites-dock-head"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={onDockPointerUp}
          onPointerCancel={onDockPointerUp}
        >
          <div className="sites-dock-drag">
            <GripVertical
              className="float-dock-grip-icon"
              size={18}
              strokeWidth={2}
              aria-hidden
            />
            <div>
              <p className="eyebrow">{t('sites.eyebrow')}</p>
              <h1>{t('sites.title')}</h1>
            </div>
          </div>
          <p className={`sites-dock-status ${statusKind || 'idle'}`}>{status}</p>
        </header>

        <div className="sites-dock-picker">
          <label className="field sites-dock-pick">
            <span>{t('sites.pickLabel')}</span>
            <select
              value={editing?._id ?? ''}
              onChange={(e) => selectSite(e.target.value)}
            >
              <option value="">{t('sites.pickNew')}</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {editing && (
            <button
              className="ghost compact"
              type="button"
              onClick={startNew}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {t('sites.new')}
            </button>
          )}
        </div>

        <div className="sites-dock-form">
          <label className="field">
            <span>{t('sites.name')}</span>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t('sites.namePh')}
            />
          </label>

          <div className="sites-dock-grid">
            <label className="field">
              <span>{t('sites.plantType')}</span>
              <select
                value={plantType}
                onChange={(e) => setPlantType(e.target.value)}
              >
                <option value="">{t('sites.select')}</option>
                <option value="olivier">{t('sites.plant.olivier')}</option>
                <option value="ble">{t('sites.plant.ble')}</option>
                <option value="tomate">{t('sites.plant.tomate')}</option>
                <option value="agrumes">{t('sites.plant.agrumes')}</option>
                <option value="autre">{t('sites.plant.autre')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('sites.plantAge')}</span>
              <select
                value={plantAge}
                onChange={(e) => setPlantAge(e.target.value)}
              >
                <option value="">{t('sites.select')}</option>
                <option value="jeune">{t('sites.age.jeune')}</option>
                <option value="vegetatif">{t('sites.age.vegetatif')}</option>
                <option value="mature">{t('sites.age.mature')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('sites.soilType')}</span>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
              >
                <option value="">{t('sites.select')}</option>
                <option value="sableux">{t('sites.soil.sableux')}</option>
                <option value="limoneux">{t('sites.soil.limoneux')}</option>
                <option value="argileux">{t('sites.soil.argileux')}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="sites-dock-actions">
          {editing ? (
            <>
              <button
                className="primary"
                type="button"
                disabled={!draftBoundary}
                onClick={updateExisting}
              >
                {t('sites.saveChanges')}
              </button>
              <button
                className="primary soft"
                type="button"
                onClick={() => navigate(`/analysis/${editing._id}`)}
              >
                {t('sites.analyse')}
              </button>
              <button
                className="ghost danger"
                type="button"
                onClick={removeSite}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden />
                {t('sites.delete')}
              </button>
            </>
          ) : (
            <>
              <button
                className="primary"
                type="button"
                disabled={!draftBoundary}
                onClick={saveNew}
              >
                {t('sites.saveSite')}
              </button>
              <button className="ghost" type="button" onClick={startNew}>
                {t('sites.reset')}
              </button>
            </>
          )}
        </div>

        <p className="hint tight">{t('sites.hint')}</p>
      </div>
    </div>
  );
}
