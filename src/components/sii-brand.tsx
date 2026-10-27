import Link from 'next/link';

export function SiiMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="sii-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none" focusable="false">
        <path d="M20 5 34 12v15L20 35 6 27V12L20 5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="m11 17 9-6 9 6M13 18h14M15 18v10m5-10v10m5-10v10M12 29h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20 7v5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {!compact && <span className="sii-mark-spark" />}
    </span>
  );
}

export function SiiBrand({ light = false }: { light?: boolean }) {
  return (
    <Link className={light ? 'sii-brand sii-brand--light' : 'sii-brand'} href="/dashboard" aria-label="SII, ir al inicio institucional">
      <SiiMark />
      <span className="sii-brand-name">SII</span>
      <span className="sii-brand-caption">Sistema Institucional<br/>Integral</span>
    </Link>
  );
}
