import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronIcon } from '../icons';
import { SOURCE_FILTERS, type SourceFilter } from '../lib/view';

interface Props {
  options: { id: SourceFilter; label: string }[];
  value: SourceFilter;
  onChange: (id: SourceFilter) => void;
}

/** "All sources" as a quiet text control with a small menu; sources narrow the feed, topics lead it. */
export function SourceMenu({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (options.length < 2) return null;
  const current = SOURCE_FILTERS.find((o) => o.id === value)?.label ?? 'All sources';

  return (
    <div className="srcmenu" ref={root}>
      <button
        ref={button}
        type="button"
        className="text-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current}
        <ChevronIcon />
      </button>
      {open && (
        <div className="menu srcmenu-list" role="menu" aria-label="Show stories from">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === value}
              className="menu-item"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
                button.current?.focus();
              }}
            >
              <span className="menu-check" aria-hidden="true">
                {o.id === value && <CheckIcon />}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
