import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import TeacherGlassOverview from '@/components/teacher-glass-overview';

it('uses a compact Home layout when a teacher has no assigned groups',()=>{
 const html=renderToStaticMarkup(<TeacherGlassOverview
  profile={null} groups={[]} institutionId="00000000-0000-4000-8000-000000000001"
  institutionName="Universidad QA" incomplete={false} loading={false}
  canEvaluate={false} onGroups={()=>{}} onOpen={()=>{}} onRefresh={()=>{}}/>);
 expect(html).toContain('siii-overview-detail-grid--sparse');
 expect(html).toContain('width="112" height="112"');
 expect(html).toContain('No hay resultados publicados');
 expect(html).toContain('disabled=""');
});
