/**
 * The business name and contact email on the policy pages, from `radar.config.ts`.
 * The owner leaves them as 'TODO'; in dev the pages show that plainly instead of hiding it.
 */

const isSet = (value: string): boolean => {
  const clean = value.trim();
  return clean !== '' && clean.toUpperCase() !== 'TODO';
};

const named = typeof __RADAR_LEGAL_NAME__ === 'string' ? __RADAR_LEGAL_NAME__ : 'TODO';
const mailed = typeof __RADAR_LEGAL_EMAIL__ === 'string' ? __RADAR_LEGAL_EMAIL__ : 'TODO';
const dev = import.meta.env.DEV;

export const LEGAL_NAME = isSet(named) ? named.trim() : dev ? 'TODO' : 'Signal Radar';
export const CONTACT_EMAIL = isSet(mailed) ? mailed.trim() : dev ? 'TODO' : '';

/** True while either placeholder is still in place; the dev build shows it on the pages. */
export const LEGAL_PLACEHOLDER = !isSet(named) || !isSet(mailed);
