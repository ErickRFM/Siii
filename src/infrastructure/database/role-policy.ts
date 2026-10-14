export type ApplicationRoleInspection={privileged:boolean;can_ddl:boolean;app_member:boolean;migrator_member:boolean;owns_objects:boolean;unsafe_dml:boolean;unsafe_rpc:boolean};
export const APPLICATION_ROLE_QUERY=`
 SELECT
 EXISTS(SELECT FROM pg_roles r WHERE (pg_has_role(session_user,r.oid,'MEMBER') OR pg_has_role(current_user,r.oid,'MEMBER')) AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole)) AS privileged,
 has_schema_privilege(current_user,'public','CREATE') AS can_ddl,
 pg_has_role(current_user,'siii_app','USAGE') AS app_member,
 pg_has_role(session_user,'siii_migrator','MEMBER') AS migrator_member,
 EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_objects,
 EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND (
  has_table_privilege(current_user,c.oid,'TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'REFERENCES')
  OR (c.relname NOT IN('auth_sessions','auth_throttle') AND has_table_privilege(current_user,c.oid,'DELETE'))
  OR (c.relname='security_audit_log' AND has_any_column_privilege(current_user,c.oid,'UPDATE'))
 )) AS unsafe_dml,
 EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS unsafe_rpc
`;
export function assertRoleInspection(role:ApplicationRoleInspection|undefined){
 if(!role||Object.values(role).some(value=>typeof value!=='boolean')||role.privileged||role.can_ddl||!role.app_member||role.migrator_member||role.owns_objects||role.unsafe_dml||role.unsafe_rpc)throw new Error('DATABASE_ROLE_UNSAFE');
}
