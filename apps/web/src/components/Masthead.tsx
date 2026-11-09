import { MoonIcon, RadarMark, SunIcon } from '../icons';

interface Props {
  dark: boolean;
  onToggleTheme: () => void;
  onCustomize: () => void;
}

export function Masthead({ dark, onToggleTheme, onCustomize }: Props) {
  return (
    <header className="masthead">
      <h1 className="wordmark">
        <RadarMark />
        <span>Signal Radar</span>
      </h1>
      <div className="masthead-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className="btn" onClick={onCustomize}>
          Customize
        </button>
      </div>
    </header>
  );
}
