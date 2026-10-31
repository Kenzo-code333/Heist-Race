// Vite configuration: how the browser code is served in development and
// bundled for production.
//
// Two kinds of build:
//   npm run build          → /dist, served by the Node server (online multiplayer)
//   npm run build:preview  → "offline" mode: one self-contained HTML file with the
//                            game server running inside the page (see
//                            scripts/build-preview.mjs and client/src/net/LocalSocket.js)
import { defineConfig } from 'vite';
import { SERVER_PORT } from './shared/constants.js';

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    root: 'client',              // index.html lives in /client
    server: {
      port: 5173,
      strictPort: true,
      host: true,                // also reachable from other devices on your network
      fs: { allow: ['..'] },     // allow importing files from /shared (and /server for the preview)
      proxy: {
        // Forward Socket.io traffic to the Node server so the browser only
        // needs one address (http://localhost:5173).
        '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
      },
    },
    build: {
      outDir: offline ? '../dist-preview' : '../dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500, // Three.js alone is ~700 kB; that's expected
      // The preview must be a single file: no separate chunks or asset files.
      ...(offline && {
        assetsInlineLimit: 100_000_000,
        rolldownOptions: { output: { inlineDynamicImports: true } },
      }),
    },
  };
});
