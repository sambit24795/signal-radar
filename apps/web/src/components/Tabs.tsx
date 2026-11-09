import { useRef, type KeyboardEvent } from 'react';
import type { TabId } from '../lib/view';

interface Props {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onChange: (id: TabId) => void;
}

export function Tabs({ tabs, active, onChange }: Props) {
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
    <div className="tabs" role="tablist" aria-label="Views">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls="feed-panel"
          tabIndex={t.id === active ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
