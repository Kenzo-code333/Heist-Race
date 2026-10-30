// Vite configuration: how the browser code is served in development and
// bundled for production.
import { defineConfig } from 'vite';
import { SERVER_PORT } from './shared/constants.js';

export default defineConfig({
  root: 'client',              // index.html lives in /client
  server: {
    port: 5173,
    strictPort: true,
    host: true,                // also reachable from other devices on your network
    fs: { allow: ['..'] },     // allow importing files from /shared
    proxy: {
      // Forward Socket.io traffic to the Node server so the browser only
      // needs one address (http://localhost:5173).
      '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500, // Three.js alone is ~700 kB; that's expected
  },
});
