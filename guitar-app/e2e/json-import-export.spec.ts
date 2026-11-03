import { expect, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { PracticeData } from '../src/app/core/services/data-transfer-format';
import type { DataTransferService } from '../src/app/core/services/data-transfer.service';
import { richPattern, richSheet, transferEnvelope } from '../test/fixtures/data-transfer';

const settings = '/maintenance/settings';
async function readData(page: Page): Promise<PracticeData> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['songSheets', 'playingPatterns']);
    const read = <T,>(table: string) => new Promise<T[]>((resolve, reject) => {
      const request = tx.objectStore(table).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const songSheets = read<PracticeData['songSheets'][number]>('songSheets');
    const playingPatterns = read<PracticeData['playingPatterns'][number]>('playingPatterns');
    const result = { songSheets: await songSheets, playingPatterns: await playingPatterns };
    db.close(); return result;
  });
}
async function seed(page: Page, data: PracticeData): Promise<void> {
  await expect(page.locator('app-json-import')).toBeVisible();
  await page.evaluate(async () => {
    // Dexie opens lazily; establish the app schema before native IndexedDB fixture writes.
    const ng = (window as unknown as { ng: { getComponent(el: Element): { transfer: { db: { open(): Promise<unknown> } } } } }).ng;
    await ng.getComponent(document.querySelector('app-json-import')!).transfer.db.open();
  });
  await page.evaluate(async data => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['songSheets', 'playingPatterns', 'metadata'], 'readwrite');
      tx.objectStore('songSheets').clear(); tx.objectStore('playingPatterns').clear();
      data.songSheets.forEach(s => tx.objectStore('songSheets').put(s));
      data.playingPatterns.forEach(p => tx.objectStore('playingPatterns').put(p));
      tx.objectStore('metadata').put({ key: 'patternsInitialized', value: true });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  }, data);
}
async function upload(page: Page, format: 'guitar-song-sheet' | 'guitar-playing-pattern' | 'guitar-backup', data: unknown, filename = 'shared.json'): Promise<void> {
  await page.locator('app-json-import input[type=file]').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(transferEnvelope(format, data))) });
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toBeVisible();
}
async function downloadJSON(page: Page, click: () => Promise<void>) {
  const waiting = page.waitForEvent('download'); await click(); const download = await waiting;
  const stream = await download.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return { filename: download.suggestedFilename(), json: JSON.parse(Buffer.concat(chunks).toString()) };
}
async function replace(page: Page, data: PracticeData): Promise<void> {
  await upload(page, 'guitar-backup', data);
  await page.getByRole('radio', { name: 'Replace everything', exact: true }).check();
  const apply = page.getByRole('button', { name: 'Replace all practice content', exact: true });
  await expect(apply).toBeDisabled();
  await page.getByRole('checkbox', { name: /I confirm replacing/ }).check();
  await apply.click();
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toHaveCount(0);
  await expect(page.locator('app-settings h2')).toContainText('Settings');
}

test('exports exact stored payloads, creates independent sheet/pattern copies and opens embedded music', async ({ page, browser }) => {
  const sheet = { ...richSheet(), extra: { preserved: ['yes'] } }, pattern = richPattern('global', 'Global');
  await page.goto(settings); await expect(page.getByText('No backup yet', { exact: true })).toBeVisible();
  await seed(page, { songSheets: [sheet], playingPatterns: [pattern] });
  const before = await readData(page);
  const backup = await downloadJSON(page, () => page.getByRole('button', { name: 'Download backup', exact: true }).click());
  expect(backup.filename).toMatch(/^guitar-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(backup.json.data).toEqual(before);
  await expect(page.getByText(/Last backup download initiated:/)).toBeVisible();
  const other = await browser.newPage();
  try {
    await other.goto(page.url());
    await replace(other, backup.json.data);
    const restored = await downloadJSON(other, () => other.getByRole('button', { name: 'Download backup', exact: true }).click());
    expect(restored.json.data).toEqual(before);
  } finally { await other.close(); }
  await page.goto('/sheets');
  const exported = await downloadJSON(page, () => page.getByRole('button', { name: 'Export JSON', exact: true }).click());
  expect(exported.filename).toBe('guitar-song-sheet-my-song.json'); expect(exported.json.data).toEqual(sheet);
  expect(await readData(page)).toEqual(before);
  for (const name of ['My song (Imported)', 'My song (Imported 2)']) {
    await upload(page, 'guitar-song-sheet', sheet);
    await expect(page.getByRole('region', { name: 'JSON import preview' })).toContainText(name);
    await page.getByRole('button', { name: 'Import copy', exact: true }).click();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
  const copies = (await readData(page)).songSheets.filter(s => s.id !== sheet.id);
  expect(copies).toHaveLength(2); expect(copies[0].id).not.toBe(copies[1].id);
  copies.forEach(copy => {
    expect(copy.arrangement).toEqual(sheet.arrangement); expect(copy.parts).toEqual(sheet.parts); expect(copy.patterns).toEqual(sheet.patterns);
  });
  await page.getByRole('link', { name: 'My song (Imported)', exact: true }).click();
  await expect(page.locator('app-song-arrangement .occurrence-row')).toHaveCount(2);
  await expect(page.locator('app-song-arrangement')).toContainText('Morning words');
  await page.getByRole('tab', { name: /^Patterns/ }).click();
  const localPattern = await downloadJSON(page, () => page.locator('app-song-sheet-patterns-tab').getByRole('button', { name: 'Export JSON', exact: true }).click());
  expect(localPattern.json.data).toEqual(sheet.patterns[0]);
  await page.goto('/patterns');
  await upload(page, 'guitar-playing-pattern', localPattern.json.data);
  await page.getByRole('button', { name: 'Import copy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fingerpicking', exact: true })).toBeVisible();
  const saved = (await readData(page)).playingPatterns.find(p => p.name === 'Fingerpicking')!;
  expect(saved.isCustom).toBe(true); expect(saved.id).not.toBe(sheet.patterns[0].id);
  expect(saved.measures).toEqual(sheet.patterns[0].measures);
});

test('merges with file winning, replaces exactly and preserves deleted defaults across reload', async ({ page }) => {
  await page.goto(settings);
  const local: PracticeData = { songSheets: [richSheet('A', 'Same'), { ...richSheet('B', 'Same'), updated: 9999 }], playingPatterns: [richPattern('A'), { ...richPattern('B'), updatedAt: 9999 }] };
  const file: PracticeData = { songSheets: [richSheet('B', 'File B'), richSheet('C', 'Same')], playingPatterns: [richPattern('B'), richPattern('C')] };
  await seed(page, local);
  await upload(page, 'guitar-backup', file);
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toContainText('even when older');
  await expect(page.getByRole('row', { name: 'Song sheets 2 2 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Merge backup', exact: true }).click();
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toHaveCount(0);
  expect(await readData(page)).toEqual({ songSheets: [local.songSheets[0], ...file.songSheets], playingPatterns: [local.playingPatterns[0], ...file.playingPatterns] });
  await upload(page, 'guitar-backup', { songSheets: [], playingPatterns: [] });
  await page.getByRole('button', { name: 'Merge backup', exact: true }).click();
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toHaveCount(0);
  expect((await readData(page)).songSheets).toHaveLength(3);
  await replace(page, file);
  expect(await readData(page)).toEqual(file);
  const downloaded = await downloadJSON(page, () => page.getByRole('button', { name: 'Download backup', exact: true }).click());
  expect(downloaded.json.data).toEqual(file);
  await page.goto('/patterns');
  await expect(page.locator('app-patterns-library .card')).toHaveCount(2);
  expect((await readData(page)).playingPatterns).toEqual(file.playingPatterns);
  await page.goto(settings);
  await replace(page, { songSheets: [], playingPatterns: [] });
  await page.goto('/patterns');
  await expect(page.getByRole('button', { name: /New Playing Pattern/ }).first()).toBeVisible();
  expect((await readData(page)).playingPatterns).toEqual([]);
  await page.reload(); expect((await readData(page)).playingPatterns).toEqual([]);
  await page.getByRole('button', { name: 'Pattern library actions', exact: true }).click();
  await page.getByRole('button', { name: /Restore default patterns/ }).click();
  await expect(page.getByText('Restored 16 default patterns.', { exact: true })).toBeVisible();
  expect((await readData(page)).playingPatterns).toHaveLength(16);
});

test('rolls back the real Dexie transaction after a write failure and retries the retained file', async ({ page }) => {
  await page.goto(settings);
  const local = { songSheets: [richSheet('A')], playingPatterns: [richPattern('A')] };
  const file = { songSheets: [richSheet('B')], playingPatterns: [richPattern('B')] };
  await seed(page, local); await upload(page, 'guitar-backup', file);
  await page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(el: Element): { transfer: DataTransferService } } }).ng;
    // Inject a quota-like failure into the real table after the sheet clear and write have run.
    const transfer = ng.getComponent(document.querySelector('app-settings')!).transfer;
    const db = (transfer as unknown as { db: { playingPatterns: { bulkPut: (...args: unknown[]) => Promise<unknown> } } }).db;
    const original = db.playingPatterns.bulkPut.bind(db.playingPatterns);
    db.playingPatterns.bulkPut = async (...args) => {
      db.playingPatterns.bulkPut = original;
      throw new DOMException('Simulated quota failure after sheet writes', 'QuotaExceededError');
    };
  });
  await page.getByRole('radio', { name: 'Replace everything', exact: true }).check();
  await page.getByRole('checkbox', { name: /I confirm replacing/ }).check();
  await page.getByRole('button', { name: 'Replace all practice content', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Simulated quota failure');
  expect(await readData(page)).toEqual(local);
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace all practice content', exact: true }).click();
  await expect(page.getByRole('region', { name: 'JSON import preview' })).toHaveCount(0);
  expect(await readData(page)).toEqual(file);
});

test('new installs seed defaults once; backup reads themselves never seed them', async ({ page }) => {
  await page.goto(settings);
  const backup = await downloadJSON(page, () => page.getByRole('button', { name: 'Download backup', exact: true }).click());
  expect(backup.json.data).toEqual({ songSheets: [], playingPatterns: [] });
  await page.goto('/patterns');
  await expect(page.getByRole('heading', { name: 'Steady Downstrokes (4/4)', exact: true })).toBeVisible();
  expect((await readData(page)).playingPatterns).toHaveLength(16);
  await seed(page, { songSheets: [], playingPatterns: [] });
  await page.reload(); expect((await readData(page)).playingPatterns).toEqual([]);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`keyboard, cancellation, validation and reachable restore controls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(settings);
    await seed(page, { songSheets: [richSheet()], playingPatterns: [richPattern()] });
    await upload(page, 'guitar-backup', { songSheets: [], playingPatterns: [] });
    await page.getByRole('button', { name: 'Cancel import', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Restore backup JSON', { exact: true })).toBeFocused();
    expect((await readData(page)).songSheets).toHaveLength(1);
    await page.locator('app-json-import input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await expect(page.getByRole('alert')).toContainText('not readable JSON');
    await upload(page, 'guitar-backup', { songSheets: [], playingPatterns: [] });
    await page.getByRole('radio', { name: 'Replace everything', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Replace all practice content', exact: true })).toBeDisabled();
    await expect(page.getByText(/This empty backup will delete all practice content/)).toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm replacing/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Replace all practice content', exact: true })).toBeEnabled();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel import', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Replace all practice content', exact: true })).toBeFocused();
    const box = await page.getByRole('button', { name: 'Replace all practice content', exact: true }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await mkdir('../temp/ux/json-import-export', { recursive: true });
    await page.screenshot({ path: `../temp/ux/json-import-export/restore-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await page.goto('/sheets');
    await upload(page, 'guitar-song-sheet', richSheet());
    await page.screenshot({ path: `../temp/ux/json-import-export/sheet-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await page.locator('app-json-import input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(transferEnvelope('guitar-backup', { songSheets: [], playingPatterns: [] }))) });
    await expect(page.getByRole('alert')).toContainText('Settings');
    await page.goto('/patterns');
    await expect(page.getByLabel('Import playing pattern JSON', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON', exact: true })).toBeVisible();
    await page.screenshot({ path: `../temp/ux/json-import-export/patterns-${viewport.width}.png`, fullPage: true });
    await page.goto('/sheets/sheet');
    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await expect(page.locator('app-song-sheet-patterns-tab').getByRole('button', { name: 'Export JSON', exact: true })).toBeVisible();
    await page.screenshot({ path: `../temp/ux/json-import-export/sheet-patterns-${viewport.width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
