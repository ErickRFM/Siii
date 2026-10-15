import {describe,it,expect} from 'vitest';
import {validateCloudConnection,normalizeCloudConnection,validateCloudPhase,assertFreshCloudDatabase,assertCloudRoleGraph,addCloudReplayCreatorPrivileges} from '../../scripts/rehearse-cloud-schema';

const env={SIII_DATABASE_ENV:'staging',NODE_ENV:'test'};
const direct='postgresql://postgres:synthetic@db.vsnrbjexusidlvhkhmqg.supabase.co:5432/postgres?sslmode=verify-full';
describe('cloud rehearsal boundary, without database connections',()=>{
 it('accepts only the staging direct authority and expected control database',()=>{
  expect(validateCloudConnection(direct,env).hostname).toBe('db.vsnrbjexusidlvhkhmqg.supabase.co');
 });
 it('accepts session pooler routing by the exact staging username',()=>{
  expect(validateCloudConnection('postgresql://postgres.vsnrbjexusidlvhkhmqg:synthetic@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',env).port).toBe('5432');
 });
 it.each([
  direct.replace('vsnrbjexusidlvhkhmqg','kkjzbqsaummyralqjqrb'),
  direct.replace(':5432',':6543'),direct.replace('/postgres?','/p01_legacy_rehearsal?'),
  direct.replace('postgres:','other:'),direct.replace('sslmode=verify-full','sslmode=disable'),
  direct.replace('sslmode=verify-full','sslmode=require'),direct.replace('sslmode=verify-full','sslmode=verify-ca'),
  direct+'&host=localhost',direct+'&options=-c%20role=postgres',direct+'&sslmode=verify-full',
  direct.replace('db.vsnrbjexusidlvhkhmqg.supabase.co','localhost'),
  'postgresql://postgres.other:synthetic@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
 ])('rejects redirected or unrelated connection authority',raw=>{
  expect(()=>validateCloudConnection(raw,env)).toThrow('CLOUD_URL_REJECTED');
 });
 it('rejects production or missing staging declarations before connecting',()=>{
  expect(()=>validateCloudConnection(direct,{...env,NODE_ENV:'production'})).toThrow('CLOUD_ENV_REJECTED');
  expect(()=>validateCloudConnection(direct,{NODE_ENV:'test'})).toThrow('CLOUD_ENV_REJECTED');
  expect(()=>normalizeCloudConnection(direct,{...env,NODE_TLS_REJECT_UNAUTHORIZED:'0'})).toThrow('CLOUD_ENV_REJECTED');
 });
 it('adds verified TLS only in memory when the supplied standard URI omits sslmode',()=>{
  const raw=direct.split('?')[0];
  expect(normalizeCloudConnection(raw,env).searchParams.get('sslmode')).toBe('verify-full');
  expect(raw).not.toContain('sslmode');
 });
 it.each(['preflight','prepare','empty','legacy','verify','rollback'])('accepts only the explicit bounded phase %s',phase=>{
  expect(validateCloudPhase(phase)).toBe(phase);
 });
 it.each([undefined,'delete','cleanup','production','restore-anything'])('rejects unsupported phases before reading credentials',phase=>{
  expect(()=>validateCloudPhase(phase)).toThrow('CLOUD_PHASE_REJECTED');
 });
 const fresh={database:'p01_empty_rehearsal',sessionUser:'postgres',currentUser:'postgres',version:170011,defaults:0,relations:0,publicTypes:0,ledger:null,managedSchemas:0};
 it('accepts only an empty disposable cloud database',()=>{
  expect(()=>assertFreshCloudDatabase(fresh,'p01_empty_rehearsal')).not.toThrow();
 });
 it.each([{database:'postgres'},{defaults:1},{relations:1},{publicTypes:1},{ledger:'drizzle.__drizzle_migrations'},{managedSchemas:1},{version:160000},{currentUser:'siii_app'}])('rejects database-local drift without deleting it',change=>{
  expect(()=>assertFreshCloudDatabase({...fresh,...change},'p01_empty_rehearsal')).toThrow('CLOUD_DATABASE_NOT_FRESH');
 });
});

describe('exclusive fixture membership boundary',()=>{
 const roles={owner:'p01_fixture_owner',creator:'p01_fixture_creator',service:'p01_fixture_service',dashboard:'p01_fixture_dashboard',runtime:'p01_fixture_runtime'};
 const graph=()=>[
  ...['siii_app','siii_migrator',...Object.values(roles)].map(parent=>({parent,member:'postgres',admin_option:true,inherit_option:parent!==roles.runtime,set_option:parent!==roles.runtime})),
  {parent:'siii_app',member:roles.runtime,admin_option:false,inherit_option:true,set_option:true},
 ];
 it('accepts product-compatible inherited app access and fixture-only executor authority',()=>{
  expect(()=>assertCloudRoleGraph(graph(),roles)).not.toThrow();
 });
 it.each(['siii_migrator','postgres','pg_read_server_files'])('denies any extra parent %s for the runtime LOGIN',parent=>{
  expect(()=>assertCloudRoleGraph([...graph(),{parent,member:roles.runtime,admin_option:false,inherit_option:true,set_option:true}],roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 it('denies runtime ADMIN even on its allowed app group',()=>{
  const edges=graph();edges[edges.length-1].admin_option=true;
  expect(()=>assertCloudRoleGraph(edges,roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 it('denies granting a fixture role to an unrelated principal',()=>{
  expect(()=>assertCloudRoleGraph([...graph(),{parent:roles.owner,member:'unrelated',admin_option:false,inherit_option:true,set_option:true}],roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 const complementaryGraph=()=>graph().flatMap(edge=>edge.member==='postgres'&&edge.parent!==roles.runtime?[
  {...edge,inherit_option:false,set_option:false},
  {...edge,admin_option:false},
 ]:[edge]);
 it('accepts PostgreSQL 17 automatic ADMIN and separate INHERIT/SET membership rows',()=>{
  expect(()=>assertCloudRoleGraph(complementaryGraph(),roles)).not.toThrow();
 });
 it.each(['admin','inherit','set'])('requires the complete complementary executor authority: %s',missing=>{
  const edges=complementaryGraph();
  const edge=edges.find(value=>value.parent==='siii_app'&&value.member==='postgres'&&(missing==='admin'?value.admin_option:!value.admin_option))!;
  if(missing==='admin')edge.admin_option=false;
  if(missing==='inherit')edge.inherit_option=false;
  if(missing==='set')edge.set_option=false;
  expect(()=>assertCloudRoleGraph(edges,roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 it('rejects redundant executor rows instead of silently accepting a broader grant graph',()=>{
  const edges=graph();edges.push({...edges[0]});
  expect(()=>assertCloudRoleGraph(edges,roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 it('does not accept effective inheritance or SET authority for the runtime executor edge',()=>{
  const edges=complementaryGraph();edges.push({parent:roles.runtime,member:'postgres',admin_option:false,inherit_option:true,set_option:true});
  expect(()=>assertCloudRoleGraph(edges,roles)).toThrow('CLOUD_FIXTURE_ROLE_UNSAFE');
 });
 it('requires effective executor rights after canonical ownership transfers',()=>{
  expect(()=>assertCloudRoleGraph(graph().filter(edge=>edge.parent!=='siii_migrator'),roles)).toThrow('CLOUD_EXECUTOR_ROLE_UNSAFE');
 });
});


describe('atomic legacy replay boundary',()=>{
 const roles={owner:'fixture_owner',creator:'fixture_creator'};
 const sql='BEGIN;\nCREATE SCHEMA IF NOT EXISTS "public";\nCOMMIT;\n';
 it('accepts the exact single replay transaction boundary',()=>{
  expect(()=>addCloudReplayCreatorPrivileges(sql,roles)).not.toThrow();
 });
 it.each([
  sql.replace('BEGIN;\n',''),
  sql+sql,
  sql.replace('COMMIT;','BEGIN;\nCOMMIT;'),
  sql.replace('COMMIT;','COMMIT;\nCOMMIT;'),
  sql.replace('COMMIT;\n',''),
  sql+'SELECT 1;\n',
 ])('rejects a missing, duplicated or extended transaction boundary',candidate=>{
  expect(()=>addCloudReplayCreatorPrivileges(candidate,roles)).toThrow('CLOUD_REPLAY_BOUNDARY_REJECTED');
 });
 it('rejects collapsing the two independently owned fixture creators',()=>{
  expect(()=>addCloudReplayCreatorPrivileges(sql,{owner:'same',creator:'same'})).toThrow('CLOUD_REPLAY_BOUNDARY_REJECTED');
 });
});
