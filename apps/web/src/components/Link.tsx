import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { hrefFor, navigate, type RouteName } from '../lib/route';

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: RouteName;
  signup?: boolean;
  children: ReactNode;
}

/** An anchor that changes the route without a page load; modified clicks open normally. */
export function Link({ to, signup, onClick, children, ...rest }: Props) {
  const href = hrefFor(to, { signup });
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
