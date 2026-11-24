import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';

import { legacyAllows } from '@/shared/auth/institution-policy';
import SchoolRegistry from '@/components/school-registry';
import StudentClaimReview from '@/components/student-claim-review';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function RegistryPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 // Holding the permission shows the panel; privileged assurance (fresh step-up) unlocks the data.
 const canReviewClaims=legacyAllows(authorization.subject,'users.manage',institutionId);
 const claimsAssured=canReviewClaims&&!!await authorizeInstitution(institutionId,'users.manage');
 return <>
  <SiiPageIntro eyebrow="CONTROL ESCOLAR" title="Personas académicas" description={access.institutionName+' · Expedientes de estudiantes y docentes.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <SchoolRegistry key={institutionId} institutionId={institutionId}/>
  {/* Presentation only: the claims API re-checks users.manage with privileged assurance. */}
  {canReviewClaims&&<StudentClaimReview key={'claims-'+institutionId} institutionId={institutionId} assured={claimsAssured}/>}
 </>;
}
