import { expect, Locator, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

const evidence = '../temp/ux/selection-design';

async function seed(page: Page): Promise<void> {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Selection design');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Selection design', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('GuitarAppDatabase'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('songSheets', 'readwrite'), store = tx.objectStore('songSheets'), request = store.getAll();
      request.onsuccess = () => {
        const sheet: SongSheet = request.result[0];
        const measure = { timeSignature: '4/4', actions: [{ technique: 'percussive' as const, percussive: { technique: 'body-knock' as const } }, ...Array(15).fill(null)], actionGrips: [] };
        sheet.parts = ['Verse', 'Chorus'].map(section => ({ id: section, section, notes: '', measures: Array.from({ length: 12 }, (_, i) => ({ id: `${section}-${i}`, measure })) }));
        sheet.arrangement = sheet.parts.map(part => ({ id: `occ-${part.id}`, partId: part.id, lyrics: '' }));
        sheet.grips = [{ gripId: 'x|3|2|o|1|o', name: 'C' }];
        sheet.patterns = ['One', 'Two'].map(name => ({ id: name, name, description: '', category: '', suggestedGenre: '', exampleSong: '', measures: [measure], createdAt: 0, updatedAt: 0 }));
        store.put(sheet);
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.getByRole('link', { name: 'Selection design', exact: true }).click();
  await mkdir(evidence, { recursive: true });
}

async function checkActions(actions: Locator, selected: Locator): Promise<void> {
  await expect(actions).toBeVisible();
  await expect(selected).toHaveCSS('background-color', 'rgb(231, 241, 255)');
  await expect(actions).toHaveCSS('background-color', 'rgb(52, 58, 64)');
  const samples = await actions.getByRole('button').evaluateAll(buttons => {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return buttons.map(button => {
      const style = getComputedStyle(button), rect = button.getBoundingClientRect();
      const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(button.closest('.app-selection-actions')!).backgroundColor : style.backgroundColor;
      const a = luminance(style.color), b = luminance(background);
      return { label: button.getAttribute('aria-label'), text: button.textContent!.trim(), width: rect.width, height: rect.height, disabled: (button as HTMLButtonElement).disabled, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  for (const sample of samples) {
    expect(sample.label).toBeTruthy(); expect(sample.text).toBe('');
    expect(sample.width).toBe(32); expect(sample.height).toBe(32);
    if (!sample.disabled) expect(sample.ratio, sample.label!).toBeGreaterThanOrEqual(4.5);
  }
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`shared selection, icons and aligned workspaces at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page);
    const song = page.locator('app-song-arrangement');
    if (viewport.width > 700) {
      const left = (await song.locator('.occurrence-list').boundingBox())!, right = (await song.locator('.occurrence-editor-placeholder').boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    }
    await song.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).press('Enter');
    await checkActions(song.getByRole('region', { name: 'Selected occurrence actions' }), song.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/song-${viewport.width}.png` });
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    if (viewport.width > 700) {
      await expect(parts.locator('.workspace-placeholder .bi')).toBeVisible();
      const left = (await parts.locator('.card').first().boundingBox())!, right = (await parts.locator('.workspace-placeholder').boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    }
    await parts.getByRole('button', { name: 'Select Verse', exact: true }).click();
    const partActions = parts.getByRole('region', { name: 'Selected part actions' });
    await checkActions(partActions, parts.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/parts-${viewport.width}.png` });
    await partActions.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.locator('.measure-row').first().click();
    await checkActions(editor.locator('.selected-measure-toolbar'), editor.locator('.measure-row.is-selected'));
    await page.screenshot({ path: `${evidence}/measures-${viewport.width}.png` });
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    const path = editor.locator('.workspace-path'), preview = measure.locator('.editor-preview');
    for (const scroll of [0, 60, 180]) {
      await page.locator('.app-content-container').evaluate((element, amount) => { element.scrollTop += amount; }, scroll);
      const pathBox = (await path.boundingBox())!, previewBox = (await preview.boundingBox())!;
      expect(previewBox.y).toBeGreaterThanOrEqual(pathBox.y + pathBox.height - 1);
    }
    await page.locator('.app-content-container').evaluate(element => { element.scrollTop = 0; });
    await path.scrollIntoViewIfNeeded();
    for (const label of ['Collapse preview', 'Expand preview']) {
      const play = (await measure.getByRole('button', { name: 'Play measure', exact: true }).boundingBox())!;
      const toggle = measure.getByRole('button', { name: label, exact: true });
      const box = (await toggle.boundingBox())!;
      expect([play.width, play.height, box.width, box.height]).toEqual([32, 32, 32, 32]);
      await toggle.click();
    }
    await measure.locator('.modal-body').evaluate(element => { element.scrollTop = 700; });
    await page.screenshot({ path: `${evidence}/preview-${viewport.width}.png` });
    await path.getByRole('button', { name: 'Back to part', exact: true }).click();
    await editor.getByRole('button', { name: 'Back to parts', exact: true }).click();
    await page.getByRole('tab', { name: 'Grips', exact: true }).click();
    const grips = page.locator('app-song-sheet-grips-tab');
    await expect(grips.getByRole('region')).toHaveCount(0);
    await grips.getByRole('button', { name: 'Select grip C', exact: true }).press('Space');
    await checkActions(grips.getByRole('region', { name: 'Selected grip actions' }), grips.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/grips-${viewport.width}.png` });
    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    const patterns = page.locator('app-song-sheet-patterns-tab');
    await patterns.getByRole('button', { name: 'Select pattern One', exact: true }).click();
    const actions = patterns.getByRole('region', { name: 'Selected pattern actions' });
    await checkActions(actions, patterns.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/patterns-${viewport.width}.png` });
    await actions.getByRole('button', { name: 'Copy pattern', exact: true }).click();
    await expect(patterns.locator('.card')).toHaveCount(3);
    await expect(actions).toContainText('One');
    await patterns.getByRole('button', { name: 'Select pattern Two', exact: true }).press('Enter');
    await expect(actions).toContainText('Two');
    await actions.getByRole('button', { name: 'Delete pattern', exact: true }).click();
    await expect(patterns.locator('.card')).toHaveCount(2);
    await expect(actions).toHaveCount(0);
    await patterns.getByRole('button', { name: 'Select pattern One', exact: true }).click();
    await actions.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(actions).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('touch preview controls share the larger hit target', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await seed(page);
    await page.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
    const actions = page.getByRole('region', { name: 'Selected occurrence actions' });
    for (const button of await actions.getByRole('button').all()) {
      const box = (await button.boundingBox())!; expect([box.width, box.height]).toEqual([44, 44]);
    }
    await actions.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.locator('.measure-row').first().click();
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    for (const label of ['Play measure', 'Collapse preview']) {
      const box = (await measure.getByRole('button', { name: label, exact: true }).boundingBox())!;
      expect([box.width, box.height]).toEqual([44, 44]);
    }
  } finally { await context.close(); }
});
