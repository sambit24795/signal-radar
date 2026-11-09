import type { FetchFn } from '../http.js';
import type { Provider } from './types.js';

export interface DeepseekOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  fetch: FetchFn;
}

/** DeepSeek via its OpenAI-compatible chat completions endpoint, in JSON mode. */
export function deepseekProvider(o: DeepseekOptions): Provider {
  return {
    id: 'deepseek',
    async complete({ system, user }) {
      const res = await o.fetch(`${o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify({
          model: o.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          max_tokens: o.maxTokens,
          temperature: 0.3,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      // JSON mode returns blank content when the model produced invalid JSON.
      if (!content?.trim()) throw new Error('deepseek returned empty content');
      return content;
    },
  };
}
