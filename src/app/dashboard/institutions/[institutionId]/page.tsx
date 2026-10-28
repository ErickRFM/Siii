import Link from 'next/link';
import {correctionPolicy,correctionStaff} from '@/modules/grading/correction-policy';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';

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
    <>
      <div className="sii-page-eyebrow">CONTEXTO INSTITUCIONAL <span className="sii-page-eyebrow-line"/></div>
      <div className="sii-page-heading"><div><h1>{access.institutionName}<span className="sii-welcome-period">.</span></h1><p>Tu perfil y permisos vigentes en esta institución.</p></div>
        <Link href="/dashboard" className="sii-outline-button sii-back-link">← Mis instituciones</Link>
      </div>
      <div className="sii-security-layout siii-glass-workspace">
        <section className="sii-panel sii-security-card">
          <span className="sii-section-kicker">INSTITUCIÓN AUTORIZADA</span>
          <h2>{access.institutionName}</h2><p>Clave institucional: {access.institutionCode}</p>
          <InstitutionOverview institutionId={institutionId}/>
          {correctionStaff({id:user.id,active:true,mustChangePassword:user.mustChangePassword,grants:access.grants},institutionId,correctionPolicy(institutionId))&&<Link className="sii-outline-button" href={{pathname:`/dashboard/institutions/${institutionId}/grading/corrections`}}>Revisión institucional de rectificaciones</Link>}
        </section>
        <aside className="sii-panel sii-security-aside"><span className="sii-security-shield" aria-hidden="true">▥</span>
          <h2>Acceso por institución</h2>
          <p>SII restringe cada operación a los permisos y membresías asociados a este contexto.</p>
          <Link href="/dashboard/security" className="sii-outline-button">Ver seguridad de cuenta →</Link>
        </aside>
      </div>
    </>
  );
}
