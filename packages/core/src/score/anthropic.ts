import Anthropic from '@anthropic-ai/sdk';
import type { FetchFn } from '../http.js';
import type { Provider } from './types.js';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  fetch: FetchFn;
}

/** Thin Anthropic provider; the reply is parsed as JSON by the shared scoring code. */
export function anthropicProvider(o: AnthropicOptions): Provider {
  const client = new Anthropic({
    apiKey: o.apiKey,
    fetch: o.fetch as unknown as typeof fetch,
    maxRetries: 0,
  });
  return {
    id: 'anthropic',
    async complete({ system, user }) {
      const msg = await client.messages.create({
        model: o.model,
        max_tokens: o.maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      if (!text.trim()) throw new Error('anthropic returned empty content');
      return text;
    },
  };
}
