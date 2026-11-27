import Link from 'next/link';
import {correctionPolicy,correctionStaff} from '@/modules/grading/correction-policy';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { SiiPageIntro } from '@/components/ui/sii-kit';
import { InstitutionOverview } from '@/components/institution-capabilities';

export const dynamic = 'force-dynamic';
type PageProps = { params: Promise<{ institutionId: string }> };

export default async function InstitutionPage({ params }: PageProps) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const { institutionId } = await params;
  const access = (await getInstitutionAccess(user.id)).find(inst => inst.institutionId === institutionId);
  if (!access) notFound();

  return (
    <div className="sii-workspace siii-glass-workspace">
      <SiiPageIntro
        eyebrow="CONTEXTO INSTITUCIONAL"
        title={access.institutionName}
        description={`Clave: ${access.institutionCode}`}
        actions={<Link href="/dashboard" className="sii-outline-button sii-back-link">← Mis instituciones</Link>}
      />
      <section className="sii-panel space-y-4">
        <InstitutionOverview institutionId={institutionId}/>
        {correctionStaff({id:user.id,active:true,mustChangePassword:user.mustChangePassword,grants:access.grants},institutionId,correctionPolicy(institutionId))&&<div><Link className="sii-outline-button" href={{pathname:`/dashboard/institutions/${institutionId}/grading/corrections`}}>Revisión institucional de rectificaciones</Link></div>}
      </section>
    </div>
  );
}
