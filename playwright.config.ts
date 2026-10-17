import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/ui',timeout:60000,workers:1,fullyParallel:false,
<<<<<<< HEAD
 globalSetup:'./tests/support/ui-setup.ts',
=======
 globalSetup:'./tests/support/http-setup.ts',
>>>>>>> integrate/sii-v1
 outputDir:'.superpowers/sdd/2026-10-13-p0-hardening/ui-results',
 reporter:'line',
 use:{baseURL:'http://127.0.0.1:3107',browserName:'chromium',headless:true,locale:'es-MX',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
});
