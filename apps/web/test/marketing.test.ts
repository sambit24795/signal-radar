import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { fillRoot, normalizeSiteUrl, setPageHead } from '../build/prerender';
import { Landing } from '../src/components/Landing';
import { Pricing } from '../src/components/Pricing';
import { FREE_FEATURES, PRICE, PRO_FEATURES } from '../src/lib/tiers';

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node).replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

describe('tier data', () => {
  it('is what both Landing and Pricing render', () => {
    const noop = () => {};
    const landing = html(
      createElement(Landing, { data: { status: 'loading' }, now: 0, retry: noop }),
    );
    const pricing = html(createElement(Pricing, { me: { status: 'loading' } }));
    for (const f of [...FREE_FEATURES, ...PRO_FEATURES]) {
      expect(landing).toContain(f);
      expect(pricing).toContain(f);
    }
    expect(landing).toContain(PRICE.pro);
    expect(pricing).toContain(PRICE.pro);
  });

  it('gives the landing page one h1', () => {
    const landing = html(
      createElement(Landing, { data: { status: 'loading' }, now: 0, retry: () => {} }),
    );
    expect(landing.match(/<h1[ >]/g)).toHaveLength(1);
  });
});

describe('page head helpers', () => {
  const base =
    '<title>Home</title><meta name="description" content="x"/>' +
    '<link rel="canonical" href="https://a.test/"/><meta property="og:url" content="https://a.test/"/>' +
    '<meta property="og:title" content="x"/><meta property="og:description" content="x"/>' +
    '<meta name="twitter:title" content="x"/><meta name="twitter:description" content="x"/>' +
    '<div id="root"></div>';

  it('retargets title, description, canonical and share tags', () => {
    const out = setPageHead(base, '/pricing', 'https://a.test');
    expect(out).toContain('<title>Pricing · Signal Radar</title>');
    expect(out).toContain('rel="canonical" href="https://a.test/pricing"');
    expect(out).toContain('property="og:url" content="https://a.test/pricing"');
    expect(out).toMatch(/property="og:description" content="Free keeps[^"]*\$5 a month/);
  });

  it('fills #root and tags it with the route', () => {
    expect(fillRoot(base, '/', '<p>$1</p>')).toContain(
      '<div id="root" data-prerender="/"><p>$1</p>',
    );
  });

  it('normalizes the site url', () => {
    expect(normalizeSiteUrl('https://a.test///')).toBe('https://a.test');
    expect(normalizeSiteUrl('')).toBe('http://localhost:5173');
    expect(normalizeSiteUrl(undefined)).toBe('http://localhost:5173');
  });
});

describe('build output', () => {
  const out = mkdtempSync(join(tmpdir(), 'radar-web-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('pre-renders / and /pricing with one h1 and share tags, and writes robots and sitemap', async () => {
    process.env.VITE_SITE_URL = 'https://radar.example/';
    await build({
      root: fileURLToPath(new URL('..', import.meta.url)),
      logLevel: 'silent',
      build: { outDir: out, emptyOutDir: true },
    });
    const read = (f: string) => readFileSync(join(out, f), 'utf8');
    const landing = read('index.html');
    const pricing = read('pricing/index.html');
    for (const page of [landing, pricing]) {
      expect(page.match(/<h1[ >]/g)).toHaveLength(1);
      expect(page).toContain('<meta property="og:image" content="https://radar.example/og.png"');
      expect(page).toContain('<meta name="twitter:card" content="summary_large_image"');
    }
    expect(landing).toContain('Find the story before the algorithm does.</h1>');
    expect(landing).toContain('id="root" data-prerender="/"');
    expect(landing).toContain('rel="canonical" href="https://radar.example/"');
    expect(pricing).toContain('id="root" data-prerender="/pricing"');
    expect(pricing).toContain('<title>Pricing · Signal Radar</title>');
    expect(read('robots.txt')).toContain('Sitemap: https://radar.example/sitemap.xml');
    const sitemap = read('sitemap.xml');
    for (const p of ['/', '/read', '/pricing'])
      expect(sitemap).toContain(`https://radar.example${p}<`);
  }, 120_000);
});
