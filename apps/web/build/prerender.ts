import { createServer, type Plugin } from 'vite';
import { PAGE_META, type PrerenderPath } from '../src/lib/site';

export const DEFAULT_SITE_URL = 'http://localhost:5173';

/** `https://example.com/` and `https://example.com` both become `https://example.com`. */
export function normalizeSiteUrl(raw: string | undefined): string {
  return (raw?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function setMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, (_m, a: string, b: string) => `${a}${escapeAttr(content)}${b}`);
}

/** Points the head of the built `index.html` (written for `/`) at another page. */
export function setPageHead(html: string, path: PrerenderPath, siteUrl: string): string {
  const { title, description } = PAGE_META[path];
  const url = `${siteUrl}${path}`;
  let out = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeAttr(title)}</title>`);
  out = setMeta(out, 'name', 'description', description);
  out = out.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    (_m, a: string, b: string) => `${a}${url}${b}`,
  );
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', description);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', description);
  return out;
}

/** Puts pre-rendered markup inside `#root`; the client replaces it on load (see index.html). */
export function fillRoot(html: string, path: PrerenderPath, markup: string): string {
  return html.replace(
    '<div id="root"></div>',
    () => `<div id="root" data-prerender="${path}">${markup}</div>`,
  );
}

export function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function sitemapXml(siteUrl: string): string {
  const urls = ['/', '/read', '/pricing'].map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Fills `%SITE_URL%` in index.html, in dev and in the build. */
export function siteUrlPlugin(siteUrl: string): Plugin {
  return {
    name: 'radar:site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
  };
}

/**
 * Pre-renders `/` and `/pricing` into the build: `index.html` gets the landing markup, `pricing/index.html`
 * is a copy with the pricing markup and head, and robots.txt and sitemap.xml are written from the site URL.
 * The React tree is rendered with `react-dom/server` through a throwaway Vite SSR server, so no extra
 * dependency or browser is needed.
 */
export function prerenderPlugin(siteUrl: string, root: string): Plugin {
  let pages: Record<PrerenderPath, string>;
  return {
    name: 'radar:prerender',
    apply: 'build',
    enforce: 'post',
    async buildStart() {
      const server = await createServer({
        root,
        configFile: false,
        mode: 'production',
        envDir: `${root}/../..`,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true },
      });
      try {
        const mod = await server.ssrLoadModule('/src/prerender.tsx');
        pages = (mod as { renderPages: () => Record<PrerenderPath, string> }).renderPages();
      } finally {
        await server.close();
      }
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('prerender: index.html was not built');
      const base = String(index.source);
      index.source = fillRoot(base, '/', pages['/']);
      this.emitFile({
        type: 'asset',
        fileName: 'pricing/index.html',
        source: fillRoot(setPageHead(base, '/pricing', siteUrl), '/pricing', pages['/pricing']),
      });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(siteUrl) });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(siteUrl) });
    },
  };
}
