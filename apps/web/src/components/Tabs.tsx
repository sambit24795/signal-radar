import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

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

const FADE = 28;

/**
 * Text tabs on a hairline. A long row scrolls sideways under a soft edge fade, so it never looks
 * clipped, and the active tab is kept in view.
 */
export function Tabs({ tabs, active, onChange, label, panelId, idPrefix }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const list = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: 0, right: 0 });

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setFade({
      left: el.scrollLeft > 2 ? FADE : 0,
      right: max - el.scrollLeft > 2 ? FADE : 0,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = list.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  useEffect(() => {
    refs.current[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

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
    <div
      ref={list}
      className="tabs"
      role="tablist"
      aria-label={label}
      onScroll={measure}
      style={{ '--fade-l': `${fade.left}px`, '--fade-r': `${fade.right}px` } as CSSProperties}
    >
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
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
