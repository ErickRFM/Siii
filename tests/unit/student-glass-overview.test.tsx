import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import StudentGlassOverview from '@/components/student-glass-overview';
import type {PersonalSnapshot} from '@/components/use-personal-snapshot';

it('keeps every retrieved institutional notice readable when there are more than three',()=>{
 const profile={id:'student',firstName:'Estudiante',lastName:'Sintético',status:'active',institutionalEmail:null,verifiedEmail:null,timeZone:'America/Mexico_City'};
 const snapshot:PersonalSnapshot={profile,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],requests:[],pendingRequests:[],requestHistory:[],announcements:[
  {id:'one',title:'Inscripciones',body:'Primer aviso vigente',publishedAt:null},
  {id:'two',title:'Biblioteca',body:'Segundo aviso vigente',publishedAt:null},
  {id:'three',title:'Becas',body:'Tercer aviso vigente',publishedAt:null},
  {id:'four',title:'Cierre de periodo',body:'Cuarto aviso vigente',publishedAt:null},
 ]};
 const html=renderToStaticMarkup(<StudentGlassOverview snapshot={snapshot} profile={profile} institutionName="Institución sintética" onNavigate={()=>{}} onRefresh={()=>{}} refreshing={false}/>);
 for(const title of ['Inscripciones','Biblioteca','Becas','Cierre de periodo'])expect(html).toContain(title);
 expect(html).toContain('Cuarto aviso vigente');
});

it('shows elapsed publication time only for a valid, non-future institutional notice',()=>{
 const profile={id:'student',firstName:'Estudiante',lastName:'Sintético',status:'active',institutionalEmail:null,verifiedEmail:null,timeZone:'UTC'};
 const snapshot:PersonalSnapshot={profile,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],requests:[],pendingRequests:[],requestHistory:[],announcements:[
  {id:'one',title:'Publicado',body:'Aviso',publishedAt:'2026-10-26T17:00:00Z'},
  {id:'two',title:'Sin fecha',body:'Aviso',publishedAt:null},
  {id:'three',title:'Fecha posterior',body:'Aviso',publishedAt:'2026-10-27T18:00:00Z'},
 ]};
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-26T18:00:00Z'));
 try{const html=renderToStaticMarkup(<StudentGlassOverview snapshot={snapshot} profile={profile} institutionName="Institución sintética" onNavigate={()=>{}} onRefresh={()=>{}} refreshing={false}/>);expect(html).toContain('hace 1 h');expect((html.match(/<time /g)||[])).toHaveLength(1)}finally{clock.mockRestore()}
});
