import SiiThemeToggle from '@/components/sii-theme-toggle';
import {notFound} from 'next/navigation';
import {z} from 'zod';
import {and,eq,lte,gt} from 'drizzle-orm';
import {db,assertApplicationRole} from '@/infrastructure/database';
import {institutions,admissionCycles,academicPrograms} from '../../../../db/schema';
import AdmissionsPortal from '@/components/admissions-portal';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function PublicAdmissions({params}:{params:Promise<{institutionId:string}>}){
 await assertApplicationRole();const {institutionId}=await params;if(!z.uuid().safeParse(institutionId).success)notFound();
 const [institution]=await db.select({name:institutions.name}).from(institutions).where(and(eq(institutions.id,institutionId),eq(institutions.status,'active')));if(!institution)notFound();
 const now=new Date();
 const cycles=await db.select({id:admissionCycles.id,name:admissionCycles.name,code:admissionCycles.code,status:admissionCycles.status}).from(admissionCycles).where(and(eq(admissionCycles.institutionId,institutionId),eq(admissionCycles.status,'open'),lte(admissionCycles.startDate,now),gt(admissionCycles.endDate,now)));
 const programs=cycles.length?await db.select({id:academicPrograms.id,name:academicPrograms.name,code:academicPrograms.code}).from(academicPrograms).where(and(eq(academicPrograms.institutionId,institutionId),eq(academicPrograms.status,'active'))):[];
 return <main id="main-content" className="sii-main"><SiiThemeToggle/><h1>Admisiones · {institution.name}</h1><AdmissionsPortal institutionId={institutionId} institutionName={institution.name} cycles={cycles} programs={programs}/></main>;
}
