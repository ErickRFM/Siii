import type {CatalogResource} from './catalog-validation';
export type CatalogStatus='active'|'inactive'|'archived';
const transitions:Record<CatalogResource,Record<CatalogStatus,readonly CatalogStatus[]>>={
 campuses:{active:['inactive','archived'],inactive:['active','archived'],archived:[]},
 terms:{active:['inactive','archived'],inactive:['active','archived'],archived:[]},
 programs:{active:['inactive','archived'],inactive:['active','archived'],archived:[]},
 courses:{active:['inactive','archived'],inactive:['active','archived'],archived:[]},
 curricula:{active:['inactive','archived'],inactive:['active','archived'],archived:[]},
};
export function canTransition(resource:CatalogResource,from:string,to:CatalogStatus){
 return from===to || !!transitions[resource][from as CatalogStatus]?.includes(to);
}
