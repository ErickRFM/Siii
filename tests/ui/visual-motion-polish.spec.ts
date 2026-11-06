import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync} from 'node:fs';
import {expectVisualBaseline} from '../support/visual-baseline';

for(const theme of ['light','dark'] as const){
 test('login visual polish preserves accessible form and motion preference: '+theme,async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/login');
  // Hydration updates the root theme and the toggle in separate commits.
  // Wait until they agree; otherwise an initial SSR value can select a stale button label.
  const toggle=page.locator('.sii-theme-toggle');
  await expect(toggle).toBeVisible();
  await expect.poll(async()=>{
   const current=await page.locator('html').getAttribute('data-sii-theme');
   const label=await toggle.getAttribute('aria-label');
   return current+'|'+label;
  }).toMatch(/^(?:light[|]Activar tema oscuro|dark[|]Activar tema claro)$/);
  const current=await page.locator('html').getAttribute('data-sii-theme');
  if(current!==theme)await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
  const card=page.locator('[data-siii-login-form="v3"]');
  await expect(card).toBeVisible();
  await expect(page.getByLabel('Usuario institucional')).toBeVisible();
  await expect(page.getByLabel('Contraseña',{exact:true})).toBeVisible();
  mkdirSync('.p0-local',{recursive:true});
  const mobileEvidence=await page.screenshot({path:'.p0-local/ux-matrix-login-'+theme+'-390.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:900});
  const desktopEvidence=await page.screenshot({path:'.p0-local/ux-matrix-login-'+theme+'-1440.png',fullPage:true,animations:'disabled'});
  // Capture both requested viewports before failing on any missing or mismatched V2 reference.
  // No auto-approval, masking or threshold changes: references require an explicit reviewed commit.
  let baselineError:unknown;
  try{expectVisualBaseline(mobileEvidence,`v2-login-${theme}-390`,info)}catch(error){baselineError=error}
  try{expectVisualBaseline(desktopEvidence,`v2-login-${theme}-1440`,info)}catch(error){baselineError??=error}
  await page.setViewportSize({width:390,height:844});
  const viewport=await page.evaluate(()=>({document:document.documentElement.scrollWidth,window:window.innerWidth}));
  expect(viewport.document).toBeLessThanOrEqual(viewport.window+1);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(page.getByLabel('Usuario institucional')).toBeEditable();
  if(baselineError)throw baselineError;
 });
}
