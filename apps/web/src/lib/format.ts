/** Compact count: 950 -> "950", 1240 -> "1.2k", 15300 -> "15k". */
export function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

/** Short age: "now", "12m", "3h", "2d", "5w". Empty for missing or unparseable dates. */
export function formatAge(iso: string | undefined | null, now: number = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (7 * 86_400))}w`;
}

/** "updated" label: "just now", "12 min ago", "3 h ago", "2 d ago". */
export function formatUpdated(iso: string | null, now: number = Date.now()): string {
  const age = formatAge(iso, now);
  if (!age) return '';
  if (age === 'now') return 'just now';
  const unit = age.slice(-1);
  const n = age.slice(0, -1);
  const word = { m: 'min', h: 'h', d: 'd', w: 'w' }[unit] ?? unit;
  return `${n} ${word} ago`;
}

/** Host without "www.", or '' when the URL does not parse. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Clock time for the offline notice, e.g. "14:02". */
export function formatClock(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
