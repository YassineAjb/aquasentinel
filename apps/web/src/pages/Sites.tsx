import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Site } from '../api';
import FieldMap from '../components/FieldMap';

export default function Sites() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState('');
  const [editing, setEditing] = useState<Site | null>(null);
  const [draftBoundary, setDraftBoundary] = useState<Site['boundary'] | null>(
    null,
  );
  const [status, setStatus] = useState(
    'Draw a field on the map, name it, then save.',
  );
  const [statusKind, setStatusKind] = useState<'ok' | 'busy' | 'error' | ''>(
    '',
  );

  const refresh = useCallback(async () => {
    const list = await api.listSites();
    setSites(list);
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setStatus('Could not load sites — is the API running?');
      setStatusKind('error');
    });
  }, [refresh]);

  function onBoundaryChange(feature: GeoJSON.Feature | null) {
    if (!feature || feature.geometry.type !== 'Polygon') {
      setDraftBoundary(null);
      return;
    }
    setDraftBoundary(feature.geometry as Site['boundary']);
    setStatus(
      editing
        ? 'Boundary ready — save your changes.'
        : 'Field ready — add a name and save.',
    );
    setStatusKind('ok');
  }

  async function saveNew() {
    if (!draftBoundary) {
      setStatus('Draw a polygon or rectangle first.');
      setStatusKind('error');
      return;
    }
    try {
      setStatusKind('busy');
      setStatus('Saving…');
      const created = await api.createSite({
        name: siteName.trim() || 'Untitled field',
        boundary: draftBoundary,
      });
      setEditing(created);
      setDraftBoundary(created.boundary);
      setSiteName(created.name);
      await refresh();
      setStatus(`Saved “${created.name}”.`);
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
      setStatusKind('error');
    }
  }

  async function updateExisting() {
    if (!editing || !draftBoundary) {
      setStatus('Nothing to update.');
      setStatusKind('error');
      return;
    }
    try {
      setStatusKind('busy');
      setStatus('Updating…');
      const updated = await api.updateSite(editing._id, {
        name: siteName.trim() || editing.name,
        boundary: draftBoundary,
      });
      setEditing(updated);
      setDraftBoundary(updated.boundary);
      setSiteName(updated.name);
      await refresh();
      setStatus(`Updated “${updated.name}”.`);
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Update failed');
      setStatusKind('error');
    }
  }

  async function removeSite(site: Site) {
    if (!window.confirm(`Delete “${site.name}” and its scans?`)) return;
    try {
      setStatusKind('busy');
      await api.deleteSite(site._id);
      if (editing?._id === site._id) {
        setEditing(null);
        setDraftBoundary(null);
        setSiteName('');
      }
      await refresh();
      setStatus(`Deleted “${site.name}”.`);
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
      setStatusKind('error');
    }
  }

  function startNew() {
    setEditing(null);
    setDraftBoundary(null);
    setSiteName('');
    setStatus('Draw a new field on the map.');
    setStatusKind('');
  }

  function editSite(site: Site) {
    setEditing(site);
    setDraftBoundary(site.boundary);
    setSiteName(site.name);
    setStatus(`Editing “${site.name}”.`);
    setStatusKind('ok');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-hero">
          <p className="eyebrow">Farmer workspace</p>
          <h1>Your sites</h1>
          <p className="sub">
            Draw a field boundary, save it, then open Analysis to scan NDVI.
          </p>
        </header>

        <div className={`status-banner ${statusKind || 'idle'}`}>{status}</div>

        <section className="panel composer">
          <div className="panel-head">
            <h2>{editing ? 'Edit site' : 'New site'}</h2>
            {editing && (
              <button className="text-btn" type="button" onClick={startNew}>
                Clear
              </button>
            )}
          </div>
          <label className="field">
            <span>Name</span>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. North plot"
            />
          </label>
          <p className="hint tight">
            Map tools: rectangle = drag · polygon = click corners
          </p>
          <div className="actions stack">
            {editing ? (
              <>
                <button
                  className="primary"
                  type="button"
                  disabled={!draftBoundary}
                  onClick={updateExisting}
                >
                  Save changes
                </button>
                <button
                  className="primary soft"
                  type="button"
                  onClick={() => navigate(`/analysis/${editing._id}`)}
                >
                  Open analysis →
                </button>
              </>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={!draftBoundary}
                onClick={saveNew}
              >
                Save site
              </button>
            )}
            {!editing && (
              <button className="ghost" type="button" onClick={startNew}>
                Reset drawing
              </button>
            )}
          </div>
        </section>

        <section className="panel grow">
          <div className="panel-head">
            <h2>Saved ({sites.length})</h2>
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
                  setStatus('Demo cache missing.');
                  setStatusKind('error');
                }
              }}
            >
              Demo
            </button>
          </div>

          {sites.length === 0 ? (
            <div className="empty-block">
              <p>No sites yet</p>
              <span>Use the map tools on the right to draw your first field.</span>
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
                      <span>{active ? 'Editing now' : 'Click to edit boundary'}</span>
                    </button>
                    <div className="site-actions">
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={() => navigate(`/analysis/${s._id}`)}
                      >
                        Analyse
                      </button>
                      <button
                        type="button"
                        className="ghost compact danger"
                        onClick={() => removeSite(s)}
                      >
                        Delete
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
