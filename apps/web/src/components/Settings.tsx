import { useState, type FormEvent } from 'react';
import type { Niche } from '@radar/core/ranking';
import { ApiError } from '../lib/api';
import { cancelPlan } from '../lib/billing';
import { saveConfig, useConfig, type ServerConfig } from '../lib/config';
import type { Defaults } from '../lib/feed';
import { refreshMe, type Me } from '../lib/me';
import { planSummary } from '../lib/plan';
import { Link } from './Link';
import { NichesEditor, SourcesEditor } from './Editors';

interface Props {
  me: Me;
  defaults: Defaults | null;
}

export function Settings({ me, defaults }: Props) {
  const { config } = useConfig();
  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title" className="page-title">
        Settings
      </h2>
      {config && defaults ? (
        <SettingsForm config={config} defaults={defaults} />
      ) : (
        <p className="meta" aria-busy="true">
          Loading your settings
        </p>
      )}
      <PlanSection me={me} />
    </section>
  );
}

type TokenMode = 'keep' | 'replace' | 'removed';

function SettingsForm({ config, defaults }: { config: ServerConfig; defaults: Defaults }) {
  const allIds = defaults.sources.map((s) => s.id);
  const [niches, setNiches] = useState<Niche[]>(() =>
    config.niches.length > 0 ? config.niches : defaults.niches,
  );
  const [enabled, setEnabled] = useState(
    () => new Set(config.sources.length > 0 ? config.sources : allIds),
  );
  const [telegram, setTelegram] = useState(config.telegramChatId ?? '');
  const [dbId, setDbId] = useState(config.notion?.dbId ?? '');
  const [token, setToken] = useState('');
  const [tokenMode, setTokenMode] = useState<TokenMode>(
    config.notion?.hasToken ? 'keep' : 'replace',
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const touch = () => state !== 'idle' && setState('idle');
  const hasStored = Boolean(config.notion?.hasToken);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const db = dbId.trim();
    const tok = token.trim();
    let notion: ServerConfig['notion'] = null;
    let newToken: string | undefined;
    if (tokenMode === 'keep') {
      if (!db) {
        setState('error');
        setMessage('Add the Notion database id, or remove the connection.');
        return;
      }
      notion = { dbId: db, hasToken: true };
    } else if (tokenMode === 'replace' && (tok || db)) {
      if (!tok || !db) {
        setState('error');
        setMessage('Notion needs both an integration token and a database id.');
        return;
      }
      notion = { dbId: db, hasToken: true };
      newToken = tok;
    }
    setState('saving');
    try {
      await saveConfig(
        {
          ...config,
          niches,
          sources: allIds.filter((id) => enabled.has(id)),
          telegramChatId: telegram.trim() || null,
          notion,
        },
        newToken,
      );
      setToken('');
      setTokenMode(notion ? 'keep' : 'replace');
      if (!notion) setDbId('');
      setState('saved');
      setMessage('Saved.');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Could not save. Try again.');
    }
  };

  return (
    <form onSubmit={submit} className="settings-form">
      <section className="settings-sec" aria-labelledby="set-niches">
        <h3 id="set-niches" className="sheet-h">
          Niches
        </h3>
        <p className="hint">Items are ranked by how well they match these keywords.</p>
        <NichesEditor
          niches={niches}
          onChange={(n) => {
            setNiches(n);
            touch();
          }}
        />
      </section>

      <section className="settings-sec" aria-labelledby="set-sources">
        <h3 id="set-sources" className="sheet-h">
          Sources
        </h3>
        <SourcesEditor
          sources={defaults.sources}
          enabled={enabled}
          onToggle={(id) => {
            const next = new Set(enabled);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setEnabled(next);
            touch();
          }}
        />
      </section>

      <section className="settings-sec" aria-labelledby="set-telegram">
        <h3 id="set-telegram" className="sheet-h">
          Telegram digest
        </h3>
        <p className="hint">The chat that receives your daily digest.</p>
        <label className="field">
          <span className="field-label">Chat id</span>
          <input
            value={telegram}
            onChange={(e) => {
              setTelegram(e.target.value);
              touch();
            }}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789"
          />
        </label>
      </section>

      <section className="settings-sec" aria-labelledby="set-notion">
        <h3 id="set-notion" className="sheet-h">
          Notion sync
        </h3>
        <p className="hint">Picked items are added to this database.</p>
        <label className="field">
          <span className="field-label">Database id</span>
          <input
            value={dbId}
            onChange={(e) => {
              setDbId(e.target.value);
              touch();
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        {tokenMode === 'keep' ? (
          <div className="token-row">
            <div>
              <span className="field-label">Integration token</span>
              <p className="token-saved">Saved</p>
            </div>
            <div className="token-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTokenMode('replace');
                  touch();
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setTokenMode('removed');
                  setDbId('');
                  touch();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : tokenMode === 'removed' ? (
          <p className="hint">
            The connection will be removed when you save.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setTokenMode('keep');
                setDbId(config.notion?.dbId ?? '');
              }}
            >
              Keep it
            </button>
          </p>
        ) : (
          <label className="field">
            <span className="field-label">
              Integration token{hasStored ? ', replaces the saved one' : ''}
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                touch();
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
      </section>

      <div className="save-bar">
        <button type="submit" className="btn btn-solid" disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving' : 'Save changes'}
        </button>
        <span
          className={state === 'error' ? 'warn' : 'meta'}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {state === 'saved' || state === 'error' ? message : ''}
        </span>
      </div>
    </form>
  );
}

function PlanSection({ me }: { me: Me }) {
  const plan = planSummary(me.subscription);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cancel = async () => {
    setBusy(true);
    setError('');
    try {
      await cancelPlan();
      await refreshMe();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-sec" aria-labelledby="set-plan">
      <h3 id="set-plan" className="sheet-h">
        Plan
      </h3>
      <p className="plan-line">
        <span className="plan-name">{plan.title}</span>
        <span className="meta">{plan.detail}</span>
      </p>
      <div className="auth-actions">
        {plan.canUpgrade && (
          <Link to="pricing" className="btn">
            {plan.kind === 'free'
              ? 'Upgrade to Pro'
              : plan.kind === 'trial'
                ? 'Keep Pro'
                : 'Renew Pro'}
          </Link>
        )}
        {plan.canCancel && !confirming && (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Cancel plan
          </button>
        )}
      </div>
      {confirming && (
        <div className="confirm" role="group" aria-label="Confirm cancellation">
          <p>
            You keep Pro until the end of the current period. After that the queue switches off.
          </p>
          <div className="auth-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {busy ? 'Canceling' : 'Cancel plan'}
            </button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>
              Keep my plan
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
