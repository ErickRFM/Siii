import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomBytes,randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret,digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';

type Profile='super_admin'|'teacher'|'student'|'guest';
const roles:Profile[]=['super_admin','teacher','student','guest'];
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-responsive-test-2026!';
const suffix=randomUUID().slice(0,8);
const actors={} as Record<Profile,{username:string;recovery:string}>;
let institutionId:string;
test.beforeAll(async()=>{
 await sql.connect();
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 institutionId=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA adaptable sintética',$1) RETURNING id",['RSP'+suffix])).rows[0].id;
 for(const role of roles){
  const username='responsive-'+role.replace('_','')+'-'+suffix;
  const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA','Responsive') RETURNING id")).rows[0].id;
  const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
  const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionId,user])).rows[0].id;
  await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
  const factor=(await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)])).rows[0].id;
  const recovery=randomBytes(16).toString('hex').toUpperCase();
  await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(recovery,user)]);
  actors[role]={username,recovery};
 }
});
test.beforeEach(async()=>{await sql.query('DELETE FROM auth_throttle')});
test.afterAll(async()=>{await sql.end()});
async function login(page:Page,role:Profile){
 await page.goto('/login');
 await page.getByLabel('Usuario institucional').fill(actors[role].username);
 await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar al sistema'}).click();
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
 await page.getByLabel('Código de recuperación',{exact:true}).fill(actors[role].recovery);
 await page.getByRole('button',{name:'Verificar y entrar'}).click();
 await expect(page).toHaveURL(/\/dashboard$/);
}
for(const role of roles){
 test('institution role and responsive theme audit: '+role,async({page})=>{
  test.setTimeout(150000);
  await login(page,role);
  const area=role==='super_admin'?'registry':role==='teacher'?'grading':role==='student'?'academic':'';
  await page.goto('/dashboard/institutions/'+institutionId+(area?'/'+area:''));
  await expect(page.locator('main')).toBeVisible();
  for(const theme of ['light','dark'] as const){
   const current=await page.locator('html').getAttribute('data-sii-theme');
   if(current!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
   await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
   for(const width of [360,768,1440]){
    await page.setViewportSize({width,height:850});
    await expect(page.locator('main')).toBeVisible();
    if(role==='student'&&width===360){
      const field=page.locator('#catalog-search');
      await expect(field).toBeVisible();
      const bounds=await field.boundingBox();
      expect(bounds?.width,'mobile catalog search must remain usable').toBeGreaterThanOrEqual(180);
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
    }
    const dimensions=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:window.innerWidth}));
    expect(dimensions.content,role+' '+theme+' '+width+': horizontal viewport overflow').toBeLessThanOrEqual(dimensions.viewport+2);
    await page.screenshot({path:'.p0-local/ux-matrix-'+role+'-'+theme+'-'+width+'.png',fullPage:true});
    if(width===360){
     const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
     expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
    }
   }
  }
 });
}
