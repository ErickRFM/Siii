import {and,eq,desc,getTableColumns,type InferInsertModel} from 'drizzle-orm';
import type {PgUpdateSetSource} from 'drizzle-orm/pg-core';
import type {z} from 'zod';
import {db} from '@/infrastructure/database';
import {campuses,academicTerms,academicPrograms,academicCourses,curriculumVersions} from '../../../db/schema';
import {catalogCreate,catalogUpdate,type CatalogResource} from './catalog-validation';
import type {Transaction} from '@/shared/http/request-context';
import {cursorTimestamp,cursorPredicate,type PageInput} from '@/shared/http/pagination';
type Table=typeof campuses|typeof academicTerms|typeof academicPrograms|typeof academicCourses|typeof curriculumVersions;
export type CatalogRow={id:string;institutionId:string;status:string;createdAt:Date}&Record<string,unknown>;
export type CatalogPatch={id:string;name?:string;status?:'active'|'inactive'|'archived'};
type Definition={
 table:Table;createSchema:z.ZodType;updateSchema:z.ZodType<CatalogPatch>;
 insert(tx:Transaction,institutionId:string,payload:unknown):Promise<CatalogRow>;
 find(tx:Transaction,institutionId:string,id:string):Promise<CatalogRow|null>;
 update(tx:Transaction,institutionId:string,change:CatalogPatch):Promise<CatalogRow|null>;
 list(institutionId:string,page:PageInput):Promise<Array<CatalogRow&{cursorAt:string}>>;
 publicRow(row:CatalogRow):Record<string,unknown>;
};
function definition<T extends Table,S extends z.ZodType>(
 source:T,createSchema:S,updateSchema:z.ZodType<CatalogPatch>,
 map:(data:z.output<S>)=>Omit<InferInsertModel<T>,'institutionId'>,fields:readonly string[]
):Definition{
 const table=source as Table;
 return {
  table,createSchema,updateSchema,
  async insert(tx,institutionId,payload){
   // Payload has been checked once by this definition's schema at the handler boundary.
   const values={...map(payload as z.output<S>),institutionId} as InferInsertModel<Table>;
   const [row]=await tx.insert(table).values(values).returning();
   return row as unknown as CatalogRow;
  },
  async find(tx,institutionId,id){
   const [row]=await tx.select().from(table).where(and(eq(table.id,id),eq(table.institutionId,institutionId))).limit(1).for('update');
   return row as unknown as CatalogRow ?? null;
  },
  async update(tx,institutionId,change){
   const set={...(change.name!==undefined?{name:change.name}:{}),...(change.status?{status:change.status}:{}),updatedAt:new Date()} as PgUpdateSetSource<Table>;
   const [row]=await tx.update(table).set(set).where(and(eq(table.id,change.id),eq(table.institutionId,institutionId))).returning();
   return row as unknown as CatalogRow ?? null;
  },
  async list(institutionId,page){
   const rows=await db.select({...getTableColumns(table),cursorAt:cursorTimestamp(table.createdAt)}).from(table)
    .where(and(eq(table.institutionId,institutionId),cursorPredicate(page,table.createdAt,table.id)))
    .orderBy(desc(table.createdAt),desc(table.id)).limit(page.limit+1);
   return rows as unknown as Array<CatalogRow&{cursorAt:string}>;
  },
  publicRow(row){return Object.fromEntries(fields.map(field=>[field,row[field]]));}
 };
}
const common=['id','institutionId','status','createdAt','updatedAt'] as const;
export const catalogRegistry:Record<CatalogResource,Definition>={
 campuses:definition(campuses,catalogCreate.campuses,catalogUpdate.campuses,value=>value,[...common,'code','name','isPrimary']),
 terms:definition(academicTerms,catalogCreate.terms,catalogUpdate.terms,value=>value,[...common,'code','name','startDate','endDate']),
 programs:definition(academicPrograms,catalogCreate.programs,catalogUpdate.programs,value=>value,[...common,'code','name','level','modality']),
 courses:definition(academicCourses,catalogCreate.courses,catalogUpdate.courses,value=>value,[...common,'code','name','credits']),
 curricula:definition(curriculumVersions,catalogCreate.curricula,catalogUpdate.curricula,value=>value,[...common,'programId','version']),
};
