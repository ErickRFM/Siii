type CatalogAccess = {
 institutionId:string;membershipId:string;restricted:boolean;capabilities:readonly string[];
 grants:readonly {id:string;role:string;scopeType:string;scopeId:string|null;expiresAt:string|null}[];
 scopedCapabilities:readonly {scopeType:string;scopeId:string;capabilities:readonly string[]}[];
};
const sorted=(values:readonly string[])=>[...new Set(values)].sort();
/** Cache invalidation only. Server authorization remains authoritative; MFA freshness is intentionally excluded. */
export function catalogAccessKey(access:CatalogAccess|null):string{
 if(!access)return '';
 return JSON.stringify([
  access.institutionId,access.membershipId,access.restricted,sorted(access.capabilities),
  access.grants.map(grant=>JSON.stringify([grant.id,grant.role,grant.scopeType,grant.scopeId,grant.expiresAt])).sort(),
  access.scopedCapabilities.map(scope=>JSON.stringify([scope.scopeType,scope.scopeId,sorted(scope.capabilities)])).sort(),
 ]);
}
