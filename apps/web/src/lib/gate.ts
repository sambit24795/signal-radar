import { createStore } from './store';

/** What a signed-out visitor tried to do; the app shows one sign-in sheet for it. */
export type GateKind = 'save' | 'summary' | 'pro';

/** The one open sign-in sheet (null: closed). A new tap replaces what it says. */
export const gate = createStore<GateKind | null>(null);

/** Where to go after signing in, when the tap came from a page (the Pricing Buy buttons). */
let next: string | null = null;

export function setGateNext(path: string | null): void {
  next = path;
}

export function takeGateNext(): string | null {
  const path = next;
  next = null;
  return path;
}

export function showGate(kind: GateKind): void {
  gate.set(kind);
}

export function hideGate(): void {
  gate.set(null);
}

/** The words for the sheet, true to the free plan (the Ideas queue and 3 summaries a day). */
export function gateCopy(kind: GateKind): { title: string; line: string } {
  if (kind === 'pro') {
    return {
      title: 'Get Pro',
      line: 'Sign in first, then pick a pass. The days start after you pay.',
    };
  }
  return {
    title: kind === 'save' ? 'Save stories to Ideas' : 'Get summaries',
    line: 'It’s free. A free account gets the Ideas queue and 3 summaries a day.',
  };
}
