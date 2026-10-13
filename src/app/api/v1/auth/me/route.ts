import { NextResponse } from 'next/server';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
export async function GET(){
 const identity=await getIdentity();if(!identity)return jsonError('UNAUTHENTICATED',401);
 const institutions=await getInstitutionAccess(identity.id);
 return NextResponse.json({user:{id:identity.id,username:identity.username,name:`${identity.firstName} ${identity.lastName}`,mustChangePassword:identity.mustChangePassword},institutions},{headers:{'Cache-Control':'no-store'}});
}
