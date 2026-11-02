import { expect, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

for (const viewport of [{ width: 390, height: 568 }, { width: 390, height: 900 }, { width: 1280, height: 900 }]) {
  test(`overlays long measure lists and leaves a single measure clear at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Measure toolbar');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Measure toolbar', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('GuitarAppDatabase');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('songSheets', 'readwrite');
        const store = transaction.objectStore('songSheets');
        const request: IDBRequest<SongSheet[]> = store.getAll();
        request.onsuccess = () => {
          const sheet = request.result[0];
          sheet.parts = [1, 12].map(count => ({
            id: `part-${count}`, section: `Part ${count}`, notes: '',
            measures: Array.from({ length: count }, (_, index) => ({
              id: `measure-${count}-${index}`, measure: { timeSignature: '4/4', actions: Array(16).fill(null) }
            }))
          }));
          sheet.arrangement = sheet.parts.map(part => ({ id: `occ-${part.id}`, partId: part.id, lyrics: '' }));
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await page.getByRole('link', { name: 'Measure toolbar', exact: true }).click();
    await page.getByRole('button', { name: 'Part 12, occurrence 1', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    const rows = editor.locator('.measure-row');
    const toolbar = editor.locator('.selected-measure-toolbar');
    await rows.first().click();
    await expect(toolbar).toBeInViewport({ ratio: 1 });
    const toolbarBox = (await toolbar.boundingBox())!;
    const listBox = (await editor.locator('.measure-sequence').boundingBox())!;
    expect(toolbarBox.y).toBeGreaterThan(listBox.y);
    expect(toolbarBox.y + toolbarBox.height).toBeLessThan(listBox.y + listBox.height);

    // The toolbar stays available while the list scrolls, and the last row can
    // be scrolled above it rather than remaining hidden behind the controls.
    await rows.last().scrollIntoViewIfNeeded();
    await expect(toolbar).toBeInViewport({ ratio: 1 });
    await editor.locator('.modal-footer').scrollIntoViewIfNeeded();
    const lastRowBox = (await rows.last().boundingBox())!;
    expect((await toolbar.boundingBox())!.y).toBeGreaterThanOrEqual(lastRowBox.y + lastRowBox.height);
    await expect(rows.last()).toBeInViewport({ ratio: 1 });
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await page.getByRole('button', { name: 'Part 1, occurrence 1', exact: true }).click();
    await rows.first().click();
    await editor.locator('.modal-footer').scrollIntoViewIfNeeded();
    await expect(toolbar).toBeInViewport({ ratio: 1 });
    const rowBox = (await rows.first().boundingBox())!;
    expect((await toolbar.boundingBox())!.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
    await expect(rows.first()).toBeInViewport({ ratio: 1 });
    await toolbar.getByRole('button', { name: 'Clear measure selection', exact: true }).click();
    await expect(toolbar).toHaveCount(0);

    // The same controls also float inside the scrolling part-editor modal.
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.locator('app-song-sheet-parts-tab').getByRole('button', { name: /Edit$/ }).last().click();
    await rows.first().click();
    await expect(toolbar).toBeInViewport({ ratio: 1 });
  });
}
