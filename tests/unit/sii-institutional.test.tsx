import { describe, it, expect, vi } from 'vitest';
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

type SubjectRow = { id: string; code: string; name: string; credits: number };

describe('SIII Institutional Component Architecture (Bloque B & D)', () => {
  it('SiiPageLayout renders accessible main container with consistent spacing', () => {
    const html = renderToStaticMarkup(
      <SiiPageLayout maxWidth="lg">
        <div>Contenido</div>
      </SiiPageLayout>
    );
    expect(html).toContain('<main');
    expect(html).toContain('sii-page');
    expect(html).toContain('max-w-5xl');
    expect(html).toContain('Contenido');
  });

  it('SiiPageHeader renders semantic h1, kicker, description and actions', () => {
    const html = renderToStaticMarkup(
      <SiiPageHeader
        eyebrow="EXPEDIENTES OFICIALES"
        title="Estudiantes"
        description="Padrón escolar activo"
        actions={<button type="button">Nuevo</button>}
      />
    );
    expect(html).toContain('<h1');
    expect(html).toContain('>Estudiantes<');
    expect(html).toContain('EXPEDIENTES OFICIALES');
    expect(html).toContain('Padrón escolar activo');
    expect(html).toContain('<button');
    expect(html).toContain('Nuevo');
  });

  it('SiiPanel renders matte glass surface with explicit variants', () => {
    const defaultHtml = renderToStaticMarkup(<SiiPanel>Panel por defecto</SiiPanel>);
    const compactHtml = renderToStaticMarkup(<SiiPanel variant="compact">Panel compacto</SiiPanel>);
    const heroHtml = renderToStaticMarkup(<SiiPanel variant="hero">Panel destacado</SiiPanel>);

    expect(defaultHtml).toContain('siii-glass-surface');
    expect(compactHtml).toContain('p-3');
    expect(heroHtml).toContain('bg-primary-soft/10');
  });

  it('SiiFilterBar renders search input and custom actions seamlessly', () => {
    const onSearch = vi.fn();
    const html = renderToStaticMarkup(
      <SiiFilterBar
        searchQuery="algebra"
        onSearchChange={onSearch}
        searchPlaceholder="Buscar asignatura…"
        actions={<button type="button">Filtrar</button>}
      >
        <span>Filtro adicional</span>
      </SiiFilterBar>
    );
    expect(html).toContain('type="search"');
    expect(html).toContain('value="algebra"');
    expect(html).toContain('placeholder="Buscar asignatura…"');
    expect(html).toContain('Filtro adicional');
    expect(html).toContain('Filtrar');
  });

  it('SiiDataTable renders semantic table on desktop and accessible records on mobile', () => {
    const rows: SubjectRow[] = [
      { id: '1', code: 'MAT-101', name: 'Matemáticas Discretas', credits: 8 },
      { id: '2', code: 'FIS-201', name: 'Física Clásica', credits: 10 },
    ];
    const columns = [
      { label: 'Clave', render: (r: SubjectRow) => r.code, sortValue: (r: SubjectRow) => r.code },
      { label: 'Materia', render: (r: SubjectRow) => r.name, sortValue: (r: SubjectRow) => r.name },
      { label: 'Créditos', render: (r: SubjectRow) => r.credits },
    ];
    const html = renderToStaticMarkup(
      <SiiDataTable<SubjectRow>
        rows={rows}
        columns={columns}
        label="Materias"
        searchText={(r) => r.code + ' ' + r.name}
      />
    );
    expect(html).toContain('<table');
    expect(html).toContain('scope="col"');
    expect(html).toContain('Ordenar por Clave');
    expect(html).toContain('Matemáticas Discretas');
    expect(html).toContain('siii-personal-mobile-records');
    expect(html).toContain('Mostrando 1–2 de 2 registros');
  });

  it('SiiMetric renders tabular values, tone variants and action links', () => {
    const html = renderToStaticMarkup(
      <SiiMetric
        label="Promedio general"
        value="9.4"
        tone="green"
        href="/dashboard/institutions/inst1/student#calificaciones"
        actionLabel="Ver historial"
      />
    );
    expect(html).toContain('Promedio general');
    expect(html).toContain('9.4');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('href="/dashboard/institutions/inst1/student#calificaciones"');
    expect(html).toContain('Ver historial');
  });

  it('SiiStatusBadge reflects semantic states with accessible contrast', () => {
    const activeHtml = renderToStaticMarkup(<SiiStatusBadge variant="active">Inscrito</SiiStatusBadge>);
    const pendingHtml = renderToStaticMarkup(<SiiStatusBadge variant="pending">En revisión</SiiStatusBadge>);
    const liveHtml = renderToStaticMarkup(<SiiStatusBadge variant="live">En curso</SiiStatusBadge>);

    expect(activeHtml).toContain('Inscrito');
    expect(pendingHtml).toContain('En revisión');
    expect(liveHtml).toContain('sii-online-dot');
  });

  it('SiiEmptyState renders clear message without fabricated data', () => {
    const html = renderToStaticMarkup(
      <SiiEmptyState
        title="Sin calificaciones"
        description="El periodo no cuenta con evaluaciones cerradas."
        action={<button type="button">Actualizar</button>}
      />
    );
    expect(html).toContain('Sin calificaciones');
    expect(html).toContain('El periodo no cuenta con evaluaciones cerradas.');
    expect(html).toContain('Actualizar');
  });

  it('SiiAsyncState handles loading, error and access denied consistently', () => {
    const loadingHtml = renderToStaticMarkup(
      <SiiAsyncState loading={true}>
        <div>Cuerpo</div>
      </SiiAsyncState>
    );
    const errorHtml = renderToStaticMarkup(
      <SiiAsyncState error="Error al conectar con la base de datos">
        <div>Cuerpo</div>
      </SiiAsyncState>
    );
    const deniedHtml = renderToStaticMarkup(
      <SiiAsyncState accessDenied={true}>
        <div>Cuerpo</div>
      </SiiAsyncState>
    );

    expect(loadingHtml).toContain('role="status"');
    expect(loadingHtml).not.toContain('Cuerpo');
    expect(errorHtml).toContain('Error al conectar con la base de datos');
    expect(deniedHtml).toContain('No cuentas con los permisos institucionales');
  });
});
