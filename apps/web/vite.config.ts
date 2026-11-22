import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/** Proxy CutSheetRX HTML and expose Leaflet map as window.__AQUA_CSR_MAP__ */
function csrxEmbedPlugin(): Plugin {
  return {
    name: 'csrx-embed',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/csrx-embed')) return next()
        try {
          const upstream = await fetch('https://www.senterfarms.com/programs/csrx/')
          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.end('CutSheetRX upstream error')
            return
          }
          let html = await upstream.text()
          html = html.replace(
            'var map = L.map("map", { maxZoom: 20 })',
            'var map = (window.__AQUA_CSR_MAP__ = L.map("map", { maxZoom: 20 }))',
          )
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(html)
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
