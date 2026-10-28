import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import TeacherGlassOverview from '@/components/teacher-glass-overview';
import type {PersonalTeachingGroup} from '@/modules/portal/contracts';

const group:PersonalTeachingGroup={id:'g',sectionId:'g',sectionCode:'A',sectionStatus:'open',courseCode:'C',courseName:'Materia real',credits:6,termId:'term',termName:'Periodo consultado',termStart:'2026-01-01',termEnd:'2026-12-31',termStatus:'active',componentCount:1,weightTotal:100,savedScoreCount:3,published:true};
function render(incomplete:boolean){return renderToStaticMarkup(<TeacherGlassOverview profile={{id:'teacher',firstName:'Docente',lastName:'Sintético',status:'active',institutionalEmail:null,verifiedEmail:null,timeZone:'UTC'}} groups={[group]} institutionId="institution" institutionName="Universidad de pruebas" incomplete={incomplete} loading={false} canEvaluate onGroups={()=>{}} onOpen={()=>{}} onRefresh={()=>{}}/>)}
it('shows period distribution only when the teaching collection is complete',()=>{
 expect(render(false)).toContain('class="siii-overview-term"');
 const partial=render(true);expect(partial).not.toContain('class="siii-overview-term"');expect(partial).toContain('Consulta de grupos incompleta');
});
