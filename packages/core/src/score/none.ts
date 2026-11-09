import type { Provider } from './types.js';

/** No-AI mode: items keep their keyword+momentum rank and nothing is sent anywhere. */
export const noneProvider: Provider = {
  id: 'none',
  complete() {
    return Promise.reject(new Error('the none provider cannot complete prompts'));
  },
};
