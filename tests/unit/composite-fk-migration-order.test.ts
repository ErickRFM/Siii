import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('composite foreign-key dependency order in fresh database migrations',()=>{
  const migrations=[
    ['0019_admissions_system.sql','CREATE UNIQUE INDEX IF NOT EXISTS "admission_cycles_id_institution_uidx"','ADD CONSTRAINT "applications_cycle_tenant_fk"'],
    ['0021_financials_treasury.sql','CREATE UNIQUE INDEX IF NOT EXISTS "financial_fee_types_id_institution_uidx"','ADD CONSTRAINT "orders_fee_type_tenant_fk"'],
  ] as const;
  for(const [file,index,fk] of migrations){
    it(file+' creates parent uniqueness before dependent tenant FK',()=>{
      const sql=readFileSync(resolve(process.cwd(),'db/migrations',file),'utf8');
      expect(sql.indexOf(index)).toBeGreaterThan(-1);
      expect(sql.indexOf(fk)).toBeGreaterThan(sql.indexOf(index));
    });
  }
});
