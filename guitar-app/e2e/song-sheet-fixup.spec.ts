import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

async function seed(page: Page) {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Fixup fixture');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Fixup fixture', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result);
    });
    const sheet = await new Promise<SongSheet>(resolve => {
      const request = database.transaction('songSheets').objectStore('songSheets').getAll();
      request.onsuccess = () => resolve(request.result[0]);
    });
    sheet.parts = [{ id: 'verse', section: 'Verse', notes: 'Keep these notes', measures: Array.from({ length: 18 }, (_, index) => ({
      id: `measure-${index}`, measure: {
        timeSignature: '4/4', actions: [{ technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 2 }] }, ...Array(15).fill(null)],
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|o|2|2|o|o', name: 'Chord enumeration sentinel' }]
      }
    })) }];
    sheet.arrangement = [{ id: 'v1', partId: 'verse', lyrics: 'Keep these lyrics' }];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('songSheets', 'readwrite'); transaction.objectStore('songSheets').put(sheet);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole('link', { name: 'Fixup fixture', exact: true }).click();
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`compact lists and reachable part editor header at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await seed(page);
    const song = page.locator('app-song-arrangement');
    await expect(song.locator('.occurrence-summary')).toHaveText('18 measures');
    await expect(song.locator('.song-outline')).not.toContainText('Chord enumeration sentinel');
    await song.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.locator('.measure-row').last().scrollIntoViewIfNeeded();
    const header = editor.locator('.part-editor-header');
    const tabs = page.getByRole('tablist', { name: 'Song sheet sections' });
    const headerBox = (await header.boundingBox())!;
    const tabBox = (await tabs.boundingBox())!;
    expect(Math.abs(headerBox.y - tabBox.y - tabBox.height)).toBeLessThan(2);
    for (const button of [header.getByRole('button', { name: 'Play', exact: true }), header.getByRole('button', { name: 'Close song part editor' })]) {
      expect(await button.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
    await page.screenshot({ path: `../temp/ux/17-fixup/embedded-scrolled-${viewport.width}.png` });
    await header.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(header.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await header.getByRole('button', { name: 'Stop', exact: true }).click();
    const close = header.getByRole('button', { name: 'Close song part editor' });
    await close.focus(); await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    await expect(parts).toContainText('A part is a reusable section of your song.');
    await expect(parts).toContainText('Keep these notes');
    await expect(parts.locator('app-playing-actions')).toHaveCount(0);
    await page.screenshot({ path: `../temp/ux/17-fixup/parts-${viewport.width}.png` });
    await parts.getByRole('button', { name: 'Edit', exact: true }).click();
    await header.getByRole('button', { name: 'Play', exact: true }).click({ trial: true });
    const initialY = (await header.boundingBox())!.y;
    await editor.locator('.measure-row').last().scrollIntoViewIfNeeded();
    expect((await header.boundingBox())!.y).toBe(initialY);
    await expect(header.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
    await header.getByRole('button', { name: 'Close song part editor' }).click();
    await expect(editor).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a muted preview WAV ends after its actual decay without fixed release silence', async ({ page }) => {
  await page.addInitScript(() => {
    const urls: string[] = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      if (blob instanceof Blob && blob.type === 'audio/wav') urls.push(url);
      return url;
    };
    Object.assign(window, { renderedUrls: urls });
  });
  await page.goto('/maintenance/midi-test');
  await page.getByRole('button', { name: '🔇 Muted', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { renderedUrls: string[] }).renderedUrls.length)).toBe(1);
  const metrics = await page.evaluate(async () => {
    const urls = (window as unknown as { renderedUrls: string[] }).renderedUrls;
    const context = new OfflineAudioContext(1, 1, 44100);
    const audio = await context.decodeAudioData(await (await fetch(urls[0])).arrayBuffer());
    const samples = audio.getChannelData(0);
    let last = 0, peak = 0;
    samples.forEach((sample, index) => {
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) >= 1 / 32768) last = index;
    });
    return { duration: audio.duration, trailingSilence: audio.duration - (last + 1) / audio.sampleRate, peak };
  });
  await mkdir('../temp/ux/17-fixup', { recursive: true });
  await writeFile('../temp/ux/17-fixup/wav-decay.json', JSON.stringify(metrics, null, 2));
  expect(metrics.peak).toBeGreaterThan(0.01);
  expect(metrics.trailingSilence).toBeLessThan(0.03);
  expect(metrics.duration).toBeLessThan(3);
});
