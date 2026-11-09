import type { Niche } from '@radar/core/ranking';
import { nicheLabel } from '../lib/view';

interface Props {
  niches: Niche[];
  active: string | null;
  onChange: (id: string | null) => void;
}

export function NicheChips({ niches, active, onChange }: Props) {
  return (
    <div className="chips" role="group" aria-label="Filter by niche">
      <button
        type="button"
        className="chip"
        aria-pressed={active === null}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {niches.map((n) => (
        <button
          key={n.id}
          type="button"
          className="chip"
          title={n.name}
          aria-pressed={active === n.id}
          onClick={() => onChange(active === n.id ? null : n.id)}
        >
          {nicheLabel(n.name)}
        </button>
      ))}
    </div>
  );
}
