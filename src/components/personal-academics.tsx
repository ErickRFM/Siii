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
 return <div className="space-y-4"><p className="text-sm text-muted-foreground">Inscripciones oficiales por periodo. Los cambios de inscripción requieren autorización de Control Escolar.</p><PersonalTable rows={courses} label="Inscripciones" searchText={row=>[row.courseCode,row.courseName,row.sectionCode,row.termName].join(' ')} columns={[
  {label:'Materia',sortValue:row=>row.courseName,render:row=><><strong>{row.courseName}</strong><p className="text-sm text-muted-foreground">{row.courseCode} · {row.credits} créditos registrados</p></>},
  {label:'Grupo / periodo',sortValue:row=>row.termName+' '+row.sectionCode,render:row=><>{row.sectionCode}<p className="text-sm text-muted-foreground">{row.termName}</p></>},
  {label:'Docente asignado',render:row=>teachers.filter(teacher=>teacher.sectionId===row.sectionId).map(teacher=>`${teacher.firstName} ${teacher.lastName}`).join(', ')||'Sin asignación vigente'},
  {label:'Inscripción',sortValue:row=>row.enrollmentStatus??'',render:row=>academicStatus[row.enrollmentStatus??'']??row.enrollmentStatus},
  {label:'Estado del grupo',render:row=>academicStatus[row.sectionStatus]??row.sectionStatus},
 ]}/></div>;
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
 return <div className="space-y-4"><p className="text-sm text-muted-foreground">Solo calificaciones finales publicadas · escala de 0 a 10. Consulta informativa, no kárdex certificado.</p>
  <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Buscar en historial académico<Input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Materia, clave o grupo"/></label><label className="space-y-2 text-sm font-medium">Periodo académico<NativeSelect value={term} onChange={event=>setTerm(event.target.value)}><option value="">Todos los periodos</option>{periods.map(period=><option key={period.id} value={period.id}>{period.name}</option>)}</NativeSelect></label></div>
  <Button variant="outline" disabled={!filtered.length} onClick={()=>downloadHistory(filtered)}>Descargar historial informativo</Button>
  {periods.filter(period=>filtered.some(row=>row.termId===period.id)).map(period=><details key={period.id} open className="rounded-xl border bg-card p-4"><summary className="min-h-11 cursor-pointer font-semibold">{period.name}</summary><div className="mt-3"><PersonalTable label={`Resultados de ${period.name}`} rows={filtered.filter(row=>row.termId===period.id)} columns={[
   {label:'Materia',sortValue:row=>row.courseName,render:row=><>{row.courseCode} · {row.courseName}</>},{label:'Grupo',sortValue:row=>row.sectionCode,render:row=>row.sectionCode},{label:'Créditos registrados',sortValue:row=>row.credits,render:row=>row.credits},{label:'Calificación publicada',sortValue:row=>row.scoreHundredths,render:row=><strong>{(row.scoreHundredths/100).toFixed(2)}</strong>},{label:'Publicación',sortValue:row=>row.publishedAt,render:row=>`v${row.version} · ${new Date(row.publishedAt).toLocaleDateString('es-MX')}`},
  ]}/></div></details>)}
  {!filtered.length&&<SiiEmptyView icon="grades" title={query||term?'Sin resultados para estos filtros':'Sin calificaciones publicadas'} description={query||term?'Cambia la búsqueda o el periodo.':'Las calificaciones aparecerán cuando la institución las publique.'}/>}
 </div>;
}
