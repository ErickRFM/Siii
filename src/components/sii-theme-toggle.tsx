'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
export default function SiiThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('sii-theme');
      const resolved: Theme = saved === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.siiTheme = resolved;
      setTheme(resolved);
    } catch {
      document.documentElement.dataset.siiTheme = 'light';
    }
  }, []);
  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.siiTheme = next;
    try { window.localStorage.setItem('sii-theme', next); } catch {}
  };
  return (
    <button className="sii-theme-toggle" type="button" onClick={toggle}
      aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}
      title={theme === 'light' ? 'Tema oscuro' : 'Tema claro'}>
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  );
}
