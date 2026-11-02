import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`inserts measures and patterns at the chosen boundary at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Insertion test');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Insertion test', exact: true })).toBeVisible();

    // Seed a part with different time signatures so insertion order is observable.
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
          const sheet = request.result[0];
          sheet.parts = [{
            id: 'part-test', section: 'Verse', lyrics: '', notes: '',
            measures: [
              { id: 'measure-1', measure: { timeSignature: '3/4', actions: Array(12).fill(null) } },
              { id: 'measure-2', measure: { timeSignature: '4/4', actions: Array(16).fill(null) } }
            ]
          }];
          sheet.patterns = [{
            id: 'pattern-test', name: 'Waltz pattern', description: '', category: '',
            suggestedGenre: '', exampleSong: '', createdAt: 0, updatedAt: 0,
            measures: [{ timeSignature: '6/8', actions: Array(12).fill(null) }]
          }];
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    await page.getByRole('link', { name: 'Insertion test', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.getByRole('button', { name: /\bEdit$/ }).click();
    const editor = page.locator('app-song-part-editor');
    const title = editor.getByRole('heading', { name: 'Edit Song Part' });
    const play = editor.locator('.part-editor-title-row').getByRole('button', { name: /\bPlay$/ });
    const close = editor.getByRole('button', { name: 'Close song part editor' });
    const titleBox = (await title.boundingBox())!;
    for (const button of [play, close]) {
      const box = (await button.boundingBox())!;
      expect(Math.abs((box.y + box.height / 2) - (titleBox.y + titleBox.height / 2))).toBeLessThan(2);
      expect(box.x).toBeGreaterThan(titleBox.x + titleBox.width);
    }
    await expect(editor).not.toContainText('Build the part measure by measure');

    const tabBar = editor.getByRole('tablist', { name: 'Song part sections' });
    await expect(tabBar.getByRole('tab')).toHaveText(['Music']);
    await expect(editor.getByRole('tab', { name: 'Music', exact: true })).toHaveAttribute('aria-selected', 'true');
    const editorBox = (await editor.boundingBox())!;
    const tabBarBox = (await tabBar.boundingBox())!;
    expect(Math.abs(tabBarBox.x - editorBox.x)).toBeLessThan(2);
    expect(Math.abs(tabBarBox.width - editorBox.width)).toBeLessThan(2);
    expect(await tabBar.evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px');
    await editor.getByRole('textbox', { name: 'Part name', exact: true }).fill('Bridge');
    await editor.getByRole('button', { name: 'Notes, empty', exact: true }).click();
    const notesDialog = page.locator('app-song-part-notes-modal');
    await notesDialog.getByRole('textbox', { name: 'Notes', exact: true }).fill('Play softly');
    await notesDialog.getByRole('button', { name: 'Apply notes', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`song-part-details-${width}.png`), fullPage: true });
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    await expect(editor.getByRole('textbox')).toHaveCount(1);

    const rows = editor.locator('.measure-row');
    const toolbar = editor.locator('.selected-measure-toolbar');
    await expect(editor.locator('.measure-row.is-selected')).toHaveCount(0);
    await expect(toolbar).toHaveCount(0);
    await rows.first().click();
    await expect(toolbar).toBeVisible();
    await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
    await rows.first().click();
    await expect(toolbar).toHaveCount(0);
    await rows.first().press('Enter');
    await expect(toolbar).toBeVisible();
    await rows.first().press('Space');
    await expect(toolbar).toHaveCount(0);
    await rows.last().click();
    await expect(toolbar).toContainText('Measure 2');
    await editor.getByRole('button', { name: 'Clear measure selection', exact: true }).click();
    await expect(toolbar).toHaveCount(0);
    await expect(editor.locator('.measure-row.is-selected')).toHaveCount(0);

    const firstAdd = editor.getByRole('button', { name: 'Add before first measure', exact: true });
    await firstAdd.scrollIntoViewIfNeeded();
    const firstRowBox = (await editor.locator('.measure-row').first().boundingBox())!;
    const firstAddBox = (await firstAdd.boundingBox())!;
    expect(Math.abs((firstAddBox.x + firstAddBox.width / 2) - (firstRowBox.x + firstRowBox.width / 2))).toBeLessThan(2);
    expect(firstAddBox.y).toBeLessThan(firstRowBox.y);
    expect(firstAddBox.y + firstAddBox.height).toBeGreaterThan(firstRowBox.y);

    const add = editor.getByRole('button', { name: 'Add after measure 1', exact: true });
    await add.scrollIntoViewIfNeeded();
    const rowBox = (await editor.locator('.measure-row').first().boundingBox())!;
    const addBox = (await add.boundingBox())!;
    expect(Math.abs((addBox.x + addBox.width / 2) - (rowBox.x + rowBox.width / 2))).toBeLessThan(2);
    expect(addBox.y).toBeLessThan(rowBox.y + rowBox.height);
    expect(addBox.y + addBox.height).toBeGreaterThan(rowBox.y + rowBox.height);
    await page.screenshot({ path: testInfo.outputPath(`song-part-editor-${width}.png`), fullPage: true });

    const choice = page.locator('app-song-sheet-choice-modal');
    await firstAdd.click();
    await choice.getByRole('button', { name: 'New measure', exact: true }).click();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['4/4', '3/4', '4/4']);
    await expect(editor.locator('.measure-row.is-selected')).toHaveAttribute('aria-label', 'Select measure 1');
    await editor.getByRole('button', { name: 'Remove selected measure', exact: true }).click();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['3/4', '4/4']);

    await add.click();
    await expect(choice.getByRole('button')).toHaveCount(4);
    await choice.getByRole('button', { name: 'New measure', exact: true }).click();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['3/4', '3/4', '4/4']);
    await expect(editor.locator('.measure-row.is-selected')).toHaveAttribute('aria-label', 'Select measure 2');

    await editor.getByRole('button', { name: 'Add after measure 1', exact: true }).click();
    await choice.getByRole('button', { name: 'Use existing sheet pattern', exact: true }).click();
    await choice.getByRole('button', { name: 'Waltz pattern', exact: true }).click();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['3/4', '6/8', '3/4', '4/4']);

    // The final boundary remains reachable and appends after the final measure.
    await editor.getByRole('button', { name: 'Add after measure 4', exact: true }).click();
    await choice.getByRole('button', { name: 'New measure', exact: true }).click();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['3/4', '6/8', '3/4', '4/4', '4/4']);
    const handle = editor.locator('.measure-entry .drag-handle').first();
    await handle.scrollIntoViewIfNeeded();
    const handleBox = (await handle.boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 10, { steps: 5 });
    await expect(editor.locator('.measure-add-button')).toHaveCount(0);
    const sequenceBox = (await editor.locator('.measure-sequence').boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, sequenceBox.y + sequenceBox.height - 2, { steps: 15 });
    await page.mouse.up();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['6/8', '3/4', '4/4', '4/4', '3/4']);
    await expect(editor.locator('.measure-add-button')).toHaveCount(6);

    await editor.getByRole('button', { name: 'Clear measure selection', exact: true }).click();
    await expect(toolbar).toHaveCount(0);
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    await expect(editor.locator('.measure-row.is-selected')).toHaveCount(0);
    await expect(toolbar).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`song-part-no-selection-${width}.png`), fullPage: true });

    await editor.getByRole('button', { name: 'Save and close' }).click();
    await expect(editor).toHaveCount(0);
    await page.reload();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.getByRole('button', { name: /\bEdit$/ }).click();
    await expect(editor.getByRole('textbox', { name: 'Part name', exact: true })).toHaveValue('Bridge');
    await editor.getByRole('button', { name: 'Notes, contains notes', exact: true }).click();
    await expect(notesDialog.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Play softly');
    await notesDialog.getByRole('button', { name: 'Close notes', exact: true }).click();
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    await editor.getByRole('tab', { name: 'Music', exact: true }).press('ArrowRight');
    await expect(editor.getByRole('tab', { name: 'Music', exact: true })).toBeFocused();
    await expect(editor.locator('.measure-time-signature')).toHaveText(['6/8', '3/4', '4/4', '4/4', '3/4']);
    await expect(toolbar).toHaveCount(0);
  });
}
