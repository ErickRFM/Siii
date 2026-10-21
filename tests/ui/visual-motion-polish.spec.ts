import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync} from 'node:fs';

for(const theme of ['light','dark'] as const){
 test('login visual polish preserves accessible form and motion preference: '+theme,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/login');
  const current=await page.locator('html').getAttribute('data-sii-theme');
  if(current!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
  const card=page.locator('.sii-auth-form-wrap');
  await expect(card).toBeVisible();
  await expect(page.getByLabel('Usuario institucional')).toBeVisible();
  await expect(page.getByLabel('Contraseña',{exact:true})).toBeVisible();
  mkdirSync('.p0-local',{recursive:true});
  await page.screenshot({path:'.p0-local/ux-matrix-login-'+theme+'-390.png',fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'.p0-local/ux-matrix-login-'+theme+'-1440.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const viewport=await page.evaluate(()=>({document:document.documentElement.scrollWidth,window:window.innerWidth}));
  expect(viewport.document).toBeLessThanOrEqual(viewport.window+1);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(page.getByLabel('Usuario institucional')).toBeEditable();
 });
}
