import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    // All interfaces, not just loopback, so a phone on the same network can open the app.
    // Vite prints the LAN URL on start. Everything else about reaching it from a phone is
    // already right: the client's only fetch is a relative /api path, so it resolves
    // against whatever origin the page came from and the proxy below carries it. Pointing
    // the client at an absolute http://<ip>:3000 instead would make every call
    // cross-origin, and the session cookie is sameSite lax with no CORS layer behind it.
    host: true,
    port: 5173,
    // Rather than drifting to 5174 when the port is taken, which is invisible on the
    // laptop and looks like a dead network on the phone.
    strictPort: true,
    // Vite checks the Host header. Bare IPs and localhost always pass, so this is only for
    // reaching the app by hostname or through a tunnel.
    allowedHosts: ['.trycloudflare.com', '.local'],
    // The API runs in a separate process during development; in production Express
    // serves the built output from web/dist instead.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
  },
});
