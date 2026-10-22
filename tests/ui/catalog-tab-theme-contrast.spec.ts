import {test, expect} from '@playwright/test';
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
