import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Site } from '../api';
import FieldMap from '../components/FieldMap';
import { useLanguage } from '../i18n';

export default function Sites() {
  const { t } = useLanguage();
  const navigate = useNavigate();
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
      setEditing(created);
      setDraftBoundary(created.boundary);
      setSiteName(created.name);
      setPlantType(created.plantType || '');
      setPlantAge(created.plantAge || '');
      setSoilType(created.soilType || '');
      await refresh();
      setStatus(t('sites.saved', { name: created.name }));
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.saveFailed'));
      setStatusKind('error');
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
      setEditing(updated);
      setDraftBoundary(updated.boundary);
      setSiteName(updated.name);
      setPlantType(updated.plantType || '');
      setPlantAge(updated.plantAge || '');
      setSoilType(updated.soilType || '');
      await refresh();
      setStatus(t('sites.updated', { name: updated.name }));
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.updateFailed'));
      setStatusKind('error');
    }
  }

  async function removeSite(site: Site) {
    if (!window.confirm(t('sites.confirmDelete', { name: site.name }))) return;
    try {
      setStatusKind('busy');
      await api.deleteSite(site._id);
      if (editing?._id === site._id) {
        setEditing(null);
        setDraftBoundary(null);
        setSiteName('');
        setPlantType('');
        setPlantAge('');
        setSoilType('');
      }
      await refresh();
      setStatus(t('sites.deleted', { name: site.name }));
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('sites.deleteFailed'));
      setStatusKind('error');
    }
  }

  function startNew() {
    setEditing(null);
    setDraftBoundary(null);
    setSiteName('');
    setPlantType('');
    setPlantAge('');
    setSoilType('');
    setStatus(t('sites.drawNew'));
    setStatusKind('');
  }

  function editSite(site: Site) {
    setEditing(site);
    setDraftBoundary(site.boundary);
    setSiteName(site.name);
    setPlantType(site.plantType || '');
    setPlantAge(site.plantAge || '');
    setSoilType(site.soilType || '');
    setStatus(t('sites.editing', { name: site.name }));
    setStatusKind('ok');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-hero">
          <p className="eyebrow">{t('sites.eyebrow')}</p>
          <h1>{t('sites.title')}</h1>
          <p className="sub">{t('sites.sub')}</p>
        </header>

        <div className={`status-banner ${statusKind || 'idle'}`}>{status}</div>

        <section className="panel composer">
          <div className="panel-head">
            <h2>{editing ? t('sites.edit') : t('sites.new')}</h2>
            {editing && (
              <button className="text-btn" type="button" onClick={startNew}>
                {t('sites.clear')}
              </button>
            )}
          </div>
          <label className="field">
            <span>{t('sites.name')}</span>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t('sites.namePh')}
            />
          </label>
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
          <p className="hint tight">{t('sites.hint')}</p>
          <div className="actions stack">
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
                  {t('sites.openAnalysis')}
                </button>
              </>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={!draftBoundary}
                onClick={saveNew}
              >
                {t('sites.saveSite')}
              </button>
            )}
            {!editing && (
              <button className="ghost" type="button" onClick={startNew}>
                {t('sites.reset')}
              </button>
            )}
          </div>
        </section>

        <section className="panel grow">
          <div className="panel-head">
            <h2>{t('sites.savedCount', { count: sites.length })}</h2>
            <button
              className="text-btn"
              type="button"
              onClick={async () => {
                try {
                  const demo = (await fetch('/demo.json').then((r) =>
                    r.json(),
                  )) as { siteId: string };
                  navigate(`/analysis/${demo.siteId}`);
                } catch {
                  setStatus(t('sites.demoMissing'));
                  setStatusKind('error');
                }
              }}
            >
              {t('sites.demo')}
            </button>
          </div>

          {sites.length === 0 ? (
            <div className="empty-block">
              <p>{t('sites.emptyTitle')}</p>
              <span>{t('sites.emptyHint')}</span>
            </div>
          ) : (
            <ul className="site-list">
              {sites.map((s) => {
                const active = editing?._id === s._id;
                return (
                  <li key={s._id} className={active ? 'active' : ''}>
                    <button
                      type="button"
                      className="site-main"
                      onClick={() => editSite(s)}
                    >
                      <strong>{s.name}</strong>
                      <span>
                        {active
                          ? t('sites.editingNow')
                          : s.plantType && s.plantAge && s.soilType
                            ? `${s.plantType} · ${s.plantAge} · ${s.soilType}`
                            : t('dash.cropIncomplete')}
                      </span>
                    </button>
                    <div className="site-actions">
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={() => navigate(`/analysis/${s._id}`)}
                      >
                        {t('sites.analyse')}
                      </button>
                      <button
                        type="button"
                        className="ghost compact danger"
                        onClick={() => removeSite(s)}
                      >
                        {t('sites.delete')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
      <FieldMap
        editable
        boundary={draftBoundary}
        onBoundaryChange={onBoundaryChange}
        onDrawHint={(hint) => {
          setStatus(hint);
          setStatusKind('busy');
        }}
      />
    </div>
  );
}
