import { useEffect, useRef, useState } from 'react';
import type { Niche, ScoredItem } from '@radar/core/ranking';
import { metaParts, PAGE_SIZE, showMore } from '../lib/view';
import { META_SEP } from '../lib/format';
import { ItemActions } from './ItemActions';

interface Props {
  items: ScoredItem[];
  niches: Niche[];
  now: number;
  /** Show "Save to Ideas" and "Summarize" under each story (the Read view). */
  saveable?: boolean;
  /** Show the first page and a "Show more" button after it. Remount (key) to start over. */
  paged?: boolean;
  /** Said under the last row once the list is exhausted. */
  end?: string;
}

export function ItemList({ items, niches, now, saveable = false, paged = false, end }: Props) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const list = useRef<HTMLOListElement>(null);
  const revealed = useRef<number | null>(null);
  const visible = paged ? items.slice(0, shown) : items;
  const left = items.length - visible.length;

  // After "Show more" the focus moves to the first new story, so the keyboard continues from there.
  useEffect(() => {
    if (revealed.current === null) return;
    list.current?.querySelectorAll<HTMLElement>('.item-title a')[revealed.current]?.focus();
    revealed.current = null;
  }, [shown]);

  return (
    <>
      <ol className="items" ref={list}>
        {visible.map((item, i) => {
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
                <p className="meta">{metaParts(item, now).join(META_SEP)}</p>
                {saveable && (
                  <ItemActions url={item.url} title={item.title} save={{ item, niche }} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {paged && left > 0 && (
        <div className="more">
          <button
            type="button"
            className="more-btn"
            onClick={() => {
              revealed.current = visible.length;
              setShown(showMore(shown, items.length));
            }}
          >
            Show {Math.min(PAGE_SIZE, left)} more
          </button>
        </div>
      )}
      {paged && left === 0 && end && <p className="list-end">{end}</p>}
    </>
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
