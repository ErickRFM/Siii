import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {isolatedDatabaseUrl} from './tests/support/database-url';
isolatedDatabaseUrl();
export default defineConfig({test:{environment:'node',globalSetup:['tests/support/financial-legacy-setup.ts'],include:['tests/legacy/financial-payer-http.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:30000},resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}}});
