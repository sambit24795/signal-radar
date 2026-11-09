import { forwardRef } from 'react';
import { SearchIcon } from '../icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** A plain line to type on: no box, a hairline underneath, set in the page's own serif. */
export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
  { value, onChange, onClear },
  ref,
) {
  return (
    <div className="find" role="search">
      <span className="find-icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        ref={ref}
        type="search"
        className="find-input"
        aria-label="Search stories, topics and sources"
        placeholder="Search stories, topics, sources"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onClear();
          }
        }}
      />
      {value ? (
        <button type="button" className="link-quiet find-clear" onClick={onClear}>
          Clear
        </button>
      ) : (
        <span className="find-key" aria-hidden="true">
          /
        </span>
      )}
    </div>
  );
});
