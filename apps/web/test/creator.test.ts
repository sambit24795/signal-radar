import { describe, expect, it } from 'vitest';
import {
  creatorToSave,
  emptyCreator,
  isEmptyCreator,
  normalizeCreator,
  setTone,
  toggleMake,
} from '../src/lib/creator';

describe('creator form helpers', () => {
  it('toggles makes in canonical order', () => {
    let p = toggleMake(emptyCreator(), 'podcast');
    p = toggleMake(p, 'video');
    expect(p.makes).toEqual(['video', 'podcast']);
    expect(toggleMake(p, 'video').makes).toEqual(['podcast']);
  });

  it('sets the tone and clears it on a second pick', () => {
    const p = setTone(emptyCreator(), 'plain');
    expect(p.tone).toBe('plain');
    expect(setTone(p, 'plain')).toEqual({ makes: [] });
    expect(setTone(p, 'playful').tone).toBe('playful');
  });

  it('normalizes text to one clamped line and drops blanks', () => {
    const n = normalizeCreator({
      makes: ['video'],
      audience: ' devs\n\nwho ship ',
      resources: '   ',
    });
    expect(n).toEqual({ makes: ['video'], audience: 'devs who ship' });
    expect(normalizeCreator({ makes: [], audience: 'x'.repeat(200) }).audience).toHaveLength(80);
  });

  it('saves null for an empty profile', () => {
    expect(isEmptyCreator(null)).toBe(true);
    expect(isEmptyCreator({ makes: [], audience: ' ' })).toBe(true);
    expect(creatorToSave({ makes: [], audience: ' ' })).toBeNull();
    expect(creatorToSave({ makes: ['posts'] })).toEqual({ makes: ['posts'] });
  });
});
