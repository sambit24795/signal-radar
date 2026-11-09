import { vi } from 'vitest';

// Tests must never touch the network: any un-injected fetch fails loudly.
vi.stubGlobal(
  'fetch',
  vi.fn(() => {
    throw new Error('network access attempted in a test');
  }),
);
