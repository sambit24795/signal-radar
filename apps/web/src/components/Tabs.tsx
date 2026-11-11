import { useRef, type KeyboardEvent } from 'react';

interface Props {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Id of the tabpanel the tabs control. */
  panelId: string;
  /** Tab ids are `${idPrefix}-${id}`. */
  idPrefix: string;
}

/**
 * A text switch for a few sibling views: the current one in ink and bolder, the rest muted. No
 * underline, no rule. Arrow keys, Home and End move between the tabs.
 */
export function Tabs({ tabs, active, onChange, label, panelId, idPrefix }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const tab = tabs[next]!;
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={panelId}
          tabIndex={t.id === active ? 0 : -1}
          className="tab"
          data-label={t.label}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
