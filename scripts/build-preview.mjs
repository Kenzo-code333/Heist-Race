// ============================================================================
// scripts/build-preview.mjs  —  `npm run build:preview`
// ----------------------------------------------------------------------------
// Builds the OFFLINE single-player preview as ONE html file:
//   dist-preview/heist-race.html
// 1. runs `vite build --mode offline` (the game server is bundled into the page)
// 2. pastes the resulting JavaScript and CSS directly into the HTML
// The file can be opened on its own, or shown inside Claude as an Artifact.
// ============================================================================

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'dist-preview';
execSync('npx vite build --mode offline', { stdio: 'inherit' });

const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const assets = path.join(outDir, 'assets');
const files = fs.readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8'));
if (js.length !== 1) throw new Error(`Expected exactly one JS bundle, found ${js.length}`);

// Keep only the page's own content (the Artifact host adds <html>/<head>/<body>).
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
// "</script" inside the code would end the inline <script> tag early.
const safeJs = js[0].replaceAll('</script', '<\\/script');

const page = `<title>Heist Race</title>
<style>${css.join('\n')}</style>
${body.trim()}
<script type="module">${safeJs}</script>
`;
const target = path.join(outDir, 'heist-race.html');
fs.writeFileSync(target, page);
console.log(`\nPreview written to ${target} (${(page.length / 1024).toFixed(0)} KB)`);
