import { useEffect, useRef, useState } from 'react';
import type { MeState } from '../lib/me';
import { Link } from './Link';

interface Props {
  me: MeState;
  onSignOut: () => void;
}

export function AccountMenu({ me, onSignOut }: Props) {
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

  if (me.status !== 'ready') {
    // Do not flash "Sign in" while the session is still being checked.
    if (me.status === 'loading') return <span className="account-slot" aria-hidden="true" />;
    return (
      <Link to="signin" className="btn">
        Sign in
      </Link>
    );
  }

  const { user } = me.me;
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="account" ref={root}>
      <button
        ref={button}
        type="button"
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account, ${user.email}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-who meta">{user.email}</p>
          <Link to="settings" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
