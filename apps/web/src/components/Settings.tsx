import { useEffect, useState, type FormEvent } from 'react';
import type { CreatorProfile, Niche } from '@radar/core/ranking';
import { saveConfig, useConfig, type DraftFeed, type ServerConfig } from '../lib/config';
import type { Defaults } from '../lib/feed';
import type { Me } from '../lib/me';
import { planSummary } from '../lib/plan';
import { proUntilNote } from '../lib/passes';
import { creatorToSave, emptyCreator } from '../lib/creator';
import { CreatorFields } from './CreatorFields';
import { Link } from './Link';
import { SourcesEditor } from './Editors';
import { TopicPicker } from './TopicPicker';
import { FeedAdder, FeedList } from './Feeds';
import { MAX_CUSTOM_FEEDS } from '../lib/feeds';
import { Notifications } from './Notifications';

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
        <SettingsForm config={config} defaults={defaults} me={me} />
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

function SettingsForm({
  config,
  defaults,
  me,
}: {
  config: ServerConfig;
  defaults: Defaults;
  me: Me;
}) {
  const isPro = me.subscription.isPro;
  const allIds = defaults.sources.map((s) => s.id);
  const [niches, setNiches] = useState<Niche[]>(() => config.niches);
  const [creator, setCreator] = useState<CreatorProfile>(() => config.creator ?? emptyCreator());
  const [enabled, setEnabled] = useState(
    () => new Set(config.sources.length > 0 ? config.sources : allIds),
  );
  const [feeds, setFeeds] = useState<DraftFeed[]>(() => config.customFeeds);
  const [dbId, setDbId] = useState(config.notion?.dbId ?? '');
  const [token, setToken] = useState('');
  const [tokenMode, setTokenMode] = useState<TokenMode>(
    config.notion?.hasToken ? 'keep' : 'replace',
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // "Saved" on the button is brief; it returns to its label by itself
  useEffect(() => {
    if (state !== 'saved') return;
    const t = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(t);
  }, [state]);

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
          customFeeds: feeds,
          niches,
          creator: creatorToSave(creator),
          sources: allIds.filter((id) => enabled.has(id)),
          notion,
        },
        newToken,
        isPro,
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
          Topics
        </h3>
        <p className="hint">
          Stories are ranked by how well they match the words behind each topic.
        </p>
        <TopicPicker
          niches={niches}
          onChange={(n) => {
            setNiches(n);
            touch();
          }}
        />
      </section>

      <section className="settings-sec" aria-labelledby="set-briefs">
        <h3 id="set-briefs" className="sheet-h">
          Your briefs
        </h3>
        <p className="hint">
          Hooks, angles and titles are written for what you make and who it is for.
          {isPro
            ? ''
            : ' Briefs are part of Pro, and what you fill in here is kept for when you upgrade.'}
        </p>
        <CreatorFields
          value={creator}
          onChange={(c) => {
            setCreator(c);
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

      <section className="settings-sec" aria-labelledby="set-feeds">
        <h3 id="set-feeds" className="sheet-h">
          Your feeds
        </h3>
        {isPro ? (
          <>
            <p className="hint">
              RSS or Atom feeds you follow, ranked against your topics in your queue. Up to{' '}
              {MAX_CUSTOM_FEEDS}.
            </p>
            <FeedList
              feeds={feeds}
              onRemove={(url) => {
                setFeeds(feeds.filter((f) => f.url !== url));
                touch();
              }}
            />
            <FeedAdder
              have={new Set(feeds.map((f) => f.url))}
              onAdd={(f) => {
                setFeeds([...feeds, f]);
                touch();
              }}
            />
          </>
        ) : (
          <>
            <p className="hint">
              Bring your own RSS or Atom feeds, so topics like space or personal finance have
              something to rank. This is part of Pro.
            </p>
            {config.customFeeds.length > 0 && (
              <p className="hint">
                Your {config.customFeeds.length} saved{' '}
                {config.customFeeds.length === 1 ? 'feed is' : 'feeds are'} paused until you are on
                Pro again.
              </p>
            )}
            <Link to="pricing" className="link">
              See Pro
            </Link>
          </>
        )}
      </section>

      <Notifications me={me} />

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
        <div className="save-bar">
          <button type="submit" className="btn btn-solid" disabled={state === 'saving'}>
            {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : 'Save changes'}
          </button>
          <span
            className={state === 'error' ? 'warn' : 'meta'}
            role={state === 'error' ? 'alert' : 'status'}
          >
            {state === 'error' ? message : ''}
          </span>
        </div>
      </section>
    </form>
  );
}

function PlanSection({ me }: { me: Me }) {
  const plan = planSummary(me.subscription);
  const proUntil = proUntilNote(me.proUntil);
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
            {plan.kind === 'free' ? 'See Pricing' : 'Keep Pro'}
          </Link>
        )}
        {proUntil && !plan.canUpgrade && (
          <Link to="pricing" className="btn">
            Add days
          </Link>
        )}
      </div>
    </section>
  );
}
