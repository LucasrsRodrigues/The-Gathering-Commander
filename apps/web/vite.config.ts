import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The CSP in index.html is for the built app. The dev server injects an inline React Refresh
// preamble and talks to HMR over a websocket, so the policy is dropped while serving.
function stripCspInDev(): Plugin {
  return {
    name: 'strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  }
}

export default defineConfig({
  plugins: [react(), stripCspInDev()],
  build: {
    // The lazily loaded table chunk carries three.js (~250 kB gzip); that is expected.
    chunkSizeWarningLimit: 1000,
  },
})
