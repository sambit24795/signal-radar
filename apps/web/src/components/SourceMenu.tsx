import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronIcon } from '../icons';
import { effectiveKinds, kindsLabel, toggleKind, type SourceKind } from '../lib/view';

interface Props {
  options: { id: SourceKind; label: string }[];
  /** What the user ticked; empty means every source. */
  value: readonly string[];
  /** Called with what to save: empty when every source is on. */
  onChange: (kinds: SourceKind[]) => void;
}

/** "All sources" as a quiet text control; the menu ticks any number of sources, never none. */
export function SourceMenu({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
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
  const available = options.map((o) => o.id);
  const on = effectiveKinds(value, available);
  const all = on.length === available.length;

  const arrows = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [
      ...(list.current?.querySelectorAll<HTMLElement>('[role=menuitemcheckbox]') ?? []),
    ];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length;
    rows[next]?.focus();
    e.preventDefault();
  };

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
        {kindsLabel(value, available)}
        <ChevronIcon />
      </button>
      {open && (
        <div
          ref={list}
          className="menu srcmenu-list"
          role="menu"
          aria-label="Show stories from"
          onKeyDown={arrows}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={all}
            aria-disabled={all}
            className="menu-item srcmenu-all"
            onClick={() => onChange([])}
          >
            <span className="menu-check" aria-hidden="true">
              {all && <CheckIcon />}
            </span>
            All sources
          </button>
          {options.map((o) => {
            const checked = on.includes(o.id);
            // The last ticked source stays on, so the view is never empty.
            const last = checked && on.length === 1;
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                aria-disabled={last}
                title={last ? 'Keep at least one source on' : undefined}
                className="menu-item"
                onClick={() => {
                  if (!last) onChange(toggleKind(value, available, o.id));
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {checked && <CheckIcon />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
