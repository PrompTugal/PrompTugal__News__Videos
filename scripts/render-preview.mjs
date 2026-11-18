// Render _site/preview.svg to src/preview.png (1200 x 630, for social cards) with the pre-installed Chromium.
// Run by the agent after a build, at its wakes; CI has no browser, so the PNG is committed and says when it was made.
// No network: the SVG holds no external reference and the page is loaded from the file itself.
// videos.b@PrompTugal.dinis, 18 Nov 2026. Code: Apache-2.0.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = readFileSync('_site/preview.svg', 'utf8');
if (/(href|src)\s*=|<script|url\(/i.test(svg)) { console.error('preview.svg holds a reference or a script: not rendered'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, javaScriptEnabled: false });
await page.route('**/*', (r) => r.abort());
await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0}</style>${svg}`);
writeFileSync('src/preview.png', await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } }));
await browser.close();
console.log('rendered src/preview.png');
