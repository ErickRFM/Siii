import { NextResponse } from 'next/server';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
export async function GET(){
 const identity=await getIdentity();if(!identity)return jsonError('UNAUTHENTICATED',401);
 return NextResponse.json({data:identity.mustChangePassword?[]:await getInstitutionAccess(identity.id)},{headers:{'Cache-Control':'no-store'}});
}
