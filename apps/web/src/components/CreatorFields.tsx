import { useId } from 'react';
import {
  AUDIENCE_MAX,
  CREATOR_MAKES,
  CREATOR_TONES,
  MAKES_LABELS,
  RESOURCES_MAX,
  TONE_LABELS,
  type CreatorProfile,
} from '@radar/core/ranking';
import { setTone, toggleMake } from '../lib/creator';

interface Props {
  value: CreatorProfile;
  onChange: (next: CreatorProfile) => void;
}

/** What you make, who it is for, what you have, and the tone. Every field is optional. */
export function CreatorFields({ value, onChange }: Props) {
  const name = useId();
  return (
    <div className="creator-fields">
      <fieldset className="creator-set">
        <legend className="field-label">What you make</legend>
        <ul className="source-list">
          {CREATOR_MAKES.map((m) => (
            <li key={m}>
              <label className="source">
                <input
                  type="checkbox"
                  checked={value.makes.includes(m)}
                  onChange={() => onChange(toggleMake(value, m))}
                />
                <span className="source-name">{MAKES_LABELS[m]}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="field">
        <span className="field-label">Who is it for?</span>
        <input
          value={value.audience ?? ''}
          maxLength={AUDIENCE_MAX}
          placeholder="Junior web developers"
          autoComplete="off"
          onChange={(e) => onChange({ ...value, audience: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="field-label">What do you have to work with?</span>
        <input
          value={value.resources ?? ''}
          maxLength={RESOURCES_MAX}
          placeholder="A Mac, free tools only"
          autoComplete="off"
          onChange={(e) => onChange({ ...value, resources: e.target.value })}
        />
      </label>

      <fieldset className="creator-set">
        <legend className="field-label">Tone</legend>
        <ul className="source-list">
          {CREATOR_TONES.map((t) => (
            <li key={t}>
              <label className="source">
                <input
                  type="radio"
                  name={`${name}-tone`}
                  checked={value.tone === t}
                  onChange={() => undefined}
                  onClick={() => onChange(setTone(value, t))}
                />
                <span className="source-name">{TONE_LABELS[t]}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
