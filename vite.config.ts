import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { copyOcr } from './scripts/copy-ocr.mjs'

// The screenshot reader's files (public/ocr/, not committed), copied whenever Vite starts: however the site is
// built (npm run build, npx vite build, Cloudflare's build), they're there.
copyOcr()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Same forwarding as the price proxy Worker (worker/index.ts) does in production.
      '/api/chart/': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chart\//, '/v8/finance/chart/'),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
  build: {
    rolldownOptions: {
      // The app, plus the static privacy policy page (served at /privacy).
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        privacy: path.resolve(import.meta.dirname, 'privacy.html'),
      },
    },
  },
})
