import { expect, test } from '@playwright/test';
import type { SongSheet, SongSheetGrip } from '../src/app/features/sheets/services/song-sheets.model';

for (const width of [390, 1280]) {
  test(`keeps long grip names and buttons inside their cards at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Grip card layout');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Grip card layout', exact: true })).toBeVisible();
    const grips: SongSheetGrip[] = [
      { gripId: 'o|12|11|x|x|x', name: '01211xxx' },
      { gripId: 'x|3|2|o|1|o', name: 'CustomGripNameWithoutSpaces'.repeat(3).slice(0, 60) }
    ];
    await page.evaluate(async grips => {
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
          sheet.grips = grips;
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, grips);

    await page.getByRole('link', { name: 'Grip card layout', exact: true }).click();
    await page.getByRole('tab', { name: 'Grips', exact: true }).click();
    const library = page.locator('app-song-sheet-grips-tab');
    const cards = library.locator('.grip-card');
    await expect(cards).toHaveCount(grips.length);
    for (const [index, grip] of grips.entries()) {
      const card = cards.nth(index);
      const title = card.locator('.grip-title');
      await expect(title).toHaveText(grip.name);
      expect(await title.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const cardBox = (await card.boundingBox())!;
      const diagramBox = (await card.locator('svg').boundingBox())!;
      const play = card.getByRole('button', { name: `Play grip ${grip.name}`, exact: true });
      const remove = card.getByRole('button', { name: `Delete grip ${grip.name}`, exact: true });
      const playBox = (await play.boundingBox())!;
      const removeBox = (await remove.boundingBox())!;
      expect(Math.abs(playBox.y - removeBox.y)).toBeLessThan(1);
      for (const box of [playBox, removeBox]) {
        expect(box.y).toBeGreaterThanOrEqual(diagramBox.y + diagramBox.height);
        expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
      }
      await expect(card.getByTitle('Drag to reorder')).toBeVisible();
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`grip-cards-${width}.png`), fullPage: true });
    await library.getByRole('button', { name: `Delete grip ${grips[1].name}`, exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.grip-title')).toHaveText(grips[0].name);
  });
}
