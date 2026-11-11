import { FilterMenu } from './FilterMenu';
import { ALL_TOPICS, topicsLabel } from '../lib/view';

interface Props {
  options: { id: string; label: string }[];
  /** Ticked topics; empty means all. */
  active: readonly string[];
  /** Called with the menu entry picked ("all" or a topic id). */
  onToggle: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "All topics" as a quiet text control; the menu ticks any number of topics, like sources. */
export function TopicMenu({ options, active, onToggle, open, onOpenChange }: Props) {
  const all = active.length === 0;
  return (
    <FilterMenu
      mode="multi"
      open={open}
      onOpenChange={onOpenChange}
      label={topicsLabel(active, options)}
      active={!all}
      menuLabel="Show stories about"
      options={options.map((o) =>
        o.id === ALL_TOPICS
          ? { ...o, checked: all, disabled: all, lead: true }
          : { ...o, checked: active.includes(o.id) },
      )}
      onSelect={onToggle}
    />
  );
}
