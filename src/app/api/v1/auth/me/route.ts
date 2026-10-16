import {NextRequest,NextResponse} from 'next/server';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {withErrors} from '@/shared/http/route-errors';
export const runtime='nodejs';
export const GET=withErrors(async(_req:NextRequest)=>{
 const identity=await getIdentity();if(!identity)return jsonError('UNAUTHENTICATED',401);
 const institutions=identity.mustChangePassword?[]:await getInstitutionAccess(identity.id);
 return NextResponse.json({user:{id:identity.id,username:identity.username,name:identity.firstName+' '+identity.lastName,mustChangePassword:identity.mustChangePassword},institutions},{headers:{'Cache-Control':'no-store'}});
});
