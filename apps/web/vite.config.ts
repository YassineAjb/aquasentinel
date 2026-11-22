import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const UPSTREAM = 'https://www.senterfarms.com/programs/csrx'
const GEM_PROXY = 'https://cutsheetrx-gem.travissenter.workers.dev/'

// Anchor after cfDone — upstream may change cfDone body (split/dam modes), so don't depend on it.
const CF_HOOK_ANCHOR = `  // fetch a lidar grid covering the polygon
  function cfLoad() {`

const CF_HOOK_INJECT = `  window.__AQUA_LOAD_FIELD__ = function (latlngs) {
    if (!latlngs || latlngs.length < 3) return false;
    try { cfClear(); } catch (e) {}
    cf.pts = latlngs.map(function (p) { return L.latLng(+p[0], +p[1]); });
    cf.markers = [];
    if (cf.poly) { try { cf.poly.remove(); } catch (e) {} cf.poly = null; }
    cf.poly = L.polygon(cf.pts, { color: "#ffd84d", weight: 2.5, fill: false, interactive: false }).addTo(map);
    try { map.fitBounds(cf.poly.getBounds(), { padding: [48, 48], maxZoom: 17 }); } catch (e) {}
    cfLoad();
    return true;
  };
  window.__AQUA_OPEN_FLOW__ = function () {
    try {
      if (!cf.grid) {
        if (typeof toast === "function") toast("Field elevation is still loading or failed — wait for the Field panel, then try Flow again.");
        return false;
      }
      openFlow();
      return true;
    } catch (e) {
      return false;
    }
  };
` + CF_HOOK_ANCHOR

function contentTypeFor(path: string) {
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json; charset=utf-8'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.wasm')) return 'application/wasm'
  return 'application/octet-stream'
}

/** Proxy CutSheetRX page, JS assets, and GEM elevation worker (CORS-gated to senterfarms). */
function csrxEmbedPlugin(): Plugin {
  return {
    name: 'csrx-embed',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/csrx-embed')) return next()
        try {
          const [pathname, query = ''] = req.url.split('?')
          const rel = (pathname || '').replace(/^\/csrx-embed\/?/, '')

          // GEM-15 worker only allows senterfarms.com — proxy it for localhost
          if (rel === 'gem-proxy' || rel.startsWith('gem-proxy/')) {
            const target = `${GEM_PROXY}${query ? `?${query}` : ''}`
            const upstream = await fetch(target, {
              headers: {
                Origin: 'https://www.senterfarms.com',
                Referer: 'https://www.senterfarms.com/programs/csrx/',
                Accept: req.headers.accept || '*/*',
              },
            })
            const buf = Buffer.from(await upstream.arrayBuffer())
            res.statusCode = upstream.status
            const ct = upstream.headers.get('content-type')
            if (ct) res.setHeader('Content-Type', ct)
            const xgem = upstream.headers.get('x-gem')
            if (xgem) res.setHeader('X-GEM', xgem)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(buf)
            return
          }

          const isPage = !rel || rel === 'index.html'
          const upstreamUrl = isPage
            ? `${UPSTREAM}/`
            : `${UPSTREAM}/${rel}${query ? `?${query}` : ''}`

          const upstream = await fetch(upstreamUrl)
          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.end(`CutSheetRX upstream error (${upstream.status})`)
            return
          }

          if (isPage) {
            let html = await upstream.text()
            html = html.replace(
              'var map = L.map("map", { maxZoom: 20 })',
              'var map = (window.__AQUA_CSR_MAP__ = L.map("map", { maxZoom: 20 }))',
            )
            if (html.includes(CF_HOOK_ANCHOR) && !html.includes('__AQUA_LOAD_FIELD__')) {
              html = html.replace(CF_HOOK_ANCHOR, CF_HOOK_INJECT)
            }
            // Bust addon cache and point GEM worker through our proxy-friendly URLs
            html = html
              .replaceAll('world.js?v=', 'world.js?v=aqua-')
              .replaceAll('flow.js?v=', 'flow.js?v=aqua-')
              .replaceAll('canada.js?v=', 'canada.js?v=aqua-')
              .replaceAll('europe.js?v=', 'europe.js?v=aqua-')
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(html)
            return
          }

          let body: Buffer | string = Buffer.from(await upstream.arrayBuffer())
          // Rewrite GEM worker URL so Tunisia/world elevation works on localhost
          if (rel.toLowerCase().endsWith('world.js')) {
            body = body
              .toString('utf8')
              .replaceAll(
                'https://cutsheetrx-gem.travissenter.workers.dev/',
                '/csrx-embed/gem-proxy/',
              )
          }

          res.statusCode = 200
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || contentTypeFor(rel.toLowerCase()),
          )
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        } catch {
          res.statusCode = 502
          res.end('CutSheetRX upstream unavailable')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), csrxEmbedPlugin()],
})
