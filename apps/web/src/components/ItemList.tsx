import type { Niche, ScoredItem } from '@radar/core/ranking';
import { matchedKeywords } from '../lib/keywords';
import { metaParts } from '../lib/view';

interface Props {
  items: ScoredItem[];
  niches: Niche[];
  now: number;
}

export function ItemList({ items, niches, now }: Props) {
  return (
    <ol className="items">
      {items.map((item, i) => {
        const keywords = matchedKeywords(item, niches);
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton() {
  return (
    <ol className="items" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
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
