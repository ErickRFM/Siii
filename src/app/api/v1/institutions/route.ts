import {NextRequest,NextResponse} from 'next/server';
import {and,inArray,desc} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutions} from '../../../../../db/schema';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {withErrors} from '@/shared/http/route-errors';
import {parsePage,pageEnvelope,cursorTimestamp,cursorPredicate} from '@/shared/http/pagination';
export const runtime='nodejs';
export const GET=withErrors(async(req:NextRequest)=>{
 const identity=await getIdentity();if(!identity)return jsonError('UNAUTHENTICATED',401);
 const scope='institutions:'+identity.id,input=parsePage(req,scope);if(!input)return jsonError('INVALID_PAGE',400);
 const own=identity.mustChangePassword?[]:await getInstitutionAccess(identity.id);
 if(!own.length)return NextResponse.json({data:[],page:{nextCursor:null}},{headers:{'Cache-Control':'no-store'}});
 const byId=new Map(own.map(row=>[row.institutionId,row]));
 const rows=await db.select({id:institutions.id,cursorAt:cursorTimestamp(institutions.createdAt)}).from(institutions).where(and(inArray(institutions.id,own.map(row=>row.institutionId)),cursorPredicate(input,institutions.createdAt,institutions.id))).orderBy(desc(institutions.createdAt),desc(institutions.id)).limit(input.limit+1);
 const {visible,page}=pageEnvelope(rows,input,scope);
 return NextResponse.json({data:visible.map(row=>byId.get(row.id)),page},{headers:{'Cache-Control':'no-store'}});
});
