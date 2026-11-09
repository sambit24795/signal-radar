import type { SourceRef } from '../lib/feed';

export const TYPE_LABEL: Record<SourceRef['type'], string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  github: 'GitHub',
  rss: 'Feed',
};

export function SourcesEditor({
  sources,
  enabled,
  onToggle,
}: {
  sources: SourceRef[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="source-list">
      {sources.map((s) => (
        <li key={s.id}>
          <label className="source">
            <input type="checkbox" checked={enabled.has(s.id)} onChange={() => onToggle(s.id)} />
            <span className="source-name">{s.name}</span>
            <span className="meta">{TYPE_LABEL[s.type]}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
