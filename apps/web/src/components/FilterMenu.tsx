import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { CheckIcon, ChevronIcon } from '../icons';

export interface MenuOption {
  id: string;
  label: string;
  checked: boolean;
  /** Greyed out and not selectable; `title` says why. */
  disabled?: boolean;
  title?: string;
  /** Sits above the rest with a rule under it ("All sources"). */
  lead?: boolean;
}

interface Props {
  /** What the trigger shows. */
  label: ReactNode;
  /** A filter is on: the trigger is filled. */
  active?: boolean;
  /** Accessible name of the menu. */
  menuLabel: string;
  options: MenuOption[];
  /** `multi` ticks any number of entries (checkbox); `single` picks one and closes (radio). */
  mode: 'multi' | 'single';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}

/**
 * A quiet text trigger that opens a menu: a popover on wide screens, a bottom sheet on phones
 * (CSS decides). Arrow keys move, Home/End jump, Escape closes and returns to the trigger.
 */
export function FilterMenu({
  label,
  active = false,
  menuLabel,
  options,
  mode,
  open,
  onOpenChange,
  onSelect,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const role = mode === 'multi' ? 'menuitemcheckbox' : 'menuitemradio';

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];

  // Opening puts focus on the ticked entry (or the first), so the keyboard is already inside.
  useEffect(() => {
    if (!open) return;
    const all = items();
    (
      all.find((el) => el.getAttribute('aria-checked') === 'true' && !el.dataset.lead) ?? all[0]
    )?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onOpenChange]);

  const close = (refocus: boolean) => {
    onOpenChange(false);
    if (refocus) button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      onOpenChange(false);
      return;
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const rows = items();
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? rows.length - 1
          : e.key === 'ArrowDown'
            ? (at + 1) % rows.length
            : (at - 1 + rows.length) % rows.length;
    rows[next]?.focus();
    e.preventDefault();
  };

  return (
    <div className="fmenu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="fmenu-trigger"
        data-active={active || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        <span className="chip-label">{label}</span>
        <ChevronIcon />
      </button>
      {open && (
        <>
          <div className="fmenu-scrim" aria-hidden="true" onClick={() => close(true)} />
          <div ref={list} id={id} className="menu fmenu-list" role="menu" aria-label={menuLabel}>
            <span className="fmenu-grip" aria-hidden="true" />
            <span className="fmenu-head" aria-hidden="true">
              {menuLabel}
            </span>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role={role}
                aria-checked={o.checked}
                aria-disabled={o.disabled || undefined}
                data-lead={o.lead || undefined}
                title={o.title}
                tabIndex={-1}
                className={o.lead ? 'menu-item fmenu-lead' : 'menu-item'}
                onClick={() => {
                  if (o.disabled) return;
                  onSelect(o.id);
                  if (mode === 'single') close(true);
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {o.checked && <CheckIcon />}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
