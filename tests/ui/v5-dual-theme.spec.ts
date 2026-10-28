import {test,expect} from '@playwright/test';

for(const theme of ['light','dark'] as const){
 test(`login ${theme}: mobile identity and form precede decoration`,async({page})=>{
  await page.addInitScript(value=>localStorage.setItem('sii-theme',value),theme);
  for(const width of [360,390,412,430,768,1024,1366,1440]){
   await page.setViewportSize({width,height:900});await page.goto('/login');
   await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
   await expect(page.getByLabel('Usuario institucional')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(width<=430){await expect(page.locator('.sii-auth-story-content')).toBeHidden();const field=await page.getByLabel('Usuario institucional').boundingBox();expect(field!.y).toBeLessThan(500)}
  }
 });
}

test('night palette uses neutral charcoal and survives reload',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('sii-theme','dark'));
 await page.goto('/login');await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
 expect(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--siii-v5-background').trim())).toBe('#0D0F12');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
});
