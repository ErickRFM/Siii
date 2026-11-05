'use client';

import {useState} from 'react';
import {PersonalTable} from './personal-table';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {NativeSelect} from './ui/native-select';
import {SiiEmptyView} from './ui/sii-kit';
import type {PersonalCourse,PersonalTeacher,PersonalGrade} from '@/modules/portal/contracts';
import {academicStatus} from '@/modules/portal/contracts';

export function PersonalEnrollments({courses,teachers}:{courses:PersonalCourse[];teachers:PersonalTeacher[]}){
 // Summary is derived exclusively from the same authorized academic records as the table.
 const sectionIds=new Set(courses.map(course=>course.sectionId));
 const assignedSections=new Set(teachers.filter(teacher=>sectionIds.has(teacher.sectionId)).map(teacher=>teacher.sectionId));
 const credits=courses.reduce((sum,course)=>sum+course.credits,0);
 return <section className="siii-v2-academic-workspace min-w-0 space-y-5" aria-label="Carga académica oficial">
  {courses.length>0&&<dl className="grid min-w-0 gap-3 sm:grid-cols-3" aria-label="Resumen de inscripciones">
   <div className="rounded-xl border bg-card px-5 py-4"><dt className="text-xs font-semibold text-muted-foreground">Materias inscritas</dt><dd className="mt-2 text-3xl font-bold tabular-nums">{courses.length}</dd></div>
   <div className="rounded-xl border bg-card px-5 py-4"><dt className="text-xs font-semibold text-muted-foreground">Créditos registrados</dt><dd className="mt-2 text-3xl font-bold tabular-nums">{credits}</dd></div>
   <div className="rounded-xl border bg-card px-5 py-4"><dt className="text-xs font-semibold text-muted-foreground">Grupos con docente</dt><dd className="mt-2 text-3xl font-bold tabular-nums">{assignedSections.size}<span className="ml-2 text-sm font-medium text-muted-foreground">de {sectionIds.size}</span></dd></div>
  </dl>}
  <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-base font-bold">Materias y grupos</h2><p className="mt-1 text-sm text-muted-foreground">Información registrada por tu institución. Consulta los periodos y docentes asignados.</p></div>
  </div>
  <PersonalTable rows={courses} label="Inscripciones" searchText={row=>[row.courseCode,row.courseName,row.sectionCode,row.termName].join(' ')} columns={[
  {label:'Materia',sortValue:row=>row.courseName,render:row=><><strong>{row.courseName}</strong><p className="text-xs text-muted-foreground">{row.courseCode} · {row.credits} créditos</p></>},
  {label:'Grupo / periodo',sortValue:row=>row.termName+' '+row.sectionCode,render:row=><>{row.sectionCode}<p className="text-xs text-muted-foreground">{row.termName}</p></>},
  {label:'Docente asignado',render:row=>teachers.filter(teacher=>teacher.sectionId===row.sectionId).map(teacher=>`${teacher.firstName} ${teacher.lastName}`).join(', ')||'Sin asignación vigente'},
  {label:'Inscripción',sortValue:row=>row.enrollmentStatus??'',render:row=>academicStatus[row.enrollmentStatus??'']??row.enrollmentStatus},
  {label:'Estado del grupo',render:row=>academicStatus[row.sectionStatus]??row.sectionStatus},
 ]}/></div></section>;
}

function downloadHistory(rows:PersonalGrade[]){
 const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 const lines=[['CONSULTA INFORMATIVA — NO ES UN DOCUMENTO OFICIAL'],['Periodo','Clave','Materia','Grupo','Créditos','Calificación publicada','Versión','Fecha de publicación'],...rows.map(row=>[row.termName,row.courseCode,row.courseName,row.sectionCode,row.credits,(row.scoreHundredths/100).toFixed(2),row.version,row.publishedAt])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='historial-informativo.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function PersonalHistory({rows}:{rows:PersonalGrade[]}){
 const [query,setQuery]=useState(''),[term,setTerm]=useState('');
 const periods=[...new Map(rows.map(row=>[row.termId,{id:row.termId,name:row.termName,start:row.termStart}])).values()].sort((a,b)=>b.start.localeCompare(a.start)||a.name.localeCompare(b.name));
 const filtered=rows.filter(row=>(!term||row.termId===term)&&[row.courseCode,row.courseName,row.sectionCode,row.termName].join(' ').toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX')));
 return <section className="min-w-0 space-y-3" aria-label="Historial de calificaciones">
  <div className="flex flex-wrap items-end gap-2">
   {(rows.length>1||query.trim())&&<label className="min-w-[190px] flex-1 space-y-1 text-xs font-medium text-muted-foreground"><span className="sr-only">Buscar en historial académico</span><Input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar materia o grupo" aria-label="Buscar en historial académico"/></label>}
   {(periods.length>1||Boolean(term))&&<label className="min-w-[170px] flex-1 space-y-1 text-xs font-medium text-muted-foreground"><span className="sr-only">Periodo académico</span><NativeSelect value={term} onChange={event=>setTerm(event.target.value)} aria-label="Periodo académico"><option value="">Todos los periodos</option>{periods.map(period=><option key={period.id} value={period.id}>{period.name}</option>)}</NativeSelect></label>}
   <Button size="sm" variant="outline" disabled={!filtered.length} onClick={()=>downloadHistory(filtered)}>Exportar CSV</Button>
  </div>
  {periods.filter(period=>filtered.some(row=>row.termId===period.id)).map((period,index)=><details key={period.id} open={index===0||Boolean(query.trim()||term)} className="siii-history-period min-w-0 rounded-xl p-3"><summary className="cursor-pointer py-1 text-sm font-semibold">{period.name}</summary><div className="mt-1"><PersonalTable label={`Resultados de ${period.name}`} rows={filtered.filter(row=>row.termId===period.id)} columns={[
   {label:'Materia',sortValue:row=>row.courseName,render:row=><>{row.courseCode} · {row.courseName}</>},{label:'Grupo',sortValue:row=>row.sectionCode,render:row=>row.sectionCode},{label:'Créditos',sortValue:row=>row.credits,render:row=>row.credits},{label:'Calificación',sortValue:row=>row.scoreHundredths,render:row=><strong>{(row.scoreHundredths/100).toFixed(2)}</strong>},{label:'Publicación',sortValue:row=>row.publishedAt,render:row=>`v${row.version} · ${new Date(row.publishedAt).toLocaleDateString('es-MX')}`},
  ]}/></div></details>)}
  {!filtered.length&&<SiiEmptyView icon="grades" title={query||term?'Sin resultados para estos filtros':'Sin calificaciones publicadas'} description={query||term?'Cambia la búsqueda o el periodo.':'Las calificaciones aparecerán cuando la institución las publique.'}/>}
 </section>;
}
