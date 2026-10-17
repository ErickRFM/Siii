'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {InstitutionCapabilitiesProvider, useInstitutionCapabilities, hasAnyCapability} from './institution-capabilities';
import {academicModuleLinks} from '@/shared/navigation/academic-modules';

type Institution = {institutionId:string; institutionName:string};
const modules = [
  {id:'registry',title:'Estudiantes y docentes',symbol:'▣',description:'Expedientes académicos de alumnos y profesores.'},
  {id:'operations',title:'Grupos e inscripciones',symbol:'▤',description:'Secciones, grupos e inscripciones institucionales.'},
  {id:'scheduling',title:'Horarios y aulas',symbol:'◷',description:'Aulas, horarios e instancias de clase.'},
  {id:'grading',title:'Calificaciones',symbol:'▦',description:'Evaluación y actas de los docentes asignados.'},
  {id:'services',title:'Servicios universitarios',symbol:'✉',description:'Avisos, solicitudes, tutorías y talleres.'},
] as const;

function Directory({institutionId,institutionName}:Institution){
  const {data,loading,error,refresh}=useInstitutionCapabilities();
  const visible = data && !data.restricted ? academicModuleLinks(data.capabilities) : [];
  const catalog = data && !data.restricted && ['programs','courses','curricula','terms','campuses'].some(resource => hasAnyCapability(data,`${resource}.read`));
  return <section aria-label={`Módulos de ${institutionName}`}>
    <h3>{institutionName}</h3>
    {loading && <p role="status">Consultando módulos autorizados…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="sii-outline-button" onClick={refresh}>Reintentar</button></div>}
    {data?.restricted && <p>Completa la verificación de seguridad de tu institución para habilitar los módulos. <Link href="/dashboard/security">Ir a seguridad</Link></p>}
    {data && !data.restricted && visible.length===0 && !catalog && <p>No hay módulos habilitados para tu rol institucional.</p>}
    {data && !data.restricted && <div className="sii-module-grid">
      {catalog && <Link href={`/dashboard/institutions/${institutionId}/academic` as Route} className="sii-module-card">
        <span className="sii-module-glyph" aria-hidden="true">▦</span><h3>Catálogo académico</h3><p>Programas, materias, campus y periodos.</p>
        <div className="sii-module-bottom"><span>Abrir catálogo</span><span aria-hidden="true">↗</span></div>
      </Link>}
      {modules.filter(module => visible.some(link=>link.id===module.id)).map(module=><Link key={module.id}
        href={`/dashboard/institutions/${institutionId}/${module.id}` as Route} className="sii-module-card">
        <span className="sii-module-glyph" aria-hidden="true">{module.symbol}</span>
        <h3>{module.title}</h3><p>{module.description}</p>
        <div className="sii-module-bottom"><span>Abrir módulo</span><span aria-hidden="true">↗</span></div>
      </Link>)}
    </div>}
  </section>;
}
export default function InstitutionModuleDirectory(props:Institution){
  return <InstitutionCapabilitiesProvider institutionId={props.institutionId}><Directory {...props}/></InstitutionCapabilitiesProvider>;
}
