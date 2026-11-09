import type { ReactNode, Ref } from 'react';
import type { MeState } from '../lib/me';
import type { RouteName } from '../lib/route';
import { Masthead } from './Masthead';

interface Props {
  route: RouteName;
  me: MeState;
  dark: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
  /** Shown between the masthead and the page (the import offer). */
  banner?: ReactNode;
  footer?: ReactNode;
  mainRef?: Ref<HTMLElement>;
  children: ReactNode;
}

/** The page chrome. The app and the build-time pre-render both use it, so the two match. */
export function Frame({
  route,
  me,
  dark,
  onToggleTheme,
  onSignOut,
  banner,
  footer,
  mainRef,
  children,
}: Props) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to the content
      </a>
      <div className={route === 'landing' ? 'page page-wide' : 'page'}>
        <Masthead
          route={route}
          me={me}
          dark={dark}
          onToggleTheme={onToggleTheme}
          onSignOut={onSignOut}
        />
        {banner}
        <main id="main" ref={mainRef} tabIndex={-1} className="main">
          {children}
        </main>
        {footer}
      </div>
    </>
  );
}
