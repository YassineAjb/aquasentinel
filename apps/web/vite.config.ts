import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Same-origin embed so we can translate panel labels without replacing the tool
      '/csrx-embed': {
        target: 'https://www.senterfarms.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/csrx-embed/, '/programs/csrx'),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['x-frame-options']
            delete proxyRes.headers['content-security-policy']
            delete proxyRes.headers['content-security-policy-report-only']
          })
        },
      },
    },
  },
})
