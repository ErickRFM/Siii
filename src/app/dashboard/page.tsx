import Link from 'next/link';
import type {Route} from 'next';
import {redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import {ROLE_LABELS,hasPermission} from '@/shared/auth/roles';
import PasswordChange from './password-change';
import {ManageableInstitutions} from '@/components/institution-admin';
import InstitutionModuleDirectory from '@/components/institution-module-directory';
import {SiiPageIntro,SiiSectionHeader,SiiMetricTile,SiiStatusPill,SiiEmptyView} from '@/components/ui/sii-kit';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';

export const dynamic='force-dynamic';

export default async function Dashboard(){
 const user=await getIdentity();
 if(!user)redirect('/login');
 const institutions=await getInstitutionAccess(user.id);
 const roleNames=[...new Set(institutions.flatMap(item=>item.roles))].map(role=>ROLE_LABELS[role]);
 const personalOnly=institutions.length>0&&institutions.every(item=>item.roles.every(role=>['student','teacher','teacher_pending','workshop_participant','guest'].includes(role)));

 return <div className="space-y-8">
  <SiiPageIntro hero eyebrow="CENTRO DE OPERACIONES" title={`Bienvenido, ${user.firstName}`}
   description="Tu espacio institucional, accesos vigentes y módulos autorizados en un solo lugar."
   actions={<SiiStatusPill live>Cuenta activa</SiiStatusPill>}/>

  {user.mustChangePassword&&(
   <section className="sii-security-notice" role="alert" aria-label="Actualización obligatoria de contraseña">
    <div className="sii-notice-header"><span aria-hidden="true">⚠</span><div><strong>Actualiza tu contraseña para continuar</strong><p>Por seguridad, las operaciones administrativas están restringidas hasta completar este cambio.</p></div></div>
    <PasswordChange/>
   </section>
  )}

  {!personalOnly&&<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resumen de tu acceso">
   <SiiMetricTile label="Instituciones asignadas" value={institutions.length} caption="Membresías con acceso vigente" icon="institution" tone="rose"/>
   <SiiMetricTile label="Perfiles autorizados" value={roleNames.length} caption="Roles distintos entre tus instituciones" icon="users" tone="amber"/>
   <SiiMetricTile label="Seguridad de cuenta" value={user.mustChangePassword?'Acción requerida':'Al día'} caption="Sesión y factores de autenticación" icon="shield" tone="blue"
    href="/dashboard/security" actionLabel="Gestionar seguridad"/>
  </section>}

  <ManageableInstitutions/>

  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
   <Card className="sii-panel sii-institutions-panel overflow-hidden">
    <CardHeader className="pb-0"><SiiSectionHeader eyebrow="TU RED UNIVERSITARIA" title="Mis instituciones" description="Accesos concedidos y permisos vigentes."
     right={<Badge variant="secondary" className="sii-small-count">{institutions.length} {institutions.length===1?'institución':'instituciones'}</Badge>}/></CardHeader>
    <CardContent className="pt-5">
     {institutions.length?<div className="sii-institution-list divide-y">
      {institutions.map(inst=><Link key={inst.institutionId} className="sii-institution-item group flex items-center gap-3 py-3.5 transition-colors first:pt-0 last:pb-0 hover:text-primary"
       href={`/dashboard/institutions/${inst.institutionId}` as Route}>
       <span className="sii-institution-monogram grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-bold text-primary">{inst.institutionCode.slice(0,2).toUpperCase()}</span>
       <span className="sii-institution-info min-w-0 flex-1"><strong className="block truncate text-sm">{inst.institutionName}</strong><small className="block truncate text-xs text-muted-foreground">{inst.institutionCode} · {inst.roles.map(role=>ROLE_LABELS[role]).join(', ')}</small></span>
       <Badge variant="outline" className="sii-institution-tag hidden sm:inline-flex">{hasPermission(inst.roles,'users.manage')?'Administración':'Acceso vigente'}</Badge>
       <span className="sii-institution-arrow text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
      </Link>)}
     </div>:<SiiEmptyView icon="institution" title="No tienes instituciones asignadas" description="Un administrador debe concederte una membresía para poder acceder a los recursos académicos."/>}
    </CardContent>
   </Card>

   <Card className="sii-panel sii-access-panel">
    <CardContent className="flex h-full flex-col gap-4 p-6">
     <span className="sii-section-kicker">CENTRO PERSONAL</span>
     <h2 className="text-xl font-bold tracking-tight">Tu cuenta está en control.</h2>
     <p className="text-sm leading-relaxed text-muted-foreground">La plataforma utiliza permisos específicos de cada institución para proteger la información académica.</p>
     <Separator/>
     <div className="sii-access-feature flex items-start gap-3"><span className="grid size-7 place-items-center rounded-full bg-success/15 text-success" aria-hidden="true">✓</span><div><strong className="block text-sm">Sesión institucional</strong><small className="text-xs text-muted-foreground">Acceso verificado por el servidor</small></div></div>
     <div className="sii-access-feature flex items-start gap-3"><span className="grid size-7 place-items-center rounded-full bg-success/15 text-success" aria-hidden="true">✓</span><div><strong className="block text-sm">Permisos por institución</strong><small className="text-xs text-muted-foreground">Vigentes según tus membresías</small></div></div>
     <Button asChild variant="outline" className="mt-auto w-full justify-between"><Link href="/dashboard/security">Ir a seguridad <span aria-hidden="true">→</span></Link></Button>
    </CardContent>
   </Card>
  </div>

  <section className="sii-modules-section space-y-5">
   <SiiSectionHeader outside eyebrow="ECOSISTEMA SII" title="Módulos institucionales"
    description="Selecciona tu institución para trabajar. Cada módulo verifica permisos y seguridad en el servidor."
    right={<SiiStatusPill>Acceso por institución</SiiStatusPill>}/>
   {institutions.length===0?<SiiEmptyView icon="layers" title="Aún no tienes una institución asignada" description="Los módulos aparecerán cuando una institución te conceda acceso."/>:institutions.map(inst=>(
    <InstitutionModuleDirectory key={inst.institutionId} institutionId={inst.institutionId} institutionName={inst.institutionName}/>
   ))}
  </section>
  <footer className="sii-footer">SII · Sistema Institucional Integral <span>Administración académica segura · Experiencia móvil en Compañero</span></footer>
 </div>;
}
