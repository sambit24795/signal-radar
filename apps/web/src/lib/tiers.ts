/** What Free and Pro include. The Pricing page and the landing page both render these. */

export const PRICE = {
  free: '$0',
  pro: '$5',
  proPeriod: ' per month, 7 days free',
  cancelNote: 'Cancel any time; you keep Pro until the period you paid for ends.',
} as const;

export const FREE_FEATURES: readonly string[] = [
  'The ranked Read view across every source, no account needed',
  'With an account: an Ideas queue of up to 10 new stories a run, ranked by your topics',
  'Save any link to Ideas, up to 10 a day',
  '3 new page summaries a day; ones already read are free',
];

export const PRO_FEATURES: readonly string[] = [
  'Everything in Free, with higher limits: 30 saved links and 100 summaries a day',
  'A hook, an angle and a title draft written for each queued story',
  'An Ideas queue that learns from what you pick and skip',
  'Your own RSS feeds',
  'A Telegram digest, web push and Notion sync',
];
