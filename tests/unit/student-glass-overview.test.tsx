import {expect,it} from 'vitest';
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
