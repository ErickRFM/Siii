import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution,authorizeCapability } from '@/shared/auth/session';

import { legacyAllows } from '@/shared/auth/institution-policy';
import SchoolRegistry from '@/components/school-registry';
import StudentClaimReview from '@/components/student-claim-review';
import TeacherAccountLinks from '@/components/registry/teacher-account-links';
import StudentAccountLinks from '@/components/registry/student-account-links';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function RegistryPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 // Full registry needs academic.manage; Control Escolar (student.links.manage only) gets just the link review.
 const registry=await authorizeInstitution(institutionId,'academic.manage');
 const linkReviewer=await authorizeCapability(institutionId,'student.links.manage');
 const authorization=registry??linkReviewer;
 const access=authorization?.access;if(!authorization||!access)notFound();
 // Holding the permission shows the panel; privileged assurance (fresh step-up) unlocks the data.
 const canReviewClaims=Boolean(linkReviewer);
 const claimsAssured=canReviewClaims&&!!await authorizeCapability(institutionId,'student.links.manage',{institutionId,status:'active'},true);
 const canLinkTeachers=Boolean(registry)&&legacyAllows(authorization.subject,'users.manage',institutionId);
 const teachersAssured=canLinkTeachers&&!!await authorizeInstitution(institutionId,'users.manage');
 return <>
  <SiiPageIntro eyebrow="CONTROL ESCOLAR" title="Personas académicas" description={access.institutionName+' · Expedientes de estudiantes y docentes.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  {registry&&<SchoolRegistry key={institutionId} institutionId={institutionId}/>}
  {/* Presentation only: each API re-checks its capability with privileged assurance. */}
  {canReviewClaims&&<StudentClaimReview key={'claims-'+institutionId} institutionId={institutionId} assured={claimsAssured}/>}
  {canReviewClaims&&<StudentAccountLinks key={'student-links-'+institutionId} institutionId={institutionId} assured={claimsAssured}/>}
  {canLinkTeachers&&<TeacherAccountLinks key={'teacher-links-'+institutionId} institutionId={institutionId} assured={teachersAssured}/>}
 </>;
}
