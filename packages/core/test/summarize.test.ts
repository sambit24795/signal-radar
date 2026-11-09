import { describe, expect, it } from 'vitest';
import {
  buildSummaryPrompt,
  extractArticle,
  MAX_INPUT_CHARS,
  parsePageSummary,
  summarizePage,
} from '../src/summarize.js';

const PARA =
  'The council voted on Tuesday to approve a new bike lane network covering forty kilometres. ';
const html = (n: number) =>
  `<html><head><title>Bikes</title></head><body><nav>Menu</nav><article><h1>Bikes</h1>${`<p>${PARA}</p>`.repeat(n)}</article><footer>Contact</footer></body></html>`;
const resolve = async () => ['93.184.216.34'];

describe('summarize', () => {
  it('extracts article text and drops chrome', () => {
    const a = extractArticle(html(8), 'https://x.example/a');
    expect(a?.text).toContain('bike lane network');
    expect(a?.text).not.toContain('Contact');
    expect(extractArticle('<html><body></body></html>', 'https://x.example/a')).toBeNull();
  });

  it('parses fenced replies, strips bullets and caps at 5 points', () => {
    const r = parsePageSummary('```json\n{"tldr":"T","points":["- a","b","c","d","e","f"]}\n```');
    expect(r).toEqual({ tldr: 'T', points: ['a', 'b', 'c', 'd', 'e'] });
    expect(() => parsePageSummary('{"tldr":"T","points":[]}')).toThrow();
  });

  it('truncates the model input', () => {
    expect(buildSummaryPrompt('T', 'x'.repeat(MAX_INPUT_CHARS * 2)).length).toBeLessThan(
      MAX_INPUT_CHARS + 100,
    );
  });

  it('skips the model for short pages and sends long ones through the provider', async () => {
    let calls = 0;
    const provider = {
      id: 'deepseek' as const,
      complete: async () => {
        calls++;
        return '{"tldr":"T","points":["a","b","c"]}';
      },
    };
    const page = (body: string) => async () => new Response(body);
    const short = await summarizePage('https://x.example/a', {
      provider,
      resolve,
      fetch: page(html(1)),
    });
    expect(short.status).toBe('unreadable');
    expect(calls).toBe(0);
    const long = await summarizePage('https://x.example/a', {
      provider,
      resolve,
      fetch: page(html(8)),
    });
    expect(long).toMatchObject({ status: 'ok', tldr: 'T' });
    expect(calls).toBe(1);
  });
});
