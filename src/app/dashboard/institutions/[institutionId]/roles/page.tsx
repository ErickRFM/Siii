import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
import InstitutionRoles from '@/components/institution-roles';

export const dynamic = 'force-dynamic';
export default async function RolesPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const { institutionId } = await params;
  const access = (await getInstitutionAccess(user.id)).find(item => item.institutionId === institutionId);
  if (!access) notFound();
  return <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} active="roles" institutionId={institutionId}>
    <div className="sii-page-eyebrow">ACCESO INSTITUCIONAL <span className="sii-page-eyebrow-line"/></div>
    <div className="sii-page-heading"><div><h1>Roles y ámbitos<span className="sii-welcome-period">.</span></h1><p>{access.institutionName} · Concesiones por institución, programa o campus.</p></div><Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link></div>
    <InstitutionRoles institutionId={institutionId}/>
  </SiiAppShell>;
}
