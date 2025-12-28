import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true, // Listen on all addresses (for Docker)
    proxy: {
      // Proxy API requests to backend during development
      // For E2E tests, VITE_API_URL is set to http://localhost:3001/api/v1
      // So we need to proxy to port 3001, not 3000
      '/api': {
        target: process.env.VITE_API_URL
          ? process.env.VITE_API_URL.replace('/api/v1', '')
          : 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy Error]', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.warn('[Vite Proxy]', req.method, req.url, '->', proxyReq.host + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.warn('[Vite Proxy Response]', req.url, proxyRes.statusCode);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
