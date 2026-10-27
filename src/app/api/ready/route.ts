import {NextResponse} from 'next/server';
import {sql} from 'drizzle-orm';
import {db,assertApplicationRole} from '@/infrastructure/database';
export const runtime='nodejs';
export async function GET(){
 try{
  await assertApplicationRole();
  await db.execute(sql`SELECT 1`);
  return NextResponse.json({status:'ready',database:'connected'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const code=error instanceof Error&&error.message==='DATABASE_ROLE_UNSAFE'?'DATABASE_ROLE_UNSAFE':'READINESS_FAILED';
  return NextResponse.json({status:'unavailable',database:'unavailable',error:{code}},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
