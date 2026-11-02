import { expect, Page, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

async function readSheet(page: Page): Promise<SongSheet> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const sheet = await new Promise<SongSheet>((resolve, reject) => {
      const request = database.transaction('songSheets').objectStore('songSheets').getAll();
      request.onsuccess = () => resolve(request.result[0]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return sheet;
  });
}

for (const width of [390, 1280]) {
  test(`plays, deletes and inserts sections with a scrollable 20-part chooser at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 700 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Section controls');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Section controls', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('GuitarAppDatabase');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('songSheets', 'readwrite');
        const store = transaction.objectStore('songSheets');
        const request = store.getAll();
        request.onsuccess = () => {
          const sheet: SongSheet = request.result[0];
          sheet.tempo = 30;
          sheet.parts = Array.from({ length: 20 }, (_, index) => ({
            id: `part-${index + 1}`, section: `Part ${index + 1}`, notes: '',
            measures: [{ id: `measure-${index + 1}`, measure: {
              timeSignature: '4/4',
              actions: [{ technique: 'strum', strum: { direction: 'D', strings: 'all' } }, ...Array(15).fill(null)],
              actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
            } }]
          }));
          sheet.arrangement = [1, 2, 3].map(index => ({ id: `occ-${index}`, partId: `part-${index}`, lyrics: `Words ${index}` }));
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await page.getByRole('link', { name: 'Section controls', exact: true }).click();
    const song = page.locator('app-song-arrangement');
    const editor = page.locator('app-song-part-editor');
    const choice = page.locator('app-song-sheet-choice-modal');
    const titles = song.locator('.occurrence-title strong');
    await expect(titles).toHaveText(['Part 1', 'Part 2', 'Part 3']);
    await expect(song.getByRole('button', { name: /^Options for/ })).toHaveCount(0);
    await expect(song.getByRole('button', { name: 'Add section', exact: true })).toHaveCount(0);

    await song.getByRole('button', { name: 'Play Part 2, occurrence 1', exact: true }).click();
    await expect(song.getByRole('button', { name: 'Pause Part 2, occurrence 1', exact: true })).toBeVisible();
    await expect(editor).toHaveCount(0);
    await song.getByRole('button', { name: 'Pause Part 2, occurrence 1', exact: true }).click();
    await song.getByRole('button', { name: 'Resume Part 2, occurrence 1', exact: true }).click();
    await expect(song.getByRole('button', { name: 'Pause Part 2, occurrence 1', exact: true })).toBeVisible();
    await song.getByRole('button', { name: 'Play song', exact: true }).click();
    await song.getByRole('button', { name: 'Stop song', exact: true }).click();

    const firstAdd = song.getByRole('button', { name: 'Add before first section', exact: true });
    await firstAdd.scrollIntoViewIfNeeded();
    const firstRow = (await song.locator('.occurrence-row').first().boundingBox())!;
    const addBox = (await firstAdd.boundingBox())!;
    expect(Math.abs(addBox.x + addBox.width / 2 - firstRow.x - firstRow.width / 2)).toBeLessThan(2);
    expect(addBox.y).toBeLessThan(firstRow.y);
    expect(addBox.y + addBox.height).toBeGreaterThan(firstRow.y);
    await page.screenshot({ path: testInfo.outputPath(`section-controls-${width}.png`), fullPage: true });
    await firstAdd.click();
    await expect(choice.getByRole('button')).toHaveCount(21);
    await expect(choice.getByRole('button').first()).toHaveText('New part');
    const body = choice.locator('.modal-body');
    expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const bounds = (await choice.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const pageScroll = await page.evaluate(() => scrollY);
    await body.hover();
    await page.mouse.wheel(0, 2000);
    const lastChoice = choice.getByRole('button', { name: 'Use Part 20 · 1 measures', exact: true });
    await expect(lastChoice).toBeInViewport({ ratio: 1 });
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
    await page.screenshot({ path: testInfo.outputPath(`part-chooser-scrolled-${width}.png`), fullPage: true });
    await lastChoice.click();
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await expect(titles).toHaveText(['Part 20', 'Part 1', 'Part 2', 'Part 3']);

    await song.getByRole('button', { name: 'Add after section 2', exact: true }).click();
    await choice.getByRole('button', { name: 'New part', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Part name', exact: true }).fill('Bridge');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(async () => (await readSheet(page)).parts.at(-1)?.section).toBe('Bridge');
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await expect(titles).toHaveText(['Part 20', 'Part 1', 'Bridge', 'Part 2', 'Part 3']);
    await expect(song.getByRole('button', { name: 'Play Bridge, occurrence 1', exact: true })).toBeDisabled();

    await song.getByRole('button', { name: 'Add after section 5', exact: true }).click();
    await choice.getByRole('button', { name: 'Use Part 1 · 1 measures', exact: true }).click();
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await expect(titles).toHaveText(['Part 20', 'Part 1', 'Bridge', 'Part 2', 'Part 3', 'Part 1']);
    await page.reload();
    await expect(titles).toHaveText(['Part 20', 'Part 1', 'Bridge', 'Part 2', 'Part 3', 'Part 1']);
    await expect(song.locator('.occurrence-add-button')).toHaveCount(7);

    const remove = song.getByRole('button', { name: 'Delete Part 1, occurrence 2', exact: true });
    await remove.click();
    const confirmation = page.locator('app-confirm-dialog');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(titles).toHaveCount(6);
    await remove.click();
    await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(titles).toHaveText(['Part 20', 'Part 1', 'Bridge', 'Part 2', 'Part 3']);
    expect((await readSheet(page)).parts).toHaveLength(21);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
