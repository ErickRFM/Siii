import {z} from 'zod';
import type {NextRequest} from 'next/server';
import {sql,type SQL} from 'drizzle-orm';
import type {AnyPgColumn} from 'drizzle-orm/pg-core';
const cursorBody=z.object({v:z.literal(1),scope:z.string().max(180),at:z.iso.datetime().refine(value=>Number(value.slice(0,4))>=1),id:z.uuid()}).strict();
export type PageInput={limit:number;cursor:z.infer<typeof cursorBody>|null};
export function parsePage(req:NextRequest,scope:string):PageInput|null{
 const params=req.nextUrl.searchParams;
 for(const key of params.keys())if(!['limit','cursor'].includes(key)||params.getAll(key).length!==1)return null;
 const limit=z.coerce.number().int().min(1).max(100).safeParse(params.get('limit')??50);
 if(!limit.success)return null;
 const raw=params.get('cursor');
 if(!raw)return {limit:limit.data,cursor:null};
 if(raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))return null;
 try{
  const parsed=cursorBody.safeParse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8')));
  return parsed.success&&parsed.data.scope===scope?{limit:limit.data,cursor:parsed.data}:null;
 }catch{return null;}
}
export const cursorTimestamp=(column:AnyPgColumn)=>sql<string>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export function cursorPredicate(page:PageInput,at:AnyPgColumn,id:AnyPgColumn):SQL|undefined{
 if(!page.cursor)return undefined;
 return sql`(${at}<${page.cursor.at}::timestamptz OR (${at}=${page.cursor.at}::timestamptz AND ${id}<${page.cursor.id}::uuid))`;
}
export function pageEnvelope<T extends {id:string;cursorAt:string}>(rows:T[],input:PageInput,scope:string){
 const visible=rows.slice(0,input.limit);
 const last=visible[visible.length-1];
 const nextCursor=rows.length>input.limit&&last?Buffer.from(JSON.stringify({v:1,scope,at:last.cursorAt,id:last.id})).toString('base64url'):null;
 return {visible,page:{nextCursor}};
}
