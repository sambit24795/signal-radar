/* global URL, document */
// Renders scripts/og.html to public/og.png. Playwright is not a project dependency:
//   node scripts/og.mjs   (with `playwright` resolvable, e.g. via npx)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const html = fileURLToPath(new URL('./og.html', import.meta.url));
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
