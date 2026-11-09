import { XMLParser } from 'fast-xml-parser';
import { getText, HttpError } from '../http.js';
import type { MediaType, RawItem, SourceConfig } from '../schema.js';
import { stripHtml, truncate } from '../text.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type RssConfig = Extract<SourceConfig, { type: 'rss' }>;
type Node = Record<string, unknown>;

const ARRAYS = new Set(['item', 'entry', 'link', 'category', 'media:thumbnail', 'media:content']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAYS.has(name),
});

/** Text of a node that may be a string or `{ '#text': ..., '@_type': ... }`. */
function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text((v as Node)['#text']);
  return '';
}

function attr(v: unknown, name: string): string | undefined {
  const first = Array.isArray(v) ? v[0] : v;
  if (first && typeof first === 'object') {
    const a = (first as Node)[`@_${name}`];
    if (typeof a === 'string') return a;
  }
  return undefined;
}

function linkOf(entry: Node): string {
  const links = (entry['link'] ?? []) as unknown[];
  let fallback = '';
  for (const l of Array.isArray(links) ? links : [links]) {
    if (typeof l === 'string') {
      if (l) return l;
      continue;
    }
    if (l && typeof l === 'object') {
      const href = (l as Node)['@_href'];
      const rel = (l as Node)['@_rel'];
      if (typeof href === 'string') {
        if (!rel || rel === 'alternate') return href;
        if (!fallback) fallback = href;
      } else if ((l as Node)['#text']) {
        return text(l);
      }
    }
  }
  return fallback || text(entry['guid']) || text(entry['id']);
}

function thumbOf(entry: Node, group: Node | undefined): string | undefined {
  for (const src of [entry, group]) {
    if (!src) continue;
    const t = attr(src['media:thumbnail'], 'url');
    if (t) return t;
    const contents = (src['media:content'] ?? []) as unknown[];
    for (const c of Array.isArray(contents) ? contents : [contents]) {
      const url = attr(c, 'url');
      const type = attr(c, 'type') ?? '';
      const medium = attr(c, 'medium');
      if (url && (medium === 'image' || type.startsWith('image/'))) return url;
    }
    const enc = attr(src['enclosure'], 'url');
    if (enc && (attr(src['enclosure'], 'type') ?? '').startsWith('image/')) return enc;
  }
  return undefined;
}

function mediaTypeFor(url: string, entry: Node, override?: MediaType): MediaType {
  if (/youtube\.com\/shorts\//i.test(url)) return 'short';
  if (override) return override;
  if (entry['yt:videoId'] || /youtube\.com\/watch|youtu\.be\//i.test(url)) return 'video';
  return 'article';
}

/** The feed's own title (RSS channel, Atom feed or RDF channel), or null. */
export function parseFeedTitle(xml: string): string | null {
  const doc = parser.parse(xml) as Node;
  const channel = (doc['rss'] as Node | undefined)?.['channel'] as Node | undefined;
  const rdfChannel = (doc['rdf:RDF'] as Node | undefined)?.['channel'] as Node | undefined;
  const atom = doc['feed'] as Node | undefined;
  const t = stripHtml(text((channel ?? atom ?? rdfChannel)?.['title']));
  return t ? truncate(t, 120) : null;
}

export interface ParseFeedOptions {
  mediaType?: MediaType | undefined;
  tags?: string[] | undefined;
}

export function parseFeed(xml: string, opts: ParseFeedOptions = {}): RawItem[] {
  const doc = parser.parse(xml) as Node;
  const channel = (doc['rss'] as Node | undefined)?.['channel'] as Node | undefined;
  const atom = doc['feed'] as Node | undefined;
  const rdf = (doc['rdf:RDF'] as Node | undefined) ?? undefined;
  const entries = (channel?.['item'] ?? atom?.['entry'] ?? rdf?.['item'] ?? []) as Node[];

  const out: RawItem[] = [];
  for (const e of entries) {
    const url = linkOf(e).trim();
    const title = stripHtml(text(e['title']));
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;
    const group = e['media:group'] as Node | undefined;

    const rawSnippet =
      text(e['description']) ||
      text(e['summary']) ||
      text(group?.['media:description']) ||
      text(e['content:encoded']) ||
      text(e['content']);
    const published =
      text(e['pubDate']) || text(e['published']) || text(e['dc:date']) || text(e['updated']);
    const author =
      text((e['author'] as Node | undefined)?.['name']) ||
      text(e['dc:creator']) ||
      (typeof e['author'] === 'string' ? e['author'] : '');

    const cats = ((e['category'] ?? []) as unknown[]).map(
      (c) => attr(c, 'term') ?? text(c),
    ) as string[];
    const item: RawItem = {
      url,
      title,
      snippet: truncate(stripHtml(rawSnippet), 400),
      tags: [...(opts.tags ?? []), ...cats.filter(Boolean).slice(0, 5)],
      media: { type: mediaTypeFor(url, e, opts.mediaType) },
    };
    const thumb = thumbOf(e, group);
    if (thumb && item.media) item.media.thumbnail = thumb;
    if (author) item.author = stripHtml(author);
    if (published) item.publishedAt = published;
    out.push(item);
  }
  return out;
}

/** Resolve `rsshub:/path` against rsshubBase; plain URLs pass through. */
export function resolveFeedUrl(url: string, rsshubBase?: string): string | null {
  if (!url.startsWith('rsshub:')) return url;
  if (!rsshubBase) return null;
  return rsshubBase.replace(/\/+$/, '') + '/' + url.slice('rsshub:'.length).replace(/^\/+/, '');
}

export function createRss(cfg: RssConfig, opts: BuildOptions): Source {
  const resolved = resolveFeedUrl(cfg.url, opts.rsshubBase);
  const status = !cfg.enabled
    ? { ok: false, reason: 'disabled in config' }
    : resolved === null
      ? { ok: false, reason: 'needs rsshubBase (unset)' }
      : { ok: true };
  return {
    id: cfg.id ?? `rss:${cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: cfg.name,
    kind: 'rss',
    alwaysInclude: cfg.alwaysInclude,
    status,
    async fetch(ctx: SourceContext) {
      if (resolved === null) return [];
      const headers = {
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
      };
      let xml: string;
      try {
        xml = await getText(ctx.fetch, resolved, headers);
      } catch (e) {
        // YouTube's feed endpoint intermittently answers 404 for valid channels; one retry fixes it.
        const flaky =
          e instanceof HttpError && e.status === 404 && resolved.includes('youtube.com/feeds/');
        if (!flaky) throw e;
        xml = await getText(ctx.fetch, resolved, headers);
      }
      return parseFeed(xml, { mediaType: cfg.mediaType, tags: cfg.tags });
    },
  };
}
