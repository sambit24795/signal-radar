import type { Niche, ScoredItem } from '@radar/core/ranking';
import { matchedKeywords } from '../lib/keywords';
import { metaParts } from '../lib/view';
import { ItemActions } from './ItemActions';

interface Props {
  items: ScoredItem[];
  niches: Niche[];
  now: number;
  /** Show "Save to Ideas" and "Summarize" under each story (the Read view). */
  saveable?: boolean;
}

export function ItemList({ items, niches, now, saveable = false }: Props) {
  return (
    <ol className="items">
      {items.map((item, i) => {
        const keywords = matchedKeywords(item, niches);
        const niche = niches.find((n) => item.niches.includes(n.id))?.name ?? null;
        return (
          <li key={item.id} className="item">
            <span className="rank" aria-hidden="true">
              {i + 1}
            </span>
            <div className="item-body">
              <h2 className="item-title">
                <a href={item.url} rel="noopener" target="_blank">
                  {item.title}
                </a>
              </h2>
              <p className="meta">{metaParts(item, now).join(' · ')}</p>
              {keywords.length > 0 && <p className="keywords">{keywords.join(', ')}</p>}
              {saveable && <ItemActions url={item.url} title={item.title} save={{ item, niche }} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ count = 7 }: { count?: number }) {
  return (
    <ol className="items" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="item skeleton">
          <span className="rank">{i + 1}</span>
          <div className="item-body">
            <div className="bar" style={{ width: `${88 - ((i * 13) % 30)}%` }} />
            <div className="bar short" style={{ width: `${40 + ((i * 17) % 25)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
