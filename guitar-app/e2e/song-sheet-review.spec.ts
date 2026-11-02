import { expect, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

for (const width of [390, 768, 1280]) {
  test(`wraps part notation and prevents silent playback at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Review fixes');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Review fixes', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('GuitarAppDatabase');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('songSheets', 'readwrite');
        const store = transaction.objectStore('songSheets');
        const request: IDBRequest<SongSheet[]> = store.getAll();
        request.onsuccess = () => {
          const sheet = request.result[0];
          const strum = { technique: 'strum' as const, strum: { direction: 'D' as const, strings: 'all' as const } };
          sheet.parts = [{
            id: 'flow', section: 'Flow', lyrics: '', notes: '',
            measures: Array.from({ length: 4 }, (_, index) => ({
              id: `m${index}`, measure: {
                timeSignature: '4/4' as const, actions: [strum, ...Array(15).fill(null)],
                actionGrips: index === 0 ? [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }] : []
              }
            }))
          }, {
            id: 'silent', section: 'Needs grip', lyrics: '', notes: '',
            measures: [{ id: 'silent-m', measure: { timeSignature: '4/4', actions: [strum, ...Array(15).fill(null)] } }]
          }, {
            id: 'pick', section: 'Picking', lyrics: '', notes: '',
            measures: [{ id: 'pick-m', measure: { timeSignature: '4/4', actions: [
              { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 3 }] }, ...Array(15).fill(null)
            ] } }]
          }];
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await page.getByRole('link', { name: 'Review fixes', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    const flow = parts.locator('.card').filter({ has: page.getByRole('heading', { name: 'Flow', exact: true }) });
    await expect(flow.locator('.notation-scroll')).toHaveCount(1);
    await expect(flow.locator('.measure-divider')).toHaveCount(3);
    const segments = flow.locator('.action-svg');
    if (width >= 768) {
      expect((await segments.nth(4).boundingBox())!.y).toBeCloseTo((await segments.first().boundingBox())!.y, 0);
    }
    expect(await flow.locator('.notation-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(flow.getByRole('button', { name: /Play$/ })).toBeEnabled();
    const silent = parts.locator('.card').filter({ has: page.getByRole('heading', { name: 'Needs grip', exact: true }) });
    await expect(silent.getByRole('button', { name: /Play$/ })).toBeDisabled();
    await expect(silent).toContainText('Assign a grip');
    const pick = parts.locator('.card').filter({ has: page.getByRole('heading', { name: 'Picking', exact: true }) });
    await expect(pick.getByRole('button', { name: /Play$/ })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`part-flow-${width}.png`), fullPage: true });
    await silent.getByRole('button', { name: /Edit$/ }).click();
    await expect(page.locator('.part-editor-title-row').getByRole('button', { name: /Play$/ })).toBeDisabled();
    await page.getByRole('tab', { name: 'Measures', exact: true }).click();
    await page.locator('.measure-row').click();
    await expect(page.locator('.selected-measure-toolbar').getByRole('button', { name: /Play$/ })).toBeDisabled();
  });
}
