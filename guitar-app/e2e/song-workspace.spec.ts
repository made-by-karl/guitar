import { cancelMeasure, cancelSongPattern } from './song-workspace-actions';
import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

async function assertWorkspaceContrast(page: Page, state: string): Promise<void> {
  const samples = await page.locator('.workspace-path button, .selection-actions button, .part-measure-editor-modal .btn-outline-primary, .pattern-content .btn-outline-primary, .pattern-actions button, .notes-actions button').evaluateAll(elements => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (channels: number[]) => channels.map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return elements.filter(element => !element.hasAttribute('disabled') && element.textContent?.trim() && element.getClientRects().length).map(element => {
      let surface: Element | null = element;
      while (surface && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(surface).backgroundColor)) surface = surface.parentElement;
      const foreground = luminance(rgb(getComputedStyle(element).color));
      const background = luminance(rgb(surface ? getComputedStyle(surface).backgroundColor : 'rgb(255, 255, 255)'));
      return { text: element.textContent!.trim(), ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
    });
  });
  expect(samples.length).toBeGreaterThan(0);
  for (const sample of samples) expect(sample.ratio, sample.text).toBeGreaterThanOrEqual(4.5);
  const evidence = '../temp/ux/song-sheet-editing-consistency';
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/workspace-contrast-${state}.json`, JSON.stringify(samples, null, 2));
}

async function seed(page: Page): Promise<void> {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Workspace');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Workspace', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('songSheets', 'readwrite'), store = tx.objectStore('songSheets'), request = store.getAll();
      request.onsuccess = () => {
        const sheet: SongSheet = request.result[0];
        sheet.parts = ['Verse', 'Chorus'].map((section, index) => ({ id: section, section, notes: '', measures: Array.from({ length: index ? 1 : 12 }, (_, m) => ({
          id: `${section}-${m}`, measure: { timeSignature: '4/4', actions: [{ technique: 'percussive', percussive: { technique: 'body-knock' } }, ...Array(15).fill(null)], actionGrips: [] }
        })) }));
        sheet.arrangement = [{ id: 'v1', partId: 'Verse', lyrics: 'First verse' }, { id: 'c1', partId: 'Chorus', lyrics: 'Chorus' }, { id: 'v2', partId: 'Verse', lyrics: 'Second verse' }];
        store.put(sheet);
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
}
async function stored(page: Page): Promise<SongSheet> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result); });
    const sheet = await new Promise<SongSheet>(resolve => { const r = db.transaction('songSheets').objectStore('songSheets').getAll(); r.onsuccess = () => resolve(r.result[0]); });
    db.close(); return sheet;
  });
}

for (const [width, height] of [[375, 667], [768, 1024], [1280, 800], [700, 800], [701, 800], [375, 400]]) {
  test(`selects then edits within one retained workspace at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seed(page);
    const song = page.locator('app-song-arrangement');
    const editor = page.locator('app-song-part-editor');
    const select = song.getByRole('button', { name: 'Verse, occurrence 2', exact: true });
    await select.focus(); await select.press('Space');
    await expect(editor).toHaveCount(0);
    const selected = song.getByRole('region', { name: 'Selected occurrence actions' });
    await expect(selected).toContainText('Occurrence 2');
    await expect(song.locator('.occurrence-actions')).toHaveCount(0);
    await song.getByRole('button', { name: 'Chorus, occurrence 1', exact: true }).press('Enter');
    await expect(selected).toContainText('Chorus');
    await selected.getByRole('button', { name: 'Clear selection' }).click();
    await expect(selected).toHaveCount(0);
    await select.click();
    await selected.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(editor.getByLabel('Part name', { exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
    await page.getByRole('button', { name: 'Edit all 2 occurrences', exact: true }).click();
    await editor.getByLabel('Part name', { exact: true }).fill('A long verse name that must fit the compact navigation path');
    await editor.locator('.measure-row').nth(2).click();
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = editor.locator('app-song-part-measure-editor-modal');
    await expect(measure).toBeVisible();
    if (width === 1280) {
      const scroller = page.locator('.app-content-container');
      const scrollTop = await scroller.evaluate(element => element.scrollTop);
      await selected.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(selected.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
      await expect(measure).toBeVisible();
      await expect(editor.locator('.workspace-path')).toContainText('Measure 3');
      await selected.getByRole('button', { name: 'Stop', exact: true }).click();
      await scroller.evaluate((element, top) => { element.scrollTop = top; }, scrollTop);
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeHidden();
    const path = editor.getByRole('navigation', { name: 'Editor navigation' });
    await expect(path).toContainText('Measure 3');
    const tabs = (await page.locator('.sheet-tab-list').boundingBox())!;
    expect((await path.boundingBox())!.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
    expect(await path.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Apply to part', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Apply to part', exact: true })).toHaveText('');
    await expect(measure.locator('.modal-footer')).toHaveCount(0);
    await assertWorkspaceContrast(page, `measure-${width}x${height}`);
    await page.screenshot({ path: `../temp/ux/song-sheet-editing-consistency/workspace-measure-${width}x${height}.png` });
    await cancelMeasure(page);
    await expect(editor.getByLabel('Part name', { exact: true })).toHaveValue('A long verse name that must fit the compact navigation path');
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    await measure.locator('select').first().selectOption('3/4');
    await path.getByRole('button', { name: /A long verse name/ }).click();
    const choice = page.locator('app-song-sheet-choice-modal');
    await choice.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(measure).toBeVisible();
    await path.getByRole('button', { name: /A long verse name/ }).click();
    await choice.getByRole('button', { name: 'Apply and continue', exact: true }).click();
    await expect(measure).toHaveCount(0);
    expect((await stored(page)).parts[0].measures[2].measure.timeSignature).toBe('4/4');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor.locator('.part-save-status')).toHaveText('All changes saved');
    expect((await stored(page)).parts[0].measures[2].measure.timeSignature).toBe('3/4');
    await editor.getByRole('button', { name: 'Back to song', exact: true }).last().click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    await parts.getByRole('button', { name: /^Select A long verse/ }).click();
    await parts.getByRole('region', { name: 'Selected part actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await editor.getByRole('button', { name: 'Notes, empty', exact: true }).click();
    await expect(editor.getByLabel('Notes', { exact: true })).toHaveJSProperty('readOnly', true);
    await editor.locator('.workspace-path').getByRole('button', { name: 'Back to part', exact: true }).click();
    await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
    await page.getByRole('button', { name: 'Edit all 2 occurrences', exact: true }).click();
    await editor.getByRole('button', { name: 'Notes, empty', exact: true }).click();
    await editor.getByLabel('Notes', { exact: true }).fill('Shared notes in the retained draft');
    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await choice.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(editor.getByLabel('Notes', { exact: true })).toHaveValue('Shared notes in the retained draft');
    await assertWorkspaceContrast(page, `notes-${width}x${height}`);
    await page.screenshot({ path: `../temp/ux/song-sheet-editing-consistency/workspace-notes-${width}x${height}.png` });
    await editor.locator('.workspace-path').getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor.locator('.part-save-status')).toHaveText('All changes saved');
    await editor.locator('.workspace-path').getByRole('button', { name: 'Back to part', exact: true }).click();
    await expect(editor.locator('.part-save-status')).toHaveText('All changes saved');
    await page.reload();
    const persisted = await stored(page);
    expect(persisted.parts[0].notes).toBe('Shared notes in the retained draft');
    expect(persisted.arrangement?.map(item => item.lyrics)).toEqual(['First verse', 'Chorus', 'Second verse']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 375, height: 400 }]) {
  test(`local pattern drafts keep their own save/cancel boundary at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await page.getByRole('button', { name: 'Add Pattern', exact: true }).click();
    await page.getByRole('button', { name: 'Create first pattern', exact: true }).click();
    const pattern = page.locator('app-song-pattern-workspace');
    await expect(pattern).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await pattern.getByRole('textbox').first().fill('Local draft');
    const path = page.locator('app-song-sheet-patterns-tab .workspace-path');
    const tabs = (await page.locator('.sheet-tab-list').boundingBox())!;
    expect((await path.boundingBox())!.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
    await expect(page.getByRole('button', { name: 'Save Pattern', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Save Pattern', exact: true })).toHaveText('');
    await expect(pattern.locator('.pattern-actions')).toHaveCount(0);
    await assertWorkspaceContrast(page, `pattern-${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: `../temp/ux/song-sheet-editing-consistency/workspace-pattern-${viewport.width}x${viewport.height}.png` });
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(pattern.getByRole('textbox').first()).toHaveValue('Local draft');
    expect((await stored(page)).patterns).toHaveLength(0);
    await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
    await expect(pattern).toHaveCount(0);
    expect((await stored(page)).patterns[0].name).toBe('Local draft');
    await page.getByRole('button', { name: 'Select pattern Local draft', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Local draft', exact: true }).click();
    await pattern.getByRole('textbox').first().fill('Canceled change');
    await cancelSongPattern(page);
    expect((await stored(page)).patterns[0].name).toBe('Local draft');
    const patternId = (await stored(page)).patterns[0].id;
    await page.getByRole('button', { name: 'Select pattern Local draft', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Local draft', exact: true }).click();
    await pattern.getByRole('textbox').first().fill('Updated local pattern');
    await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
    await expect(pattern).toHaveCount(0);
    expect((await stored(page)).patterns[0]).toMatchObject({ id: patternId, name: 'Updated local pattern' });
    expect((await stored(page)).parts[0].measures).toHaveLength(12);
    await page.getByRole('tab', { name: 'Song', exact: true }).click();
    await page.getByRole('button', { name: 'Chorus, occurrence 1', exact: true }).click();
    await page.getByRole('region', { name: 'Selected occurrence actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.getByRole('button', { name: 'Add after measure 1', exact: true }).click();
    await page.getByRole('button', { name: 'Create new pattern', exact: true }).click();
    await pattern.getByRole('textbox').first().fill('From parent draft');
    await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
    await expect(editor.locator('.measure-row')).toHaveCount(2);
    expect((await stored(page)).parts[1].measures).toHaveLength(1);
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor.locator('.part-save-status')).toHaveText('All changes saved');
    expect((await stored(page)).patterns).toHaveLength(2);
    expect((await stored(page)).parts[1].measures).toHaveLength(2);
  });

}

test('guards browser Back, nested discard and save failure while retaining retryable drafts', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Chorus, occurrence 1', exact: true }).click();
  await page.getByRole('region', { name: 'Selected occurrence actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('app-song-part-editor'), measure = page.locator('app-song-part-measure-editor-modal');
  await editor.getByLabel('Part name', { exact: true }).fill('Pending chorus');
  await editor.locator('.measure-row').click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  await measure.getByLabel('Time Signature', { exact: true }).selectOption('3/4');
  const sheetUrl = page.url();
  await page.evaluate(() => history.back());
  const choice = page.locator('app-song-sheet-choice-modal');
  await choice.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(sheetUrl);
  await expect(measure.locator('#timeSignature option:checked')).toHaveText('3/4');
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await choice.getByRole('button', { name: 'Discard measure changes', exact: true }).click();
  await choice.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(measure).toHaveCount(0);
  await expect(editor.getByLabel('Part name', { exact: true })).toHaveValue('Pending chorus');
  await expect(editor.locator('.measure-time-signature')).toHaveText('4/4');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      IDBObjectStore.prototype.put = original;
      throw new DOMException('Simulated full device storage', 'QuotaExceededError');
    };
  });
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await choice.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(editor.locator('.part-save-status')).toContainText('Could not save');
  const expectedErrors = browserErrors.get(page)!;
  expect(expectedErrors).toHaveLength(1);
  expect(expectedErrors.shift()).toMatch(/^Error updating song sheet:/);
  await expect(editor.getByLabel('Part name', { exact: true })).toHaveValue('Pending chorus');
  expect((await stored(page)).parts[1].section).toBe('Chorus');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor.locator('.part-save-status')).toHaveText('All changes saved');
  expect((await stored(page)).parts[1].section).toBe('Pending chorus');
});

test('retains selection by identity on drag and exposes Stop after clearing a preview selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page);
  const song = page.locator('app-song-arrangement');
  await song.getByRole('button', { name: 'Verse, occurrence 2', exact: true }).click();
  const handle = song.locator('.occurrence-drag').last();
  const from = (await handle.boundingBox())!, target = (await song.locator('.occurrence-row').first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(from.x + from.width / 2, target.y + target.height / 2, { steps: 15 }); await page.mouse.up();
  await expect.poll(async () => (await stored(page)).arrangement?.[0].id).toBe('v2');
  await expect(song.locator('.occurrence-row.is-selected')).toContainText('Second verse');
  await expect(page.locator('app-song-part-editor')).toHaveCount(0);
  const actions = song.getByRole('region', { name: 'Selected occurrence actions' });
  await actions.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(actions.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await actions.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(actions).toHaveCount(0);
  const preview = song.locator('.preview-transport');
  await expect(preview.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await preview.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  const parts = page.locator('app-song-sheet-parts-tab'), partActions = parts.getByRole('region', { name: 'Selected part actions' });
  await parts.getByRole('button', { name: 'Select Verse', exact: true }).click();
  await partActions.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(parts.locator('.card')).toHaveCount(3);
  await partActions.getByRole('button', { name: 'Remove part', exact: true }).click();
  const confirmation = page.locator('app-confirm-dialog');
  await expect(confirmation).toContainText('2 occurrences and lyrics');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await stored(page)).arrangement).toHaveLength(3);
  await partActions.getByRole('button', { name: 'Remove part', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(partActions).toHaveCount(0);
  expect((await stored(page)).arrangement?.map(item => item.lyrics)).toEqual(['Chorus']);
});
