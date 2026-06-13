import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy the API in dev so the browser sees a single origin and the auth
    // cookie works (same as production, where Caddy serves both on one host).
    proxy: {
      // ws:true so the chat WebSocket upgrade proxies through in dev (same-origin).
      '/api': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
});
