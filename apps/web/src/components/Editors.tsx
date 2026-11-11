import type { SourceRef } from '../lib/feed';

export const TYPE_LABEL: Record<SourceRef['type'], string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  github: 'GitHub',
  rss: 'Feed',
  lobsters: 'Lobsters',
  devto: 'DEV',
  mastodon: 'Mastodon',
  youtube: 'YouTube',
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
      {sources.map((s) => {
        const kind = TYPE_LABEL[s.type];
        // "Hacker News  Hacker News": show the kind only when it adds something
        const echoes = s.name.toLowerCase().includes(kind.toLowerCase());
        return (
          <li key={s.id}>
            <label className="source">
              <input type="checkbox" checked={enabled.has(s.id)} onChange={() => onToggle(s.id)} />
              <span className="source-name">{s.name}</span>
              {!echoes && <span className="meta">{kind}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
