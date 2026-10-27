'use client';

import Link from 'next/link';
import {InstitutionCapabilitiesProvider,useInstitutionCapabilities,hasAnyCapability} from './institution-capabilities';
import {academicModuleLinks} from '@/shared/navigation/academic-modules';
import {personalModuleLinks,hasOnlyPersonalRoles} from '@/shared/navigation/personal-modules';
import {SiiModuleTile,SiiSkeleton} from './ui/sii-kit';
import type {SiiNavIconName} from './sii-nav-icon';
import {Button} from '@/components/ui/button';

type Institution={institutionId:string;institutionName:string};
const modules:readonly {id:string;title:string;icon:SiiNavIconName;description:string}[]=[
 {id:'registry',title:'Estudiantes y docentes',icon:'registry',description:'Expedientes académicos de alumnos y profesores.'},
 {id:'operations',title:'Grupos e inscripciones',icon:'layers',description:'Secciones, grupos e inscripciones institucionales.'},
 {id:'scheduling',title:'Horarios y aulas',icon:'calendar',description:'Aulas, horarios e instancias de clase.'},
 {id:'grading',title:'Calificaciones',icon:'grades',description:'Evaluación y actas de los docentes asignados.'},
 {id:'services',title:'Servicios universitarios',icon:'services',description:'Avisos, solicitudes, tutorías y talleres.'},
 {id:'admissions',title:'Admisiones',icon:'registry',description:'Solicitudes de ingreso y acceso al portal de aspirantes.'}
];

function Directory({institutionId,institutionName}:Institution){
 const {data,loading,error,refresh}=useInstitutionCapabilities();
 const visible=data&&!data.restricted?academicModuleLinks(data.capabilities):[];
 const personal=data&&!data.restricted?personalModuleLinks(data.capabilities,data.roles,data.scopedCapabilities):[];
 const personalOnly=Boolean(data&&hasOnlyPersonalRoles(data.roles));
 const catalog=data&&!data.restricted&&['programs','courses','curricula','terms','campuses'].some(resource=>hasAnyCapability(data,`${resource}.read`));
 return <section aria-label={`Módulos de ${institutionName}`} className="space-y-3">
  <h3 className="text-sm font-semibold text-muted-foreground">{institutionName}</h3>
  {loading&&!data&&<SiiSkeleton label="Consultando módulos autorizados"/>}
  {error&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" onClick={refresh}>Reintentar</Button></div>}
  {data?.restricted&&<p className="text-sm text-muted-foreground">Completa la verificación de seguridad de tu institución para habilitar los módulos. <Link href="/dashboard/security" className="font-semibold text-primary underline">Ir a seguridad</Link></p>}
  <div className="sii-module-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
   {personal.map(module=><SiiModuleTile key={module.id} title={module.label} description={module.description} icon={module.icon} href={`/dashboard/institutions/${institutionId}/${module.id}`}/>)}
   {(personalOnly?[]:[{id:'academic',title:'Catálogo académico',icon:'book' as SiiNavIconName,description:'Programas, materias, campus y periodos.'},...modules]).map(module=>{
    const allowed=Boolean(data&&!data.restricted&&(module.id==='academic'?catalog:visible.some(link=>link.id===module.id)));
    const reason=loading?'Verificando permisos…':error?'No se pudieron consultar permisos':data?.restricted?'Requiere verificación de seguridad':'Sin permiso para este módulo';
    return <SiiModuleTile key={module.id} title={module.title} description={module.description} icon={module.icon}
     href={allowed?`/dashboard/institutions/${institutionId}/${module.id}`:undefined}
     disabledReason={reason}/>;
   })}
  </div>
 </section>;
}
export default function InstitutionModuleDirectory(props:Institution){
 return <InstitutionCapabilitiesProvider institutionId={props.institutionId}><Directory {...props}/></InstitutionCapabilitiesProvider>;
}
