import { useEffect, useRef } from 'react';
import { CloseIcon } from '../icons';
import { gate, gateCopy, hideGate } from '../lib/gate';
import { useMe } from '../lib/me';
import { Link } from './Link';

/** The one app-level sign-in sheet for signed-out taps on Save to Ideas or Summarize. */
export function SignInSheet() {
  const kind = gate.use();
  const me = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const open = kind !== null && me.status !== 'ready';

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const copy = kind ? gateCopy(kind) : null;

  return (
    <dialog
      ref={ref}
      className="sheet sheet-small"
      aria-labelledby="gate-title"
      onClose={hideGate}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) hideGate();
      }}
    >
      {open && copy && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 id="gate-title" className="sheet-title">
              {copy.title}
            </h2>
            <button type="button" className="icon-btn" onClick={hideGate} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className="gate-body">
            <p className="hint">{copy.line}</p>
            <Link to="signin" signup className="btn btn-solid" onClick={hideGate}>
              Create free account
            </Link>
            <Link to="signin" className="text-btn" onClick={hideGate}>
              Sign in
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
