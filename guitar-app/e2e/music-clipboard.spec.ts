import { expect, Page, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

async function openPart(page: Page) {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Clipboard song');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Clipboard song', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('GuitarAppDatabase'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('songSheets', 'readwrite'); const store = tx.objectStore('songSheets');
      const r: IDBRequest<SongSheet[]> = store.getAll();
      r.onsuccess = () => {
        const sheet = r.result[0];
        sheet.parts = [{ id: 'part', section: 'Verse', lyrics: '', notes: 'Do not copy notes', measures: [
          { id: 'm1', measure: { timeSignature: '4/4', actions: [{ technique: 'pick', articulation: 'palm-mute', modifiers: ['accent'], pick: [{ mode: 'relative', string: 'top', anchor: 'grip-note', fretOffset: 1 }] }, ...Array(15).fill(null)], actionGrips: [{ measureIndex: 0, actionIndex: 0, name: 'C', gripId: 'x|3|2|o|1|o' }] } },
          { id: 'm2', measure: { timeSignature: '6/8', actions: Array(12).fill(null) } },
          { id: 'm3', measure: { timeSignature: '3/4', actions: [{ technique: 'strum', strum: { direction: 'U', strings: 'treble' } }, ...Array(11).fill(null)] } }
        ] }];
        sheet.arrangement = [{ id: 'occurrence', partId: 'part', lyrics: 'Do not copy lyrics' }];
        store.put(sheet);
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.getByRole('link', { name: 'Clipboard song', exact: true }).click();
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  const overview = page.locator('app-song-sheet-parts-tab');
  await overview.locator('.part-select').first().click();
  await overview.getByRole('button', { name: /Edit$/ }).click();
  await page.getByRole('tab', { name: 'Music', exact: true }).click();
  await expect(page.locator('.measure-row')).toHaveCount(3);
}

async function navigate(page: Page, name: string) {
  const link = page.locator('nav.navbar').getByRole('link', { name: new RegExp(name + '$') });
  if (!await link.isVisible()) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('#mainNavbar')).toHaveClass(/show/);
  }
  await link.click();
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`selects nonadjacent measures and manages a shared clipboard at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await openPart(page);
    await page.getByRole('button', { name: 'Select measures', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Select measure 1', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Select measure 3', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('region', { name: 'Selected measures actions' })).toContainText('2 measures selected');
    await expect(page.getByRole('button', { name: 'Edit selected measure', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `../temp/ux/35-clipboard/selection-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Delete selected measures', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Delete measures', exact: true })).toContainText('Delete 2 selected measures?');
    await page.keyboard.press('Escape');
    await expect(page.locator('.measure-row')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Selected measures actions' })).toContainText('2 measures selected');
    await page.getByRole('button', { name: 'Copy selected measures', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Selected measures actions' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add after measure 1', exact: true }).click();
    await page.getByRole('button', { name: 'Create new pattern', exact: true }).click();
    const localPattern = page.locator('app-song-pattern-workspace');
    await localPattern.getByRole('button', { name: 'Paste measures before first…', exact: true }).click();
    await page.locator('.clipboard-choice').click();
    await expect(localPattern.locator('[data-preview-measure]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Back to part', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(localPattern).toHaveCount(0);
    await expect(page.locator('.measure-row')).toHaveCount(3);
    const insertion = page.getByRole('button', { name: 'Add after measure 1', exact: true });
    await insertion.click();
    await page.getByRole('button', { name: 'Paste measures…', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Paste measures', exact: true });
    await expect(picker).toContainText('2 measures · 4/4, 3/4');
    await expect(picker.getByRole('button', { name: 'Close clipboard' })).toBeFocused();
    await page.screenshot({ path: `../temp/ux/35-clipboard/picker-${viewport.width}.png` });
    const bounds = await picker.boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press('Shift+Tab');
    await expect(picker.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.measure-row')).toHaveCount(3);
    await expect(insertion).toBeFocused();
    await insertion.click(); await page.getByRole('button', { name: 'Paste measures…', exact: true }).click();
    await picker.locator('.clipboard-choice').click();
    await expect(page.locator('.measure-time-signature')).toHaveText(['4/4', '4/4', '3/4', '6/8', '3/4']);
    await page.getByRole('button', { name: 'Select measures', exact: true }).click();
    await page.getByRole('button', { name: 'Delete selected measures', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.measure-row')).toHaveCount(4);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await navigate(page, 'Playing Patterns');
    await page.getByRole('button', { name: 'New Playing Pattern', exact: true }).click();
    const editor = page.locator('app-playing-pattern-editor');
    await editor.getByRole('button', { name: 'Paste measures before first…', exact: true }).click();
    await picker.locator('.clipboard-choice').click();
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(3);
    await editor.getByRole('button', { name: 'Paste measures before first…', exact: true }).click();
    await picker.getByRole('button', { name: /^Remove clipboard entry/ }).click();
    await expect(picker).toContainText('No measures copied yet');
    await page.keyboard.press('Escape');
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(3);
    await expect(editor.getByRole('button', { name: 'Paste measures before first…', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`supports keyboard selection, repeated group paste, and an empty standalone pattern at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/patterns/editor');
    const editor = page.locator('app-playing-pattern-editor');
    await editor.getByRole('button', { name: 'Add technique at 1', exact: true }).click();
    await editor.locator('[data-action-index="0"]').getByRole('link', { name: /Strum Down$/ }).click();
    await editor.locator('[data-action-index="0"]').getByLabel('Accent', { exact: true }).check();
    await editor.getByRole('button', { name: 'Add after measure 1', exact: true }).click();
    await editor.getByRole('button', { name: 'Select measures', exact: true }).click();
    const first = editor.getByRole('button', { name: 'Select measure 1', exact: true });
    await expect(first).toBeFocused();
    const second = editor.getByRole('button', { name: 'Select measure 2', exact: true });
    await second.focus(); await page.keyboard.press('Space');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `../temp/ux/35-clipboard/pattern-selection-${viewport.width}.png` });
    await editor.getByRole('button', { name: 'Copy selected measures', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Select measures', exact: true })).toBeFocused();
    await editor.getByRole('button', { name: 'Paste measures after 1…', exact: true }).click();
    await page.locator('.clipboard-choice').click();
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(4);
    await editor.getByRole('button', { name: 'Select measures', exact: true }).click();
    for (const index of [2, 3, 4]) await editor.getByRole('button', { name: `Select measure ${index}`, exact: true }).click();
    await editor.getByRole('button', { name: 'Delete selected measures', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Paste measures…', exact: true }).click();
    await page.locator('.clipboard-choice').click();
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(2);
    await expect(editor.locator('[data-action-index="0"] .action-content')).toHaveCount(1);
  });
}

test('copies actions from the single-measure draft into a standalone pattern and clears history on reload', async ({ page }) => {
  await openPart(page);
  await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  await page.getByRole('button', { name: 'Copy action', exact: true }).click();
  await page.getByRole('button', { name: 'Back to part', exact: true }).click();
  await page.getByRole('button', { name: 'Copy selected measure', exact: true }).click();
  await navigate(page, 'Playing Patterns');
  await page.getByRole('button', { name: 'New Playing Pattern', exact: true }).click();
  const editor = page.locator('app-playing-pattern-editor');
  const slot = editor.locator('[data-action-index="4"]');
  await slot.getByRole('button', { name: 'Add technique at 2', exact: true }).click();
  await slot.getByRole('button', { name: 'Paste action…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Paste action', exact: true });
  await expect(picker).toContainText('palm-mute · accent');
  await expect(picker).toContainText('Grip: C');
  await expect(picker.locator('.clipboard-choice')).toHaveCount(1);
  await picker.locator('.clipboard-choice').click();
  await expect(slot.getByText('pick', { exact: true })).toBeVisible();
  await expect(slot.locator('.action-grip-button')).toContainText('C');
  await expect(slot.getByLabel('Palm Mute', { exact: true })).toBeChecked();
  await expect(slot.getByLabel('Accent', { exact: true })).toBeChecked();
  await expect(editor.locator('[data-action-index="0"] .empty-action-slot')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'New Playing Pattern', exact: true }).click();
  const empty = editor.locator('[data-action-index="0"]');
  await empty.getByRole('button', { name: 'Add technique at 1', exact: true }).click();
  await empty.getByRole('button', { name: 'Paste action…', exact: true }).click();
  await expect(picker).toContainText('No actions copied yet');
});

test('touch hold enters measure selection while a scroll gesture cancels the hold', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openPart(page);
  const row = page.locator('.measure-row').first();
  await row.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  const bounds = await row.boundingBox(); const x = bounds!.x + bounds!.width / 2; const y = bounds!.y + bounds!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(550);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('region', { name: 'Selected measures actions' })).toContainText('1 measure selected');
  const copyBounds = await page.getByRole('button', { name: 'Copy selected measures', exact: true }).boundingBox();
  expect(copyBounds!.width).toBe(44); expect(copyBounds!.height).toBe(44);
  await page.screenshot({ path: '../temp/ux/35-clipboard/touch-selection-375.png' });
  await page.getByRole('button', { name: 'Exit measure selection', exact: true }).click();
  await row.scrollIntoViewIfNeeded();
  const next = await row.boundingBox(); const startY = next!.y + next!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - i * 12 }] });
  await page.waitForTimeout(550);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('region', { name: 'Selected measures actions' })).toHaveCount(0);
  await navigate(page, 'Playing Patterns');
  await page.getByRole('button', { name: 'New Playing Pattern', exact: true }).click();
  const patternMeasure = page.locator('app-playing-pattern-editor [data-preview-measure]').first();
  await patternMeasure.locator('h5').scrollIntoViewIfNeeded();
  const patternBounds = await patternMeasure.locator('h5').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: patternBounds!.x + 10, y: patternBounds!.y + 10 }] });
  await page.waitForTimeout(550);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('region', { name: 'Selected measures actions' })).toContainText('1 measure selected');
  await context.close();
});
