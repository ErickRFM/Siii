import type {ReactNode} from 'react';

/** Compact SVG icon set. Presentational only: labels and authorization stay in SiiAppShell. */
export type SiiNavIconName='home'|'institution'|'users'|'roles'|'mail'|'shield'|'book'|'registry'|'layers'|'grades'|'calendar'|'services';
const illustrations:Record<SiiNavIconName,ReactNode>={
  home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-8h6v8"/></>,
  institution:<><rect x="4" y="9" width="16" height="12" rx="1"/><path d="M2 9 12 3l10 6M9 21v-7h6v7M8 11h.01M16 11h.01"/></>,
  users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.2a4 4 0 0 1 0 7.6M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></>,
  roles:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5M16 16l2 2 3-3"/></>,
  mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  shield:<><path d="m12 2 9 4v6c0 6-3.8 9.5-9 11-5.2-1.5-9-5-9-11V6l9-4Z"/><path d="m9 12 2 2 4-4"/></>,
  book:<><path d="M12 7c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1ZM12 7v14"/></>,
  registry:<><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h4"/></>,
  layers:<><rect x="3" y="4" width="18" height="15" rx="2"/><path d="M7 2v4M17 2v4M3 10h18M7 14h4"/></>,
  grades:<><path d="m12 2 3 6 7 .9-5 5 .9 7.1L12 18l-5.9 3 .9-7.1-5-5 7-.9 3-6Z"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3"/></>,
  services:<><path d="M4 21V5l8-3 8 3v16M2 21h20M8 8h.01M16 8h.01M8 12h.01M16 12h.01M10 21v-5h4v5"/></>,
};
export function SiiNavIcon({name}:{name:SiiNavIconName}){
  return <svg className="sii-nav-glyph" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true" focusable="false">{illustrations[name]}</svg>;
}