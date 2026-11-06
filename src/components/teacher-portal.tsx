"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {SiiiWorkspaceFrame} from './ui/siii-workspace-frame';
import {usePersonalSnapshot} from './use-personal-snapshot';
import TeacherGradebook from './teacher-gradebook';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import {PersonalTable} from './personal-table';
import TeacherGlassOverview from './teacher-glass-overview';
import {Button} from './ui/button';
import {NativeSelect} from './ui/native-select';
import {Card,CardHeader,CardTitle,CardContent} from './ui/card';
import {SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
import type {PersonalTeachingGroup} from '@/modules/portal/contracts';
import {academicStatus} from '@/modules/portal/contracts';
import {resolveTeacherDestination,type TeacherNavSection} from '@/shared/navigation/personal-navigation-registry';

type Group=PersonalTeachingGroup;
type View=TeacherNavSection;

function evaluationState(group:Group){if(group.published)return 'Resultados publicados';if(group.termStatus!=='active'||group.sectionStatus!=='open')return 'Captura cerrada';if(!group.componentCount)return 'Sin evaluaciones configuradas';return `${group.savedScoreCount??0} / ${(group.componentCount??0)*(group.enrolledCount??0)} notas guardadas`;}

/** Institutional teaching only. Operational class schedules belong to Compañero. */
export default function TeacherPortal({institutionId,institutionName,actorId,institutionalResults=false}:{institutionId:string;institutionName:string;actorId:string;institutionalResults?:boolean}){
 const [view,setView]=useState<View>('home'),[term,setTerm]=useState(''),[state,setState]=useState('');
 const [selection,setSelection]=useState<{id?:string;mode:'roster'|'capture'|'results'}>({mode:'capture'});
 const {snapshot,loading,error,updatedAt,refresh}=usePersonalSnapshot(institutionId,'teacher',actorId,'groups');
 const profile=snapshot?.profile,groups=snapshot?.groups??[],permissions=useInstitutionCapabilities();
 const incompleteGroups=snapshot?.truncatedResources?.groups===true;
 const canEvaluate=profile?.status==='active'&&hasAnyCapability(permissions.data,'grades.manage');

 useEffect(()=>{
  const apply=(raw:string)=>{
    const next=resolveTeacherDestination(raw);
    if(next!=='evaluations'||canEvaluate)setView(next);
  };
  const fromHash=()=>apply(window.location.hash);
  const onNavigate=(event:Event)=>apply((event as CustomEvent<string>).detail);
  fromHash();
  window.addEventListener('hashchange',fromHash);
  window.addEventListener('siii:teacher-navigation',onNavigate);
  return()=>{
    window.removeEventListener('hashchange',fromHash);
    window.removeEventListener('siii:teacher-navigation',onNavigate);
  };
 },[canEvaluate]);

 useEffect(()=>{window.dispatchEvent(new CustomEvent('siii:teacher-active-section',{detail:({home:'inicio',groups:'grupos',evaluations:'evaluaciones',profile:'perfil'} as const)[view]}))},[view]);
 const terms=Array.from(new Map(groups.map(group=>[group.termId,group.termName])).entries());
 const inTerm=groups.filter(group=>!term||group.termId===term),visible=inTerm.filter(group=>!state||group.sectionStatus===state);
 function open(id:string,mode:'roster'|'capture'|'results'){setSelection({id,mode});window.location.hash='evaluaciones';setView('evaluations');}

 return <SiiiWorkspaceFrame className={'sii-workspace siii-glass-workspace sii-teacher-portal sii-glass-role min-w-0'+(view==='home'?' siii-teacher-home-shell':'')}
  title={view==='home'?undefined:view==='groups'?'Mis grupos':view==='evaluations'?'Evaluaciones':'Mi perfil docente'}
  caption={view==='home'?undefined:'Información académica oficial de los grupos y estudiantes asignados.'}
  action={view==='home'?undefined:<Button size="icon" variant="ghost" disabled={loading} onClick={()=>refresh()} title="Actualizar mi información" aria-label="Actualizar mi información"><RefreshCw size={16} aria-hidden="true"/></Button>}>

  {institutionalResults&&view==='groups'&&<Link className="inline-flex text-sm font-medium underline-offset-4 hover:underline" href={`/dashboard/institutions/${institutionId}/teacher/attendance`}>Asistencia de mis grupos</Link>}
  {incompleteGroups&&<p role="status" className="text-sm text-muted-foreground">La consulta de grupos está incompleta. Los indicadores totales se ocultan hasta recuperar todo el registro.</p>}
  {error&&<div role="alert" className="sii-catalog-error">{error}<Button variant="outline" onClick={()=>refresh()}>Reintentar consulta</Button></div>}
  {loading&&(snapshot?<p role="status" className="sr-only">Actualizando información institucional…</p>:view==='home'?<span role="status" className="sr-only">Consultando tu información docente</span>:<SiiSkeleton label="Consultando tu información docente"/>)}
  {snapshot&&!profile&&view!=='home'&&<SiiEmptyView icon="registry" title="Perfil docente aún sin vincular" description="Tu cuenta tiene acceso al portal. Solicita a la institución vincularla con tu registro docente oficial. No puedes consultar grupos ni calificaciones hasta completar el vínculo."/>}
  <div className="min-w-0 space-y-5">
   {view==='home'&&<section aria-label="Inicio docente">{!snapshot?(loading?<SiiSkeleton label="Consultando tu información docente"/>:null):<TeacherGlassOverview profile={profile??null} groups={groups} institutionId={institutionId} institutionName={institutionName} incomplete={incompleteGroups} unlinked={Boolean(snapshot&&!profile&&!error)} loading={loading} canEvaluate={canEvaluate} onGroups={()=>{window.location.hash='grupos';setView('groups')}} onOpen={open} onRefresh={()=>void refresh()}/>}</section>}
   {profile&&<>
    {view==='groups'&&<div className="flex flex-wrap items-end gap-4"><label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Periodo académico<NativeSelect value={term} onChange={event=>setTerm(event.target.value)}><option value="">Todos los periodos asignados</option>{terms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</NativeSelect></label>{view==='groups'&&<label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Estado del grupo<NativeSelect value={state} onChange={event=>setState(event.target.value)}><option value="">Todos los estados</option>{Array.from(new Set(groups.map(group=>group.sectionStatus))).map(status=><option key={status} value={status}>{academicStatus[status]??status}</option>)}</NativeSelect></label>}</div>}
    {view==='groups'&&<section aria-label="Grupos docentes" className="space-y-3"><PersonalTable label="Grupos asignados" rows={visible} searchText={group=>`${group.courseName} ${group.courseCode} ${group.sectionCode} ${group.termName}`} columns={[
     {label:'Materia y grupo',render:group=><><strong>{group.courseName}</strong><p className="text-sm text-muted-foreground">{group.courseCode} · {group.sectionCode}</p></>},
     {label:'Periodo y estado',render:group=><>{group.termName}<p className="text-sm text-muted-foreground">{academicStatus[group.sectionStatus]??group.sectionStatus}</p></>},
     {label:'Inscripciones oficiales',render:group=>`${group.enrolledCount??0} estudiantes inscritos`},
     {label:'Evaluación',render:group=>evaluationState(group)},
     {label:'Consultar',render:group=>canEvaluate&&group.sectionStatus!=='archived'?<div className="flex flex-wrap gap-2"><Button variant="outline" aria-label={`Lista oficial de ${group.sectionCode}`} onClick={()=>open(group.id,'roster')}>Lista oficial</Button><Button variant="outline" aria-label={`Evaluar ${group.sectionCode}`} onClick={()=>open(group.id,'capture')}>Evaluar</Button></div>:<span>Consulta de evaluación restringida</span>}
    ]}/></section>}
    {view==='evaluations'&&<section aria-label="Evaluaciones docentes" className="min-w-0">{canEvaluate&&<TeacherGradebook key={`${institutionId}:${selection.id??''}:${selection.mode}`} institutionId={institutionId} initialSectionId={selection.id} initialView={selection.mode}/>}</section>}
    {view==='profile'&&<section aria-label="Perfil docente"><Card><CardHeader><CardTitle role="heading" aria-level={2}>Mi perfil docente institucional</CardTitle></CardHeader><CardContent className="space-y-5"><dl className="grid gap-5 sm:grid-cols-2">{[['Nombre oficial',profile.firstName+' '+profile.lastName],['Número de empleado',profile.employeeNumber],['Correo institucional',profile.institutionalEmail],['Correo de acceso verificado',profile.verifiedEmail],['Estado de vinculación','Vínculo vigente · '+(academicStatus[profile.status]??profile.status)]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value??'No registrado'}</dd></div>)}</dl><p className="text-sm text-muted-foreground">La institución conserva tu identidad y tus asignaciones oficiales. Solicita a coordinación cualquier corrección de estos datos.</p><Link className="sii-outline-button" href="/dashboard/security">Contraseña, MFA y sesiones</Link></CardContent></Card></section>}
   </>}
  </div>
  {updatedAt&&<span role="status" className="sr-only">Información docente actualizada: {updatedAt}. Permisos validados.</span>}
 </SiiiWorkspaceFrame>;
}
