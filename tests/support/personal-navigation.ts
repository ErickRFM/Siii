import {expect,type Page} from '@playwright/test';

/** Exercise the visible destination, including the mobile drawer and its focus trap. */
export async function personalNavigate(page:Page,label:string){
 const tab=page.getByRole('tab',{name:label,exact:true});
 if(await tab.isVisible()){await tab.click();return}
 const labels:Record<string,string>={Académico:'Carga académica',Finanzas:'Estado de cuenta',Servicios:'Mis trámites'};
 const menu=page.getByRole('button',{name:'Abrir navegación',exact:true});
 if(await menu.isVisible())await menu.click();
 const nav=page.getByRole('navigation',{name:'Navegación institucional',exact:true});
 const targetName=labels[label]??label;
 const link=nav.getByRole('link',{name:targetName,exact:true});
 if(!(await link.isVisible())){
  // Sidebar groups are collapsed by default. Find the disclosure by its actual
  // destination, not by the top-level tab name (Servicios -> Trámites).
  const group=nav.locator('.siii-personal-nav-group').filter({hasText:targetName});
  await expect(group).toHaveCount(1);
  await group.locator('summary').click();
 }
 await expect(link).toBeVisible();
 await link.click();
 if(await menu.isVisible()){
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Radix removes aria-hidden after the mobile sheet exit transition.
  // Keep the full WCAG audit: never inspect a page while its focus trap is still active.
  await expect(page.locator('#siii-personal')).not.toHaveAttribute('aria-hidden','true');
 }
}

export async function openAccount(page:Page){
 const account=page.locator('.siii-personal-account');
 if(await account.isVisible()&&await account.getAttribute('open')===null)await account.locator('summary').click();
}
