import type {CatalogResource} from './catalog-validation';

export type CatalogPresence = 'empty' | 'present' | 'error';
/** Presence within the current user's server-authorized scope; never a readiness verdict or count. */
export async function readCatalogPresence(institutionId:string,resource:CatalogResource,signal:AbortSignal):Promise<CatalogPresence>{
 try{
  const response=await fetch(`/api/v1/institutions/${institutionId}/academic/${resource}?limit=1`,{cache:'no-store',credentials:'same-origin',signal});
  if(!response.ok)return 'error';
  const body=await response.json() as {data?:unknown};
  if(!Array.isArray(body.data)||body.data.some(row=>!row||typeof row!=='object'||typeof row.id!=='string'))return 'error';
  return body.data.length>0?'present':'empty';
 }catch(error){
  if(signal.aborted)throw error;
  return 'error';
 }
}
