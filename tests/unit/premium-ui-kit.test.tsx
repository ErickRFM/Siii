import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SiiPageIntro,SiiSectionHeader,SiiMetricTile,SiiModuleTile,SiiSkeleton,SiiEmptyView} from '../../src/components/ui/sii-kit';

const markup=(node:ReturnType<typeof createElement>)=>renderToStaticMarkup(node);
describe('SIII Premium UI Kit - server-compatible component contracts',()=>{
 it('renders the institutional heading with a real h1',()=>{
   const html=markup(createElement(SiiPageIntro,{eyebrow:'CONTROL ESCOLAR',title:'Inicio',description:'Permisos institucionales'}));
   expect(html).toContain('<h1>Inicio');expect(html).toContain('Permisos institucionales');
 });
 it('keeps workspace headings semantically readable',()=>{
   const html=markup(createElement(SiiSectionHeader,{eyebrow:'DOCENCIA',title:'Calificaciones',workspace:true,description:'Registros oficiales'}));
   expect(html).toContain('sii-catalog-summary');expect(html).toContain('<h2>Calificaciones</h2>');
 });
 it('renders a metric with a decorative SVG and real data',()=>{
   const html=markup(createElement(SiiMetricTile,{label:'Instituciones',value:3,icon:'institution',caption:'Acceso verificado'}));
   expect(html).toContain('>3</span>');expect(html).toContain('aria-hidden="true"');expect(html).toContain('Acceso verificado');
 });
 it('never turns an unauthorized module into a navigable link',()=>{
   const html=markup(createElement(SiiModuleTile,{title:'Calificaciones',icon:'grades',description:'Actas oficiales',disabledReason:'Sin permiso para este módulo'}));
   expect(html).toContain('<article');expect(html).not.toContain('<a ');expect(html).toContain('Sin permiso para este módulo');
 });
 it('shows accessible loading and empty states without fake data',()=>{
   const loading=markup(createElement(SiiSkeleton,{label:'Consultando permisos'}));
   const empty=markup(createElement(SiiEmptyView,{icon:'institution',title:'Sin instituciones',description:'Contacta administración'}));
   expect(loading).toContain('role="status"');expect(loading).toContain('Consultando permisos');
   expect(empty).toContain('Sin instituciones');expect(empty).toContain('Contacta administración');
 });
});
