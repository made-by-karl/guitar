import { expect, Locator, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

declare global { interface Window { partAudio: HTMLAudioElement[]; blockPartAudio: boolean; } }
const evidence = '../temp/ux/song-sheet-editing-consistency';

async function seed(page: Page) {
  await page.addInitScript(() => {
    window.partAudio = []; window.blockPartAudio = false;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (window.blockPartAudio) return Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
      return play.call(this);
    };
    window.Audio = new Proxy(window.Audio, { construct(Target, args) {
      const audio = new Target(...args); window.partAudio.push(audio); return audio;
    } });
  });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Part actions');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Part actions', exact: true })).toBeVisible();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const sheet = await new Promise<SongSheet>(resolve => {
      const request = db.transaction('songSheets').objectStore('songSheets').getAll(); request.onsuccess = () => resolve(request.result[0]);
    });
    const actions = Array(16).fill(null);
    actions[0] = { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 2 }] };
    sheet.tempo = 60;
    sheet.parts = [{ id: 'long-part', section: 'Long verse', notes: 'Keep the warm card surface', measures: Array.from({ length: 20 }, (_, index) => ({
      id: `m${index}`, measure: { timeSignature: '4/4', actions }
    })) }];
    sheet.arrangement = [{ id: 'verse-occurrence', partId: 'long-part', lyrics: 'Last lyric field remains reachable' }];
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('songSheets', 'readwrite'); transaction.objectStore('songSheets').put(sheet);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    db.close(); return sheet.id;
  });
  await page.goto(`/sheets/${id}`);
}

async function orderedTransport(transport: Locator) {
  const buttons = transport.getByRole('button');
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(1)).toHaveAccessibleName('Previous measure');
  await expect(buttons.nth(2)).toHaveAccessibleName('Next measure');
  await expect(buttons.nth(3)).toHaveAccessibleName('Stop');
  const boxes = await buttons.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
  }));
  for (const [index, box] of boxes.entries()) {
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1);
    if (index) expect(box.x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width);
  }
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 375, height: 400 }]) {
  test(`part and measure actions stay reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page); await mkdir(evidence, { recursive: true });
    await page.getByRole('button', { name: 'Long verse, occurrence 1', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    const footer = editor.locator('.modal-footer');
    const rows = editor.locator('.measure-row');
    const save = editor.getByRole('button', { name: 'Save changes', exact: true });
    await editor.getByRole('textbox', { name: 'Part name', exact: true }).fill('Edited long verse');
    await orderedTransport(editor.getByRole('group', { name: 'Part playback', exact: true }));
    await expect(editor.locator('.part-editor-title-row app-song-part-transport')).toHaveCount(0);
    for (const index of [0, 10, 19]) {
      // Scroll the workspace, without Playwright scrolling the action into view.
      await rows.nth(index).scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport({ ratio: 1 });
      await expect(editor.getByRole('button', { name: 'Back to song', exact: true })).toBeInViewport({ ratio: 1 });
      await expect(footer.getByRole('status')).toHaveText('Unsaved changes');
      await expect(footer).toBeInViewport({ ratio: 1 });
      const box = (await footer.boundingBox())!;
      const editorBox = (await editor.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(editorBox.x); expect(box.x + box.width).toBeLessThanOrEqual(editorBox.x + editorBox.width + 1);
      await page.screenshot({ path: `${evidence}/part-${viewport.width}x${viewport.height}-${index}.png` });
    }
    // Selection and save share one reserved area, including at the last measure.
    await rows.last().click();
    const toolbar = editor.locator('.selected-measure-toolbar');
    await expect(toolbar).toBeInViewport({ ratio: 1 });
    for (const button of await toolbar.getByRole('button').all()) {
      const hit = (await button.boundingBox())!; expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44);
    }
    expect((await toolbar.boundingBox())!.y + (await toolbar.boundingBox())!.height).toBeLessThanOrEqual((await footer.boundingBox())!.y);
    await page.locator('.app-content-container').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const lastRow = (await rows.last().boundingBox())!;
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual((await toolbar.boundingBox())!.y + 1);
    const edit = editor.getByRole('button', { name: 'Edit selected measure', exact: true });
    await edit.focus(); await edit.press('Enter');
    const measure = page.locator('app-song-part-measure-editor-modal');
    await expect(editor.locator('.part-editor-actions')).toBeHidden();
    await expect(measure.getByRole('button', { name: 'Close measure editor', exact: true })).toBeFocused();
    const apply = measure.getByRole('button', { name: 'Apply to part', exact: false });
    await expect(apply).toBeInViewport({ ratio: 1 });
    await expect(measure.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
    const cancelBox = (await measure.getByRole('button', { name: 'Cancel', exact: true }).boundingBox())!;
    const applyBox = (await apply.boundingBox())!;
    const hintBox = (await measure.locator('.measure-editor-hint').boundingBox())!;
    expect(Math.abs(cancelBox.y - applyBox.y)).toBeLessThan(1);
    expect(cancelBox.height).toBeGreaterThanOrEqual(44);
    expect(applyBox.height).toBeGreaterThanOrEqual(44);
    expect(cancelBox.y).toBeGreaterThanOrEqual(hintBox.y + hintBox.height);
    expect(applyBox.x).toBeGreaterThanOrEqual(cancelBox.x + cancelBox.width);
    await expect(measure.getByRole('group', { name: 'Measure editing actions' }).getByRole('button')).toHaveCount(2);
    await expect(measure.getByRole('group', { name: 'Measure playback', exact: true }).getByRole('button')).toHaveCount(1);
    await expect(measure.getByRole('group', { name: 'Measure playback', exact: true }).getByRole('button', { name: 'Close measure editor', exact: true })).toHaveCount(0);
    await measure.locator('.modal-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(apply).toBeInViewport({ ratio: 1 });
    await apply.focus(); await apply.press('Tab');
    await expect(measure.getByRole('group', { name: 'Measure playback', exact: true }).getByRole('button')).toBeFocused();
    await page.screenshot({ path: `${evidence}/measure-${viewport.width}x${viewport.height}.png` });
    await measure.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(edit).toBeFocused();
    await expect(footer).toBeInViewport({ ratio: 1 });
    await save.click();
    await expect(footer.getByRole('status')).toHaveText('All changes saved');
    await expect(save).toBeDisabled();
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Updated last field');
    await save.click();
    await expect(footer.getByRole('status')).toHaveText('All changes saved');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await editor.getByRole('button', { name: 'Back to song', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.getByRole('group', { name: 'Part actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Save and close', exact: true })).toBeInViewport({ ratio: 1 });
    await rows.last().scrollIntoViewIfNeeded();
    await expect(editor.getByRole('button', { name: 'Save and close', exact: true })).toBeInViewport({ ratio: 1 });
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`part transport and card surfaces survive media states at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page); await mkdir(evidence, { recursive: true });
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    const card = parts.locator('.card').first();
    const transport = card.getByRole('group', { name: 'Part playback', exact: true });
    const surface = () => card.locator('.card-body').evaluate(element => {
      const body = getComputedStyle(element); const card = getComputedStyle(element.parentElement!);
      const heading = element.querySelector('h6')!;
      const header = heading.parentElement!.parentElement!.parentElement!;
      return { card: card.backgroundColor, body: body.backgroundColor, header: getComputedStyle(header).backgroundColor, text: getComputedStyle(heading).color };
    });
    const idle = await surface();
    const contrast = await card.evaluate(element => {
      const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (channels: number[]) => channels.map(value => {
        const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const background = luminance(rgb(getComputedStyle(element).backgroundColor));
      return Array.from(element.querySelectorAll('h6, .part-notes, button:not([disabled])')).map(node => {
        const style = getComputedStyle(node);
        const foreground = luminance(rgb(style.color));
        return { text: node.textContent!.trim(), minimum: node.tagName !== 'BUTTON' || Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && !!child.textContent?.trim()) ? 4.5 : 3, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
      });
    });
    for (const sample of contrast) expect(sample.ratio, sample.text).toBeGreaterThanOrEqual(sample.minimum);
    await orderedTransport(transport);
    // Reproduce the former playback-only override against the actual card surface.
    const before = await card.locator('h6').evaluate(element => {
      const header = element.parentElement!.parentElement!.parentElement! as HTMLElement;
      const old = header.style.backgroundColor; header.style.backgroundColor = 'white';
      const color = getComputedStyle(header).backgroundColor; header.style.backgroundColor = old; return color;
    });
    expect(before).not.toBe(idle.card);
    await page.evaluate(() => { window.blockPartAudio = true; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/samples/**', async route => { await gate; await route.continue(); });
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(transport.getByRole('button', { name: 'Preparing…', exact: true })).toBeDisabled();
    expect(await surface()).toEqual(idle);
    await expect(card).not.toContainText('Playing');
    await expect(transport.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    release();
    const prepared = page.getByRole('button', { name: 'Play prepared audio', exact: true });
    await expect(prepared).toHaveCount(1); await expect(prepared).toBeVisible({ timeout: 45000 });
    await expect(card).toContainText('Ready to play');
    await expect(transport.getByRole('button', { name: 'Resume', exact: true })).toBeDisabled();
    expect(await surface()).toEqual(idle);
    await page.evaluate(() => { window.blockPartAudio = false; });
    await prepared.click();
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    expect(await surface()).toEqual(idle);
    await orderedTransport(transport);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/parts-playing-${viewport.width}.png` });
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(card).toContainText('Paused'); expect(await surface()).toEqual(idle);
    await transport.getByRole('button', { name: 'Next measure', exact: true }).click();
    await expect(card).toContainText('Measure 2 / 20');
    await transport.getByRole('button', { name: 'Previous measure', exact: true }).click();
    await expect(card).toContainText('Measure 1 / 20');
    await transport.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.partAudio.filter(audio => !!audio.getAttribute('src')).length)).toBe(1);
    await page.evaluate(() => window.partAudio.find(audio => !!audio.getAttribute('src'))!.dispatchEvent(new Event('error')));
    await expect(page.getByRole('button', { name: 'Retry playback', exact: true })).toHaveCount(1);
    await expect(card).toContainText('Playback needs attention'); expect(await surface()).toEqual(idle);
    await page.getByRole('button', { name: 'Retry playback', exact: true }).click();
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await transport.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    expect(await surface()).toEqual(idle);
    expect(await page.evaluate(() => window.partAudio.every(audio => audio.paused && !audio.getAttribute('src')))).toBe(true);
    await writeFile(`${evidence}/surfaces-${viewport.width}.json`, JSON.stringify({ viewport, idle, contrast, formerPlaybackOverride: before, after: await surface() }, null, 2));
  });
}

test('recovery notices leave part Save and measure Apply reachable at constrained height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 400 }); await seed(page);
  await page.evaluate(() => { window.blockPartAudio = true; });
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await page.getByRole('group', { name: 'Part actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('app-song-part-editor');
  await editor.getByRole('group', { name: 'Part playback', exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play prepared audio', exact: true })).toBeVisible({ timeout: 45000 });
  await expect(editor.getByRole('button', { name: 'Save and close', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await editor.locator('.measure-row').first().click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  const measure = page.locator('app-song-part-measure-editor-modal');
  await measure.getByRole('button', { name: 'Collapse preview', exact: true }).click();
  await measure.getByRole('button', { name: 'Play measure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play prepared audio', exact: true })).toBeVisible({ timeout: 45000 });
  await expect(measure.getByRole('button', { name: 'Apply to part' })).toBeInViewport({ ratio: 1 });
  await expect(measure.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await measure.getByRole('button', { name: 'Cancel', exact: true }).click();
});
