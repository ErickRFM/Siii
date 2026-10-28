"use client";
import Link from 'next/link';
import {useState} from 'react';
import {Home,LibraryBig,ClipboardCheck,UserRound} from 'lucide-react';
import {usePersonalSnapshot} from './use-personal-snapshot';
import TeacherGradebook from './teacher-gradebook';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import {PersonalTable} from './personal-table';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {SiiiGlassMetric,SiiiGlassMetricsRow} from './ui/siii-glass-kit';
import {Button} from './ui/button';
import {NativeSelect} from './ui/native-select';
import {Card,CardHeader,CardTitle,CardContent} from './ui/card';
import {SiiPageIntro,SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
import type {PersonalTeachingGroup} from '@/modules/portal/contracts';
import {academicStatus} from '@/modules/portal/contracts';

type Group=PersonalTeachingGroup;
type View='home'|'groups'|'evaluations'|'profile';
const destinations=[{id:'home',label:'Inicio',icon:Home},{id:'groups',label:'Mis grupos',icon:LibraryBig},{id:'evaluations',label:'Evaluaciones',icon:ClipboardCheck},{id:'profile',label:'Mi perfil',icon:UserRound}] as const;
function evaluationState(group:Group){if(group.published)return 'Resultados publicados';if(group.termStatus!=='active'||group.sectionStatus!=='open')return 'Captura cerrada';if(!group.componentCount)return 'Sin evaluaciones configuradas';return `${group.savedScoreCount??0} / ${(group.componentCount??0)*(group.enrolledCount??0)} notas guardadas`;}

/** Institutional teaching only. Operational class schedules belong to Compañero. */
export default function TeacherPortal({institutionId,institutionName,actorId}:{institutionId:string;institutionName:string;actorId:string}){
 const [view,setView]=useState<View>('home'),[term,setTerm]=useState(''),[state,setState]=useState('');
 const [selection,setSelection]=useState<{id?:string;mode:'roster'|'capture'|'results'}>({mode:'capture'});
 const {snapshot,loading,error,updatedAt,refresh}=usePersonalSnapshot(institutionId,'teacher',actorId,'groups');
 const profile=snapshot?.profile,groups=snapshot?.groups??[],permissions=useInstitutionCapabilities();
 const incompleteGroups=snapshot?.truncatedResources?.groups===true;
 const canEvaluate=profile?.status==='active'&&hasAnyCapability(permissions.data,'grades.manage');
 const terms=Array.from(new Map(groups.map(group=>[group.termId,group.termName])).entries());
 const inTerm=groups.filter(group=>!term||group.termId===term),visible=inTerm.filter(group=>!state||group.sectionStatus===state);
 function open(id:string,mode:'roster'|'capture'|'results'){setSelection({id,mode});setView('evaluations');}
 return <div className="sii-workspace siii-glass-workspace sii-teacher-portal sii-glass-role min-w-0 space-y-6">
  <SiiPageIntro eyebrow="PORTAL DOCENTE" title="Mi docencia" description={institutionName} actions={<Button variant="outline" disabled={loading} onClick={()=>refresh()} aria-label="Actualizar mi información">{loading?'Consultando…':'Actualizar'}</Button>}/>
  <nav aria-label="Contexto del portal" className="flex flex-wrap gap-4 text-sm"><Link className="font-semibold text-primary underline" href="/dashboard">Cambiar institución</Link><Link className="font-semibold text-primary underline" href="/dashboard/security">Cuenta y seguridad</Link><Link className="font-semibold text-primary underline" href={{pathname:`/dashboard/institutions/${institutionId}/grading/corrections`}}>Mis rectificaciones</Link></nav>
  {incompleteGroups&&<p role="status" className="text-sm text-muted-foreground">La consulta de grupos está incompleta. Los indicadores totales se ocultan hasta recuperar todo el registro.</p>}
  {error&&<div role="alert" className="sii-catalog-error">{error}<Button variant="outline" onClick={()=>refresh()}>Reintentar consulta</Button></div>}
  {loading&&(snapshot?<p role="status">Actualizando información institucional…</p>:<SiiSkeleton label="Consultando tu información docente"/>)}
  {snapshot&&!profile&&<SiiEmptyView icon="registry" title="Perfil docente aún sin vincular" description="Tu cuenta tiene acceso al portal. Solicita a la institución vincularla con tu registro docente oficial. No puedes consultar grupos ni calificaciones hasta completar el vínculo."/>}
  {profile&&<Card className="siii-teacher-profile-hero siii-glass-surface"><CardContent className="space-y-1 p-5"><p className="text-sm text-muted-foreground">Docente · {academicStatus[profile.status]??profile.status} · Vínculo institucional vigente</p><h2 className="text-xl font-semibold">{profile.firstName} {profile.lastName}</h2><p className="text-sm text-muted-foreground">Número de empleado: {profile.employeeNumber??'No registrado'}</p></CardContent></Card>}
  <Tabs value={view} onValueChange={value=>setView(value as View)} className="min-w-0 space-y-5">
   <TabsList aria-label="Navegación docente" className="sii-teacher-navigation grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1 sm:grid-cols-4">{destinations.map(item=><TabsTrigger key={item.id} value={item.id} disabled={item.id==='evaluations'&&!canEvaluate} className="min-h-11 gap-2 whitespace-normal"><item.icon className="size-4 shrink-0" aria-hidden="true"/>{item.label}</TabsTrigger>)}</TabsList>
   {profile&&<>
    {(view==='home'||view==='groups')&&<div className="flex flex-wrap items-end gap-4"><label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Periodo académico<NativeSelect value={term} onChange={event=>setTerm(event.target.value)}><option value="">Todos los periodos asignados</option>{terms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</NativeSelect></label>{view==='groups'&&<label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Estado del grupo<NativeSelect value={state} onChange={event=>setState(event.target.value)}><option value="">Todos los estados</option>{Array.from(new Set(groups.map(group=>group.sectionStatus))).map(status=><option key={status} value={status}>{academicStatus[status]??status}</option>)}</NativeSelect></label>}</div>}
    <TabsContent value="home" className="space-y-5">
     <SiiiGlassMetricsRow className="siii-teacher-metrics grid gap-4 sm:grid-cols-3">{[
      ['Grupos asignados',inTerm.length],
      ['Grupos con captura habilitada',inTerm.filter(group=>!group.published&&group.sectionStatus==='open'&&group.termStatus==='active').length],
      ['Grupos con resultados publicados',inTerm.filter(group=>group.published).length]
     ].map(([label,count],index)=><SiiiGlassMetric key={label} label={String(label)} value={incompleteGroups?'—':count} tone={index===0?'amber':index===1?'blue':'green'} className="siii-teacher-metric"/>)}</SiiiGlassMetricsRow>
     <Card className="siii-teacher-work siii-glass-surface"><CardHeader><CardTitle role="heading" aria-level={2}>Trabajo académico</CardTitle></CardHeader><CardContent className="space-y-4">{inTerm.length?inTerm.map(group=><article key={group.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 last:border-0"><div className="min-w-0"><h3 className="break-words font-semibold">{group.courseName} · {group.sectionCode}</h3><p className="text-sm text-muted-foreground">{group.termName} · {evaluationState(group)}</p></div>{canEvaluate&&group.sectionStatus!=='archived'&&<Button variant="outline" onClick={()=>open(group.id,group.published?'results':'capture')}>{group.published?'Consultar resultados':'Abrir evaluación'}<span className="sr-only"> de {group.sectionCode}</span></Button>}</article>):<SiiEmptyView icon="grades" title="Sin asignaciones" description="No tienes grupos oficialmente asignados en este periodo. Solicita a coordinación revisar tu asignación."/>}<Button variant="outline" onClick={()=>setView('groups')}>Consultar mis grupos</Button></CardContent></Card>
     <p className="text-sm text-muted-foreground">Las notas guardadas en captura son borradores privados hasta la publicación. Las solicitudes de rectificación requieren un procedimiento autorizado por la institución.</p>
    </TabsContent>
    <TabsContent value="groups" className="space-y-4"><PersonalTable label="Grupos asignados" rows={visible} searchText={group=>`${group.courseName} ${group.courseCode} ${group.sectionCode} ${group.termName}`} columns={[
     {label:'Materia y grupo',render:group=><><strong>{group.courseName}</strong><p className="text-sm text-muted-foreground">{group.courseCode} · {group.sectionCode}</p></>},
     {label:'Periodo y estado',render:group=><>{group.termName}<p className="text-sm text-muted-foreground">{academicStatus[group.sectionStatus]??group.sectionStatus}</p></>},
     {label:'Inscripciones oficiales',render:group=>`${group.enrolledCount??0} estudiantes inscritos`},
     {label:'Evaluación',render:group=>evaluationState(group)},
     {label:'Consultar',render:group=>canEvaluate&&group.sectionStatus!=='archived'?<div className="flex flex-wrap gap-2"><Button variant="outline" aria-label={`Lista oficial de ${group.sectionCode}`} onClick={()=>open(group.id,'roster')}>Lista oficial</Button><Button variant="outline" aria-label={`Evaluar ${group.sectionCode}`} onClick={()=>open(group.id,'capture')}>Evaluar</Button></div>:<span>Consulta de evaluación restringida</span>}
    ]}/></TabsContent>
    <TabsContent value="evaluations" className="min-w-0">{canEvaluate&&<TeacherGradebook key={`${institutionId}:${selection.id??''}:${selection.mode}`} institutionId={institutionId} initialSectionId={selection.id} initialView={selection.mode}/>}</TabsContent>
    <TabsContent value="profile"><Card><CardHeader><CardTitle role="heading" aria-level={2}>Mi perfil docente institucional</CardTitle></CardHeader><CardContent className="space-y-5"><dl className="grid gap-5 sm:grid-cols-2">{[['Nombre oficial',profile.firstName+' '+profile.lastName],['Número de empleado',profile.employeeNumber],['Correo institucional',profile.institutionalEmail],['Correo de acceso verificado',profile.verifiedEmail],['Estado de vinculación','Vínculo vigente · '+(academicStatus[profile.status]??profile.status)]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value??'No registrado'}</dd></div>)}</dl><p className="text-sm text-muted-foreground">La institución conserva tu identidad y tus asignaciones oficiales. Solicita a coordinación cualquier corrección de estos datos.</p><Link className="sii-outline-button" href="/dashboard/security">Contraseña, MFA y sesiones</Link></CardContent></Card></TabsContent>
   </>}
  </Tabs>
  {updatedAt&&<p className="text-sm text-muted-foreground">Última consulta: {updatedAt}. Cada actualización valida tus permisos y vínculo institucional.</p>}
 </div>;
}
