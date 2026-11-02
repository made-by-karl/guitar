import { expect, Page, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

async function readSheet(page: Page): Promise<SongSheet> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const sheet = await new Promise<SongSheet>((resolve, reject) => {
      const request = database.transaction('songSheets').objectStore('songSheets').getAll();
      request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error);
    });
    database.close(); return sheet;
  });
}

for (const width of [390, 768, 1280]) {
  test(`arranges reusable music with local lyrics, temporary locks and independent copies at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Arrangement');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Arrangement', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('songSheets', 'readwrite'), store = transaction.objectStore('songSheets');
        const request = store.getAll();
        request.onsuccess = () => {
          const sheet: SongSheet = request.result[0];
          sheet.parts = [{ id: 'verse', section: 'Verse', notes: 'Play softly', measures: [{ id: 'verse-m', measure: {
            timeSignature: '4/4', actions: [{ technique: 'strum', strum: { direction: 'D', strings: 'all' } }, ...Array(15).fill(null)],
            actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
          } }] }, { id: 'chorus', section: 'Chorus', notes: '', measures: [{ id: 'chorus-m', measure: {
            timeSignature: '4/4', actions: [{ technique: 'strum', strum: { direction: 'D', strings: 'all' } }, ...Array(15).fill(null)],
            actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: '3|2|o|o|o|3', name: 'G' }]
          } }] }];
          sheet.arrangement = [{ id: 'v1', partId: 'verse', lyrics: 'Morning words' }, { id: 'c1', partId: 'chorus', lyrics: 'Chorus words' }, { id: 'v2', partId: 'verse', lyrics: 'Evening words' }];
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
      }); database.close();
    });
    await page.getByRole('link', { name: 'Arrangement', exact: true }).click();
    const song = page.locator('app-song-arrangement'), editor = page.locator('app-song-part-editor');
    const select = async (name: string) => {
      if (width === 390 && await editor.count()) await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
      await song.getByRole('button', { name, exact: true }).click();
    };
    await expect(song.locator('.occurrence-row')).toHaveCount(3);
    await expect(song.locator('app-playing-actions')).toHaveCount(0);
    await expect(song.locator('.occurrence-number')).toHaveText(['1', '1', '2']);
    await select('Verse, occurrence 2');
    const name = editor.getByLabel('Part name', { exact: true });
    await expect(name).toBeDisabled();
    await expect(editor.getByRole('button', { name: /Make.*independent/i })).toHaveCount(0);
    if (width > 700) {
      const left = (await song.locator('.song-outline').boundingBox())!;
      const right = (await song.locator('.occurrence-editor').boundingBox())!;
      expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    }
    await page.screenshot({ path: testInfo.outputPath(`arrangement-music-${width}.png`), fullPage: true });
    await editor.getByRole('button', { name: 'Notes, contains notes', exact: true }).click();
    const notes = page.locator('app-song-part-notes-modal');
    await expect(notes.getByLabel('Notes', { exact: true })).toHaveJSProperty('readOnly', true);
    await notes.getByRole('button', { name: 'Close notes', exact: true }).click();
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Evening words changed');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(async () => (await readSheet(page)).arrangement?.[2].lyrics).toBe('Evening words changed');
    expect((await readSheet(page)).arrangement?.[0].lyrics).toBe('Morning words');
    await page.screenshot({ path: testInfo.outputPath(`arrangement-lyrics-${width}.png`), fullPage: true });
    await editor.getByRole('tab', { name: /^Music/ }).click();
    await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
    const unlock = page.locator('app-song-part-unlock-modal');
    await unlock.getByRole('button', { name: 'Edit all 2 occurrences', exact: true }).click();
    await expect(name).toBeEnabled();
    await editor.getByRole('button', { name: 'Notes, contains notes', exact: true }).click();
    await expect(notes.getByLabel('Notes', { exact: true })).toHaveValue('Play softly');
    await expect(notes.getByLabel('Notes', { exact: true })).toBeEditable();
    await notes.getByLabel('Notes', { exact: true }).fill('Cue used in both verses');
    await notes.getByRole('button', { name: 'Apply notes', exact: true }).click();
    await editor.locator('.measure-row').first().click();
    await editor.getByRole('button', { name: 'Duplicate selected measure', exact: true }).click();
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(name).toBeDisabled();
    await select('Verse, occurrence 1');
    await expect(editor.locator('.measure-row')).toHaveCount(2);
    await expect(name).toBeDisabled();
    await editor.getByRole('button', { name: 'Notes, contains notes', exact: true }).click();
    await expect(notes.getByLabel('Notes', { exact: true })).toHaveValue('Cue used in both verses');
    await notes.getByRole('button', { name: 'Close notes', exact: true }).click();
    await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
    await unlock.getByRole('button', { name: 'Edit all 2 occurrences', exact: true }).click();
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Morning words');
    await editor.getByRole('tab', { name: /^Music/ }).click();
    await expect(name).toBeEnabled();
    await select('Verse, occurrence 2');
    await expect(name).toBeDisabled();
    await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
    await unlock.getByRole('button', { name: 'Make this occurrence independent', exact: true }).click();
    await name.fill('Verse 2');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(async () => (await readSheet(page)).parts.length).toBe(3);
    await expect(editor.locator('.modal-title .occurrence-number')).toHaveText('1');
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Evening words changed');
    await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Unsaved words');
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const choice = page.locator('app-song-sheet-choice-modal');
    await choice.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Unsaved words');
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await choice.getByRole('button', { name: 'Save and continue', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect((await readSheet(page)).arrangement?.[2].lyrics).toBe('Unsaved words');
    await song.getByRole('button', { name: 'Options for Verse 2, occurrence 1', exact: true }).click();
    await song.getByRole('button', { name: 'Move earlier', exact: true }).click();
    await expect.poll(async () => (await readSheet(page)).arrangement?.[1].id).toBe('v2');
    await song.getByRole('button', { name: 'Options for Verse, occurrence 1', exact: true }).click();
    await song.getByRole('button', { name: 'Repeat music', exact: true }).click();
    await expect(song.locator('.occurrence-row')).toHaveCount(4);
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('');
    expect((await readSheet(page)).parts).toHaveLength(3);
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await song.getByRole('button', { name: 'Play song', exact: true }).click();
    await expect(song.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
    await song.getByRole('button', { name: 'Stop song', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('starts in an empty part and offers every source for its first measure', async ({ page }) => {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Write now');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: 'Write now', exact: true }).click();
  await page.getByRole('button', { name: 'Start writing', exact: true }).click();
  const measure = page.locator('app-song-part-measure-editor-modal');
  const editor = page.locator('app-song-part-editor');
  await expect(editor).toBeVisible();
  await expect(measure).toHaveCount(0);
  const stored = await readSheet(page);
  expect(stored.parts).toHaveLength(1);
  expect(stored.parts[0].section).toBe('Untitled part');
  expect(stored.parts[0].measures).toHaveLength(0);
  expect(stored.arrangement).toHaveLength(1);
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  const choices = page.locator('app-song-sheet-choice-modal');
  await expect(choices.getByRole('button')).toHaveText(['New measure', 'Import pattern from library', 'Create new pattern']);
  await choices.getByRole('button', { name: 'Import pattern from library', exact: true }).click();
  const library = page.locator('app-pattern-library-selector-modal');
  await expect(library).toBeVisible();
  await library.getByRole('checkbox', { name: /^Select pattern / }).first().click();
  await library.getByRole('button', { name: /Apply Patterns$/ }).click();
  await expect(library).toHaveCount(0);
  await expect(editor.locator('.measure-row').first()).toBeVisible();
  await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Lyrics can come first');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await readSheet(page)).arrangement?.[0].lyrics).toBe('Lyrics can come first');
  expect((await readSheet(page)).patterns).toHaveLength(1);
  expect((await readSheet(page)).parts[0].measures.length).toBeGreaterThan(0);
});

test('upgrades a persisted version-seven sheet without losing music, order, lyrics or notes', async ({ page }) => {
  // An image document gives us the app origin without starting Angular/Dexie yet.
  await page.goto('/icons/icon-96x96.png');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase', 70);
      request.onupgradeneeded = () => {
        const sheets = request.result.createObjectStore('songSheets', { keyPath: 'id' });
        sheets.createIndex('created', 'created'); sheets.createIndex('updated', 'updated');
        const patterns = request.result.createObjectStore('playingPatterns', { keyPath: 'id' });
        patterns.createIndex('category', 'category'); patterns.createIndex('isCustom', 'isCustom');
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('songSheets', 'readwrite');
      transaction.objectStore('songSheets').put({ id: 'old-sheet', name: 'Old song', tuning: [], capodaster: 0, tempo: 90, links: [], grips: [], patterns: [], created: 1, updated: 1,
        parts: [{ id: 'old-verse', section: 'Verse', lyrics: 'Words worth keeping', notes: 'Softly', measures: [{ id: 'old-measure', measure: { timeSignature: '4/4', actions: [null, null, null, null] } }] },
          { id: 'old-chorus', section: 'Chorus', lyrics: 'Refrain', notes: '', measures: [] }]
      });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    }); database.close();
  });
  await page.goto('/sheets/old-sheet');
  await expect(page.locator('app-song-arrangement .occurrence-title strong')).toHaveText(['Verse', 'Chorus']);
  const migrated = await readSheet(page);
  expect(migrated.arrangement?.map(item => [item.partId, item.lyrics])).toEqual([['old-verse', 'Words worth keeping'], ['old-chorus', 'Refrain']]);
  expect(migrated.parts[0]).not.toHaveProperty('lyrics');
  expect(migrated.parts[0].notes).toBe('Softly');
  expect(migrated.parts[0].measures[0].id).toBe('old-measure');
  const identities = migrated.arrangement?.map(item => item.id);
  await page.reload();
  await expect(page.locator('app-song-arrangement .occurrence-row')).toHaveCount(2);
  expect((await readSheet(page)).arrangement?.map(item => item.id)).toEqual(identities);
});
