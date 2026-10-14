import {randomUUID} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {db} from '@/infrastructure/database';
import {securityAuditLog} from '../../../db/schema';
export type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export function requestId(headers:Pick<Headers,'get'>){
 const value=headers.get('x-request-id');
 return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:randomUUID();
}
export function context(req:NextRequest){return {requestId:requestId(req.headers)}}
export async function audit(tx:Transaction,input:typeof securityAuditLog.$inferInsert){
 if(!input.requestId)throw new Error('AUDIT_REQUEST_ID_REQUIRED');
 await tx.insert(securityAuditLog).values(input);
}
