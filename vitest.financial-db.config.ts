import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {isolatedDatabaseUrl} from './tests/support/database-url';
export default defineConfig({test:{environment:'node',env:{DATABASE_URL:isolatedDatabaseUrl(),INTEGRATION_DATABASE_URL:isolatedDatabaseUrl()},include:['tests/integration/financial-tenant-constraints.test.ts'],fileParallelism:false,testTimeout:30000},resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}}});
