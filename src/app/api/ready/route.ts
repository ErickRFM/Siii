import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
export const runtime='nodejs';
export async function GET(){
 try{
  await db.execute(sql`SELECT 1`);
  return NextResponse.json({status:'ready',database:'connected'},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({status:'unavailable',database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
