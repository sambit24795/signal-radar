import type { Subscription } from './me';

export interface PlanSummary {
  kind: 'free' | 'trial' | 'active' | 'canceled';
  title: string;
  detail: string;
  canUpgrade: boolean;
  canCancel: boolean;
}

const DAY = 86_400_000;

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** What the Plan section of Settings says, derived from the subscription row. */
export function planSummary(sub: Subscription, now = Date.now()): PlanSummary {
  if (sub.status === 'trialing' && sub.isPro) {
    const end = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : NaN;
    const days = Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / DAY));
    return {
      kind: 'trial',
      title: 'Pro trial',
      detail:
        days === null
          ? 'Your trial is running.'
          : `Ends ${formatDate(sub.trialEndsAt)}, in ${days} ${days === 1 ? 'day' : 'days'}.`,
      canUpgrade: true,
      canCancel: false,
    };
  }
  if (sub.status === 'active') {
    return {
      kind: 'active',
      title: 'Pro',
      detail: sub.currentPeriodEnd ? `Renews ${formatDate(sub.currentPeriodEnd)}.` : 'Active.',
      canUpgrade: false,
      canCancel: true,
    };
  }
  if (sub.status === 'canceled' && sub.isPro) {
    return {
      kind: 'canceled',
      title: 'Pro, canceled',
      detail: `You keep Pro until ${formatDate(sub.currentPeriodEnd)}.`,
      canUpgrade: true,
      canCancel: false,
    };
  }
  return {
    kind: 'free',
    title: 'Free',
    detail:
      sub.status === 'none'
        ? 'The Read view, an Ideas queue and 3 page summaries a day.'
        : 'Your Pro access has ended. Ideas and 3 summaries a day stay.',
    canUpgrade: true,
    canCancel: false,
  };
}
