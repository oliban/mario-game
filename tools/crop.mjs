// crop.mjs <in.png> <x> <y> <w> <h> <out.png> [zoom]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [inp, x, y, w, h, out, zoom = '1'] = process.argv.slice(2);
const b64 = readFileSync(inp).toString('base64');
const Z = Number(zoom);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.ceil(w * Z), height: Math.ceil(h * Z) }, deviceScaleFactor: 1 });
await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden;background:#000}
img{image-rendering:pixelated;position:absolute;left:${-x * Z}px;top:${-y * Z}px;width:${Math.round(820 * Z)}px}</style>
<img src="data:image/png;base64,${b64}">`);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
