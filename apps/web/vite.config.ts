import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // The lazily loaded table chunk carries three.js (~250 kB gzip); that is expected.
    chunkSizeWarningLimit: 1000,
  },
})
