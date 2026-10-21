import type {ReactNode} from 'react';

/** A named, keyboard-focusable table viewport (WCAG 2.1.1 / 2.4.7).
 *  The tab stop is required when the horizontal table cannot fit the page.
 *  Preserve the table's native semantics and keep the document itself scroll-free. */
export default function SiiScrollRegion({label,children}:{label:string;children:ReactNode}) {
  // Scrollable regions are a documented accessibility exception to noninteractive tab stops.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access for overflow containers
  return <div className="sii-catalog-scroll" role="region" tabIndex={0} aria-label={label}>{children}</div>;
}
