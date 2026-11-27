import Link from 'next/link';
import type {Route} from 'next';
import {redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import {ROLE_LABELS,hasPermission} from '@/shared/auth/roles';
import PasswordChange from './password-change';
import {ManageableInstitutions} from '@/components/institution-admin';
import InstitutionModuleDirectory from '@/components/institution-module-directory';
import {SiiPageIntro,SiiSectionHeader,SiiMetricTile,SiiEmptyView} from '@/components/ui/sii-kit';
import {Badge} from '@/components/ui/badge';
import {PERSONAL_ENTRY_ROLES,personalEntryAvailable,resolveDashboardEntry} from '@/shared/navigation/dashboard-entry';
import {hasInstitutionManagementPageAccess} from '@/shared/institution-admin/access';

export const dynamic='force-dynamic';

export default async function Dashboard(){
 const user=await getIdentity();
 if(!user)redirect('/login');
 if(user.mustChangePassword)return <div className="siii-glass-workspace"><SiiPageIntro eyebrow="SEGURIDAD DE CUENTA" title="Protege tu cuenta" description="Actualiza tu contraseña institucional para continuar."/><section className="sii-security-notice" role="alert" aria-label="Actualización obligatoria de contraseña"><div className="sii-notice-header"><strong>Actualiza tu contraseña para continuar</strong><p>Las operaciones administrativas están restringidas hasta completar este cambio.</p></div><PasswordChange/></section></div>;
 const institutions=await getInstitutionAccess(user.id);
 const managementAvailable=await hasInstitutionManagementPageAccess(user);
 const personalDestination=managementAvailable?null:resolveDashboardEntry(institutions,user.mustChangePassword);
 if(personalDestination)redirect(personalDestination as Route);
 if(!managementAvailable&&!institutions.some(item=>item.roles.some(role=>!PERSONAL_ENTRY_ROLES.includes(role))))return <section className="siii-entry-chooser siii-glass-workspace" aria-label="Seleccionar contexto institucional">
  <SiiPageIntro eyebrow="MI ESPACIO INSTITUCIONAL" title={`Hola, ${user.firstName}`} description="Elige la institución y el perfil que deseas consultar."/>
  {institutions.length?institutions.map(inst=><section key={inst.institutionId} className="sii-panel space-y-3"><h2 className="text-base font-bold">{inst.institutionName}</h2><div className="flex flex-wrap gap-2.5">
   {personalEntryAvailable(inst,'student')&&<Link className="sii-outline-button" href={`/dashboard/institutions/${inst.institutionId}/student`}>Mi vida universitaria</Link>}
   {personalEntryAvailable(inst,'teacher')&&<Link className="sii-outline-button" href={`/dashboard/institutions/${inst.institutionId}/teacher`}>Mi docencia</Link>}
   {!personalEntryAvailable(inst,'student')&&!personalEntryAvailable(inst,'teacher')&&<p className="text-sm text-muted-foreground">Tu acceso está vigente. La institución debe habilitar el perfil correspondiente.</p>}
   <Link className="sii-outline-button" href={`/dashboard/institutions/${inst.institutionId}`}>Consultar acceso institucional</Link>
  </div></section>):<SiiEmptyView icon="institution" title="No tienes instituciones asignadas" description="Solicita a tu institución revisar tu membresía."/>}
  {institutions.filter(inst=>!inst.roles.some(role=>role==='student'||role==='teacher')).map(inst=><InstitutionModuleDirectory key={inst.institutionId} institutionId={inst.institutionId} institutionName={inst.institutionName}/>)}
  <div><Link className="sii-outline-button" href="/dashboard/security">Cuenta y seguridad</Link></div>
 </section>;
 const roleNames=[...new Set(institutions.flatMap(item=>item.roles))].map(role=>ROLE_LABELS[role]);
 const personalOnly=institutions.length>0&&institutions.every(item=>item.roles.every(role=>['student','teacher','teacher_pending','workshop_participant','guest'].includes(role)));

 return <div className="siii-glass-workspace">
  <SiiPageIntro eyebrow="CENTRO DE OPERACIONES" title={`Bienvenido, ${user.firstName}`}
   description="Selecciona tu institución o abre un módulo autorizado."/>

  {!personalOnly&&<section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de tu acceso">
   <SiiMetricTile label="Instituciones" value={institutions.length} icon="institution" tone="rose"/>
   <SiiMetricTile label="Perfiles activos" value={roleNames.length} caption={roleNames.slice(0,2).join(', ')||undefined} icon="users" tone="amber"/>
   <SiiMetricTile label="Seguridad" value="Al día" icon="shield" tone="blue"
    href="/dashboard/security" actionLabel="Cuenta y seguridad"/>
  </section>}

  {managementAvailable&&<ManageableInstitutions/>}

  <section className="sii-panel sii-institutions-panel space-y-3">
   <SiiSectionHeader title="Mis instituciones"
    right={<Badge variant="secondary" className="sii-small-count">{institutions.length} {institutions.length===1?'institución':'instituciones'}</Badge>}/>
   {institutions.length?<div className="sii-institution-list">
    {institutions.map(inst=><Link key={inst.institutionId} className="sii-institution-item group flex items-center gap-3 transition-colors hover:text-primary"
     href={`/dashboard/institutions/${inst.institutionId}` as Route}>
     <span className="sii-institution-monogram grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">{inst.institutionCode.slice(0,2).toUpperCase()}</span>
     <span className="sii-institution-info min-w-0 flex-1"><strong className="block truncate text-sm">{inst.institutionName}</strong><small className="block truncate text-xs text-muted-foreground">{inst.institutionCode} · {inst.roles.map(role=>ROLE_LABELS[role]).join(', ')}</small></span>
     <Badge variant="outline" className="sii-institution-tag hidden sm:inline-flex">{hasPermission(inst.roles,'users.manage')?'Administración':'Acceso vigente'}</Badge>
     <span className="sii-institution-arrow text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
    </Link>)}
   </div>:<SiiEmptyView icon="institution" title="No tienes instituciones asignadas" description="Un administrador debe concederte una membresía para acceder a los recursos académicos."/>}
  </section>

  {institutions.length>0&&<section className="sii-modules-section space-y-3">
   <SiiSectionHeader outside title="Módulos por institución"/>
   {institutions.map(inst=>(
    <InstitutionModuleDirectory key={inst.institutionId} institutionId={inst.institutionId} institutionName={inst.institutionName}/>
   ))}
  </section>}
 </div>;
}
