import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    // wrangler writes its local D1 state and bundles here; don't treat that as a source change.
    watch: { ignored: ['**/.wrangler/**', '**/.tmp-d1/**', '**/dist/**'] },
    // `npm run dev:api` serves the Worker + D1 on :8787; forward API calls to it.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
