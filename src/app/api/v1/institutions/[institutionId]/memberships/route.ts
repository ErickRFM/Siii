import {NextRequest} from 'next/server';
import {authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid,membershipCreateBody} from '@/shared/auth/validation';
import {withErrors} from '@/shared/http/route-errors';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
export {listUsers as GET} from '@/shared/users/handlers';
export const POST=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const access=await authorizeCapability(institutionId,'memberships.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=membershipCreateBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 return jsonError('INVITATION_REQUIRED',409);
});
