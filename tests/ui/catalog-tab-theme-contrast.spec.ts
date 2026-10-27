import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
import path from 'node:path';

// Exercise the shipped cascade, including its import order, without an API or
// institutional fixture: this regression belongs to the shared visual skin.
const layout = readFileSync(path.resolve('src/app/layout.tsx'), 'utf8');
const styles = [...layout.matchAll(/import '\.\/([^']+\.css)'/g)]
  .map(([, name]) => readFileSync(path.resolve('src/app', name), 'utf8')).join('\n');

function luminance(color: string) {
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

for (const width of [1440, 390]) {
  for (const initialTheme of ['light', 'dark'] as const) {
    test(`active catalog tab preserves AA contrast throughout ${initialTheme} theme flip at ${width}px`, async ({page}) => {
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.setViewportSize({width, height: 844});
      await page.setContent(`<html lang="es-MX" data-sii-theme="${initialTheme}"><head><style>${styles}</style></head><body>
        <main class="sii-app" id="main-content"><div class="sii-catalog-tabs" role="tablist" aria-label="Personas académicas">
          <button type="button" role="tab" aria-selected="true" class="sii-catalog-tab sii-catalog-tab--active">Estudiantes</button>
        </div></main></body></html>`);
      const samples = await page.getByRole('tab', {name: 'Estudiantes'}).evaluate(async element => {
        const read = () => {
          const style = getComputedStyle(element);
          return {foreground: style.color, background: style.backgroundColor};
        };
        // Force the old color to be computed, then inspect the same task and
        // following frames. Waiting for the final theme would hide this bug.
        const colors = [read()];
        document.documentElement.dataset.siiTheme = document.documentElement.dataset.siiTheme === 'light' ? 'dark' : 'light';
        colors.push(read());
        for (let frame = 0; frame < 14; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          colors.push(read());
        }
        return colors;
      });
      const contrasts = samples.map(({foreground, background}) => {
        const foregroundLuminance = luminance(foreground), backgroundLuminance = luminance(background);
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      });
      expect(Math.min(...contrasts), JSON.stringify({samples, contrasts})).toBeGreaterThanOrEqual(4.5);
    });
  }
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`institutional heading retains AA contrast during entry at ${width}px in ${theme}`, async ({page}) => {
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.setViewportSize({width, height: 844});
      await page.setContent(`<html lang="es-MX" data-sii-theme="${theme}"><head><title>SIII synthetic heading contrast</title><style>${styles}</style></head><body>
        <div class="sii-app"><main class="sii-page" id="main-content"><div class="sii-page-eyebrow">CENTRO PERSONAL</div><div class="sii-page-heading sii-kit-page-heading"><div class="min-w-0">
          <h1>Cuenta y seguridad</h1><p>Gestiona tus credenciales y consulta el estado de tu cuenta.</p>
        </div></div></main></div></body></html>`);
      const frames=await page.locator('.sii-page-heading p').evaluate(element=>{
        const frames=[];
        for(let ancestor:Element|null=element;ancestor;ancestor=ancestor.parentElement){
          const animations=ancestor.getAnimations();
          for(const animation of animations){animation.pause();animation.currentTime=43;}
          if(animations.length)frames.push({opacity:getComputedStyle(ancestor).opacity,animation:getComputedStyle(ancestor).animationName});
        }
        return frames;
      });
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(frame=>frame.opacity==='1'),JSON.stringify(frames)).toBe(true);
      const audit=await new AxeBuilder({page}).include('.sii-page-heading p').withRules(['color-contrast']).analyze();
      expect(audit.violations.map(value=>({id:value.id,nodes:value.nodes.map(node=>node.target)}))).toEqual([]);
    });
    test(`institution monogram retains AA contrast during entry at ${width}px in ${theme}`, async ({page}) => {
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.setViewportSize({width, height: 844});
      await page.setContent(`<html lang="es-MX" data-sii-theme="${theme}"><head><title>SIII synthetic contrast</title><style>${styles}</style></head><body>
        <div class="sii-app"><div class="sii-main"><main class="sii-page" id="main-content"><div class="sii-content-grid"><section class="sii-panel sii-institutions-panel"><div class="sii-institution-list">
          <a class="sii-institution-item" href="/dashboard/institutions/synthetic"><span class="sii-institution-monogram">UM</span>
          <span class="sii-institution-info"><strong>Institución sintética</strong><small>UM · Estudiante</small></span></a>
        </div></section></div></main></div></div></body></html>`);
      // Freeze an actual shipped CSS entry frame, rather than waiting for its
      // final opacity and missing the failure observed by axe after real login.
      const frame = await page.locator('.sii-institution-monogram').evaluate(element => {
        const frames = [];
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          const animations = ancestor.getAnimations();
          for (const animation of animations) { animation.pause(); animation.currentTime = 43; }
          if (animations.length) {
            const style = getComputedStyle(ancestor);
            frames.push({classes: ancestor.className, opacity: style.opacity, animation: style.animationName});
          }
        }
        return frames;
      });
      expect(frame.length).toBeGreaterThan(0);
      const audit = await new AxeBuilder({page}).include('.sii-institution-monogram').withRules(['color-contrast']).analyze();
      expect(audit.violations.map(value => ({id: value.id, nodes: value.nodes.map(node => ({target: node.target, summary: node.failureSummary}))})), JSON.stringify(frame)).toEqual([]);
    });
  }
}
