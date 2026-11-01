import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SiiPageLayout,
  SiiPageHeader,
  SiiPanel,
  SiiFilterBar,
  SiiDataTable,
  SiiMetric,
  SiiStatusBadge,
  SiiEmptyState,
  SiiAsyncState,
} from '../../src/components/ui/sii-institutional';

const markup = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);

describe('SIII Institutional Component Architecture (Bloque B & D)', () => {
  it('SiiPageLayout renders accessible main container with consistent spacing', () => {
    const html = markup(
      createElement(SiiPageLayout, { maxWidth: 'lg' }, createElement('div', null, 'Contenido'))
    );
    expect(html).toContain('<main');
    expect(html).toContain('sii-page');
    expect(html).toContain('max-w-5xl');
    expect(html).toContain('Contenido');
  });

  it('SiiPageHeader renders semantic h1, kicker, description and actions', () => {
    const html = markup(
      createElement(SiiPageHeader, {
        eyebrow: 'EXPEDIENTES OFICIALES',
        title: 'Estudiantes',
        description: 'Padrón escolar activo',
        actions: createElement('button', { type: 'button' }, 'Nuevo'),
      })
    );
    expect(html).toContain('<h1');
    expect(html).toContain('>Estudiantes<');
    expect(html).toContain('EXPEDIENTES OFICIALES');
    expect(html).toContain('Padrón escolar activo');
    expect(html).toContain('<button');
    expect(html).toContain('Nuevo');
  });

  it('SiiPanel renders matte glass surface with explicit variants', () => {
    const defaultHtml = markup(
      createElement(SiiPanel, null, 'Panel por defecto')
    );
    const compactHtml = markup(
      createElement(SiiPanel, { variant: 'compact' }, 'Panel compacto')
    );
    const heroHtml = markup(
      createElement(SiiPanel, { variant: 'hero' }, 'Panel destacado')
    );
    expect(defaultHtml).toContain('siii-glass-surface');
    expect(compactHtml).toContain('p-3');
    expect(heroHtml).toContain('bg-primary-soft/10');
  });

  it('SiiFilterBar renders search input and custom actions seamlessly', () => {
    const onSearch = vi.fn();
    const html = markup(
      createElement(
        SiiFilterBar,
        {
          searchQuery: 'algebra',
          onSearchChange: onSearch,
          searchPlaceholder: 'Buscar asignatura…',
          actions: createElement('button', { type: 'button' }, 'Filtrar'),
        },
        createElement('span', null, 'Filtro adicional')
      )
    );
    expect(html).toContain('type="search"');
    expect(html).toContain('value="algebra"');
    expect(html).toContain('placeholder="Buscar asignatura…"');
    expect(html).toContain('Filtro adicional');
    expect(html).toContain('Filtrar');
  });

  it('SiiDataTable renders semantic table on desktop and accessible records on mobile', () => {
    const rows = [
      { id: '1', code: 'MAT-101', name: 'Matemáticas Discretas', credits: 8 },
      { id: '2', code: 'FIS-201', name: 'Física Clásica', credits: 10 },
    ];
    const columns = [
      { label: 'Clave', render: (r: (typeof rows)[0]) => r.code, sortValue: (r: (typeof rows)[0]) => r.code },
      { label: 'Materia', render: (r: (typeof rows)[0]) => r.name, sortValue: (r: (typeof rows)[0]) => r.name },
      { label: 'Créditos', render: (r: (typeof rows)[0]) => r.credits },
    ];
    const html = markup(
      createElement(SiiDataTable, {
        rows,
        columns,
        label: 'Materias',
        searchText: (r) => r.code + ' ' + r.name,
      })
    );
    expect(html).toContain('<table');
    expect(html).toContain('scope="col"');
    expect(html).toContain('Ordenar por Clave');
    expect(html).toContain('Matemáticas Discretas');
    expect(html).toContain('siii-personal-mobile-records');
    expect(html).toContain('Mostrando 1–2 de 2 registros');
  });

  it('SiiMetric renders tabular values, tone variants and action links', () => {
    const html = markup(
      createElement(SiiMetric, {
        label: 'Promedio general',
        value: '9.4',
        tone: 'green',
        href: '/dashboard/institutions/inst1/student#calificaciones',
        actionLabel: 'Ver historial',
      })
    );
    expect(html).toContain('Promedio general');
    expect(html).toContain('9.4');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('href="/dashboard/institutions/inst1/student#calificaciones"');
    expect(html).toContain('Ver historial');
  });

  it('SiiStatusBadge reflects semantic states with accessible contrast', () => {
    const activeHtml = markup(
      createElement(SiiStatusBadge, { variant: 'active' }, 'Inscrito')
    );
    const pendingHtml = markup(
      createElement(SiiStatusBadge, { variant: 'pending' }, 'En revisión')
    );
    const liveHtml = markup(
      createElement(SiiStatusBadge, { variant: 'live' }, 'En curso')
    );
    expect(activeHtml).toContain('Inscrito');
    expect(pendingHtml).toContain('En revisión');
    expect(liveHtml).toContain('sii-online-dot');
  });

  it('SiiEmptyState renders clear message without fabricated data', () => {
    const html = markup(
      createElement(SiiEmptyState, {
        title: 'Sin calificaciones',
        description: 'El periodo no cuenta con evaluaciones cerradas.',
        action: createElement('button', { type: 'button' }, 'Actualizar'),
      })
    );
    expect(html).toContain('Sin calificaciones');
    expect(html).toContain('El periodo no cuenta con evaluaciones cerradas.');
    expect(html).toContain('Actualizar');
  });

  it('SiiAsyncState handles loading, error and access denied consistently', () => {
    const loadingHtml = markup(
      createElement(SiiAsyncState, { loading: true }, createElement('div', null, 'Cuerpo'))
    );
    const errorHtml = markup(
      createElement(
        SiiAsyncState,
        { error: 'Error al conectar con la base de datos' },
        createElement('div', null, 'Cuerpo')
      )
    );
    const deniedHtml = markup(
      createElement(
        SiiAsyncState,
        { accessDenied: true },
        createElement('div', null, 'Cuerpo')
      )
    );

    expect(loadingHtml).toContain('role="status"');
    expect(loadingHtml).not.toContain('Cuerpo');
    expect(errorHtml).toContain('Error al conectar con la base de datos');
    expect(deniedHtml).toContain('No cuentas con los permisos institucionales');
  });
});
