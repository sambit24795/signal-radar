import { describe, expect, it } from 'vitest';
import { hasOpenedRadar, landingRedirect, markRadarOpened, OPENED_KEY } from '../src/lib/landing';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('landingRedirect', () => {
  it('sends signed-in visitors to the radar', () => {
    expect(landingRedirect('ready', false)).toBe('/read');
  });

  it('sends repeat visitors to the radar, whatever the session says', () => {
    for (const s of ['anon', 'error', 'loading', 'ready'] as const) {
      expect(landingRedirect(s, true)).toBe('/read');
    }
  });

  it('shows the landing page to first-time anonymous visitors', () => {
    expect(landingRedirect('anon', false)).toBeNull();
    expect(landingRedirect('error', false)).toBeNull();
  });

  it('waits while a first-time visitor session is being checked', () => {
    expect(landingRedirect('loading', false)).toBe('wait');
  });
});

describe('opened flag', () => {
  it('is unset until the radar is opened, then stays set', () => {
    const s = memory();
    expect(hasOpenedRadar(s)).toBe(false);
    markRadarOpened(s);
    expect(hasOpenedRadar(s)).toBe(true);
    expect(s.getItem(OPENED_KEY)).toBe('1');
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(hasOpenedRadar(broken)).toBe(false);
    expect(() => markRadarOpened(broken)).not.toThrow();
  });
});
