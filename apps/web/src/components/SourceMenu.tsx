import { useState } from 'react';
import { FilterMenu } from './FilterMenu';
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
  if (options.length < 2) return null;
  const available = options.map((o) => o.id);
  const on = effectiveKinds(value, available);
  const all = on.length === available.length;

  return (
    <FilterMenu
      mode="multi"
      open={open}
      onOpenChange={setOpen}
      label={kindsLabel(value, available)}
      active={!all}
      menuLabel="Show stories from"
      options={[
        { id: '', label: 'All sources', checked: all, disabled: all, lead: true },
        ...options.map((o) => {
          // While every source is on, only "All sources" carries the tick.
          const checked = !all && on.includes(o.id);
          // The last ticked source stays on, so the view is never empty.
          const last = checked && on.length === 1;
          return {
            id: o.id,
            label: o.label,
            checked,
            disabled: last,
            title: last ? 'Keep at least one source on' : undefined,
          };
        }),
      ]}
      onSelect={(id) => onChange(id === '' ? [] : toggleKind(value, available, id as SourceKind))}
    />
  );
}
