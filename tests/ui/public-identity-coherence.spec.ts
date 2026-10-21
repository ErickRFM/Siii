import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for(const path of ['/password/forgot','/password/reset','/invitations/accept'] as const){
 for(const theme of ['light','dark'] as const){
  test('public identity flow shares SIII design: '+path+' / '+theme,async({page})=>{
   test.setTimeout(60000);
   await page.setViewportSize({width:390,height:844});
   await page.goto(path);
   const themeToggle=page.locator('.sii-theme-toggle');
   await expect(themeToggle).toBeVisible();
   // Wait for the client theme preference to hydrate before deciding to toggle.
   const desiredLabel=theme==='dark'?'Activar tema claro':'Activar tema oscuro';
   await expect(themeToggle).toHaveAttribute('aria-label',/Activar tema (claro|oscuro)/);
   if(await themeToggle.getAttribute('aria-label')!==desiredLabel)await themeToggle.click();
   await expect(themeToggle).toHaveAttribute('aria-label',desiredLabel);
   await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
   await expect(page.locator('main#main-content')).toBeVisible();
   await expect(page.locator('.sii-auth-form-wrap')).toBeVisible();
   const dimensions=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:window.innerWidth}));
   expect(dimensions.content,path+'/'+theme+' global overflow').toBeLessThanOrEqual(dimensions.viewport+2);
   const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   expect(report.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),path+'/'+theme+' WCAG').toEqual([]);
  });
 }
}
