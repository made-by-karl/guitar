import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

declare global { interface Window { playViewAudio: HTMLAudioElement[]; } }
async function seed(page: Page, options: { wide?: boolean; long?: boolean; unavailable?: boolean; noInitial?: boolean; beatGrips?: boolean; navigation?: boolean } = {}) {
  await page.addInitScript(() => {
    window.playViewAudio = [];
    window.Audio = new Proxy(window.Audio, { construct(Target, args) {
      const audio = new Target(...args); window.playViewAudio.push(audio); return audio;
    } });
  });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Play view fixture');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Play view fixture', exact: true })).toBeVisible();
  const id = await page.evaluate(async options => {
    const database = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result);
    });
    const sheet = await new Promise<SongSheet>(resolve => {
      const request = database.transaction('songSheets').objectStore('songSheets').getAll(); request.onsuccess = () => resolve(request.result[0]);
    });
    const actions = Array(options.wide ? 64 : 16).fill(null);
    actions[0] = { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 2 }] };
    actions[4] = { technique: 'percussive', percussive: { technique: 'body-knock' } };
    actions[8] = { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 4 }] };
    sheet.tempo = 120;
    sheet.parts = [
      { id: 'verse', section: 'Verse', notes: '', measures: [
        { id: 'v-m', measure: { timeSignature: '4/4', actions, actionGrips: [
          { measureIndex: 0, actionIndex: options.noInitial ? 8 : 0, gripId: 'x|3|2|o|1|o', name: 'C' },
          { measureIndex: 0, actionIndex: 12, gripId: 'x|3|2|o|1|o', name: 'C alias' }
        ] } },
        { id: 'v-rest', measure: { timeSignature: '4/4', actions: Array(16).fill(null) } }
      ] },
      { id: 'chorus', section: 'Chorus', notes: '', measures: [{ id: 'c-m', measure: { timeSignature: '4/4', actions: actions.slice(0, 16), actionGrips: [
        { measureIndex: 0, actionIndex: 4, gripId: options.unavailable ? 'unresolved' : '3|2|o|o|o|3', name: options.unavailable ? 'Mystery' : 'G' },
        { measureIndex: 0, actionIndex: 8, gripId: options.unavailable ? '1|8|o|o|o|o' : '3|2|o|o|o|3', name: options.unavailable ? 'Wide shape' : 'G alias' }
      ] } }] }
    ];
    if (options.beatGrips) sheet.parts[0].measures[0].measure.actionGrips = [
      { measureIndex: 0, actionIndex: 0, gripId: 'x|3|2|o|1|o', name: 'C' },
      { measureIndex: 0, actionIndex: 4, gripId: '3|2|o|o|o|3', name: 'G' },
      { measureIndex: 0, actionIndex: 8, gripId: 'x|o|2|2|1|o', name: 'Am' },
      { measureIndex: 0, actionIndex: 12, gripId: 'x|x|o|2|3|2', name: 'D' }
    ];
    const words = Array.from({ length: 45 }, (_, index) => `Line ${index + 1}: Keep the rhythm, let it ring`).join('\n');
    sheet.arrangement = options.long
      ? Array.from({ length: 54 }, (_, index) => ({ id: `o${index}`, partId: index % 3 === 1 ? 'chorus' : 'verse', lyrics: `Words ${index}` }))
      : [{ id: 'v1', partId: 'verse', lyrics: words }, { id: 'c1', partId: 'chorus', lyrics: '' }, { id: 'v2', partId: 'verse', lyrics: 'Second verse\nDifferent words' }];
    if (options.navigation) {
      sheet.parts.reverse(); // Parts-library order deliberately differs from the arrangement.
      sheet.parts.push({ id: 'rest', section: 'Break', notes: '', measures: [
        { id: 'rest-m', measure: { timeSignature: '4/4', actions: Array(16).fill(null) } }
      ] });
      sheet.arrangement.push({ id: 'v3', partId: 'verse', lyrics: 'Adjacent verse' }, { id: 'break', partId: 'rest', lyrics: 'Breathe' });
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('songSheets', 'readwrite'); transaction.objectStore('songSheets').put(sheet);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close(); return sheet.id;
  }, options);
  await page.goto(`/sheets/${id}`); return id;
}
const view = (page: Page) => page.getByRole('dialog', { name: 'Play view fixture', exact: true });
async function started(page: Page) {
  await expect.poll(async () => {
    if (await page.evaluate(() => window.playViewAudio.some(audio => !audio.paused && audio.currentTime > 0))) return true;
    const button = view(page).getByRole('button', { name: 'Play prepared audio', exact: true });
    if (await button.isVisible()) await button.click({ timeout: 500 }).catch(() => {});
    return false;
  }, { timeout: 45_000 }).toBe(true);
}
async function seekPaused(page: Page, time: number) {
  await page.evaluate(time => {
    const audio = window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!;
    audio.pause(); audio.currentTime = time; audio.dispatchEvent(new Event('timeupdate'));
  }, time);
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 667, height: 375 }]) {
  test(`viewport, contained scrolling, focus and shared position at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await seed(page, { wide: true });
    const opener = page.getByRole('button', { name: 'Play view', exact: true });
    await opener.click();
    const mode = view(page), measure = mode.getByRole('region', { name: 'Song notation', exact: true });
    await expect(mode).toBeVisible();
    await expect(page.locator('app-song-playback')).toHaveCount(0);
    expect(await mode.boundingBox()).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    await expect(mode.getByRole('status')).toHaveText('Ready to play');
    await expect(measure.getByRole('heading', { level: 2 })).toHaveText('Verse (1)Song measure 1 / 5');
    const exit = mode.getByRole('button', { name: 'Exit play view', exact: true });
    expect(await exit.boundingBox()).toMatchObject({ width: 44, height: 44 });
    await expect(mode.locator('.grip-location')).toHaveCount(0);
    await expect(mode.getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '0');
    await expect(mode.getByRole('progressbar', { name: 'Next grip progress', exact: true })).toHaveAttribute('aria-valuenow', '0');
    await expect(mode.getByRole('progressbar', { name: 'After next grip progress', exact: true })).toHaveAttribute('aria-valuenow', '0');
    if (viewport.width === 375) {
      const lyricsBounds = await mode.locator('.lyrics-panel').boundingBox();
      const transportBounds = await mode.locator('.play-transport').boundingBox();
      expect(transportBounds!.y - lyricsBounds!.y).toBeGreaterThan(80);
    }
    await expect(mode.locator('.playback-action-slot')).toHaveCount(0);
    expect(await page.evaluate(() => window.playViewAudio.every(audio => audio.paused))).toBe(true);
    await expect(mode.getByRole('region', { name: 'Current grip', exact: true }).getByRole('heading', { level: 3 })).toHaveText('C');
    await expect(mode.getByRole('region', { name: 'Next', exact: true })).toHaveAttribute('aria-description', 'Chorus · occurrence 1 · measure 1 · action 5');
    await expect(mode.getByRole('region', { name: 'After next', exact: true })).toHaveAttribute('aria-description', 'Verse · occurrence 2 · measure 1 · action 1');
    await expect(mode.getByRole('button', { name: 'Exit play view', exact: true })).toBeFocused();
    expect(await page.locator('app-root').getAttribute('inert')).toBe('');
    await opener.evaluate(element => (element as HTMLElement).focus());
    await expect(opener).not.toBeFocused();
    for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); expect(await mode.evaluate(element => element.contains(document.activeElement))).toBe(true); }
    const notation = mode.getByRole('region', { name: 'Scrollable song notation' });
    await notation.focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await mode.getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
    await seekPaused(page, 3.5);
    await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '28');
    await expect(mode.getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '35');
    await expect(mode.getByRole('progressbar', { name: 'Next grip progress', exact: true })).toHaveAttribute('aria-valuenow', '33');
    await expect(mode.getByRole('progressbar', { name: 'After next grip progress', exact: true })).toHaveAttribute('aria-valuenow', '29');
    await expect(measure.getByRole('heading', { level: 2 })).toHaveText('Verse (1)Song measure 1 / 5');
    const marker = await mode.locator('.playback-action-slot').boundingBox();
    const bounds = await notation.boundingBox();
    expect(marker!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(marker!.x + marker!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    expect(marker!.x - bounds!.x).toBeLessThanOrEqual((marker!.width + 2) * 2 + 2);
    await mkdir('../temp/ux/song-play-view-continuous', { recursive: true });
    await page.screenshot({ path: `../temp/ux/song-play-view-continuous/paused-${viewport.width}x${viewport.height}.png` });
    const lyrics = mode.getByLabel('Scrollable section lyrics', { exact: true });
    expect(await lyrics.evaluate(element => element.clientHeight)).toBeGreaterThan(100);
    const layout = await mode.locator('.play-content').evaluate(element => {
      const lyrics = element.querySelector('.lyrics-panel')!.getBoundingClientRect();
      const grips = element.querySelector('.grips-panel')!.getBoundingClientRect();
      return { lyrics: { top: lyrics.top, right: lyrics.right, bottom: lyrics.bottom }, grips: { top: grips.top, left: grips.left, bottom: grips.bottom } };
    });
    expect(layout.lyrics.right <= layout.grips.left || layout.lyrics.top >= layout.grips.bottom || layout.lyrics.bottom <= layout.grips.top).toBe(true);
    await lyrics.evaluate(element => element.scrollTop = 200);
    await seekPaused(page, 4.5);
    expect(await lyrics.evaluate(element => element.scrollTop)).toBe(200);
    await seekPaused(page, 8.25); // Whole rest, same occurrence; keep the lyric scroll.
    await expect(measure).toHaveAttribute('data-measure-id', 'v-rest');
    expect(await lyrics.evaluate(element => element.scrollTop)).toBe(200);
    await seekPaused(page, 10.5);
    await expect(measure).toHaveAttribute('data-occurrence-id', 'c1');
    await expect(mode.getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '25');
    await expect(mode.getByRole('progressbar', { name: 'Next grip progress', exact: true })).toHaveAttribute('aria-valuenow', '88');
    await expect(lyrics).toHaveText('No lyrics for this section');
    expect(await lyrics.evaluate(element => element.scrollTop)).toBe(0);
    await expect(mode.getByRole('region', { name: 'Current grip', exact: true }).getByRole('heading', { level: 3 })).toHaveText('G');
    await seekPaused(page, 12.25);
    await expect(measure).toHaveAttribute('data-occurrence-id', 'v2');
    await expect(lyrics).toHaveText('Second verse\nDifferent words');
    await expect(mode.getByRole('region', { name: 'Next', exact: true })).toHaveText('Next');
    await expect(mode.getByRole('region', { name: 'After next', exact: true })).toHaveText('After next');
    await expect(mode.getByRole('progressbar', { name: 'Next grip progress', exact: true })).toHaveCount(0);
    await mode.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mode.getByRole('status')).toHaveText('Ready to play');
    await expect(mode.getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '0');
    await expect(measure).toHaveAttribute('data-measure-id', 'v-m');
    await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBe(0);
    await expect(mode.locator('.playback-action-slot')).toHaveCount(0);
    await mode.getByRole('main').evaluate(element => element.scrollTop = 0);
    await mkdir('../temp/ux/song-play-view-continuous', { recursive: true });
    await page.screenshot({ path: `../temp/ux/song-play-view-continuous/ready-${viewport.width}x${viewport.height}.png` });
    await lyrics.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../temp/ux/song-play-view-continuous/lyrics-${viewport.width}x${viewport.height}.png` });
    await mode.getByRole('region', { name: 'Scrollable grip changes' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../temp/ux/song-play-view-continuous/grips-${viewport.width}x${viewport.height}.png` });
    await expect(mode.getByRole('button', { name: 'Stop', exact: true })).toBeInViewport();
    await expect(mode.getByRole('button', { name: 'Exit play view', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(mode).toHaveCount(0); await expect(opener).toBeFocused();
    expect(await page.locator('app-root').getAttribute('inert')).toBeNull();
    expect(errors).toEqual([]);
  });
}

test('attaches playing and paused media without a restart, exits to inline highlighting, completes and replays', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Verse, occurrence 2', exact: true }).click();
  await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
  const selected = page.locator('.occurrence-row.is-selected');
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await page.getByRole('button', { name: 'Play view', exact: true }).click(); await started(page);
  const count = await page.evaluate(() => window.playViewAudio.length);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Playback notation' }).locator('.playback-action-slot')).toHaveCount(1);
  await expect(selected.getByRole('button', { name: 'Verse, occurrence 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await seekPaused(page, 4.5);
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  await expect(view(page).getByRole('status')).toHaveText('Paused');
  await expect(view(page).getByRole('region', { name: 'Song notation', exact: true })).toHaveAttribute('data-occurrence-id', 'c1');
  await expect(view(page).locator('.song-measure')).toHaveText('Song measure 3 / 5');
  expect(await page.evaluate(() => window.playViewAudio.length)).toBe(count);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Verse, occurrence 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  await view(page).getByRole('button', { name: 'Resume', exact: true }).click(); await started(page);
  await page.evaluate(() => {
    const audio = window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!; audio.currentTime = audio.duration - 0.1;
  });
  await expect(view(page).getByRole('status')).toHaveText('End of song', { timeout: 10_000 });
  await expect(view(page).getByRole('button', { name: 'Previous part', exact: true })).toBeDisabled();
  await expect(view(page).getByRole('button', { name: 'Next part', exact: true })).toBeDisabled();
  await expect(view(page).getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '100');
  await expect(view(page).getByRole('region', { name: 'Song notation', exact: true })).toHaveAttribute('data-occurrence-id', 'v2');
  await expect(view(page).getByLabel('Scrollable section lyrics', { exact: true })).toHaveText('Second verse\nDifferent words');
  await expect(view(page).locator('.playback-action-slot')).toHaveCount(0);
  await view(page).getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await expect(view(page).getByRole('region', { name: 'Song notation', exact: true })).toHaveAttribute('data-occurrence-id', 'v1');
  await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href="/sheets"]')!.click());
  await expect(page.locator('app-song-play-view')).toHaveCount(0);
  expect(await page.evaluate(() => window.playViewAudio.every(audio => audio.paused && !audio.getAttribute('src')))).toBe(true);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`section navigation shares media, position and boundaries at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await seed(page, { navigation: true });
    const song = page.locator('app-song-arrangement');
    const previous = song.getByRole('button', { name: 'Previous part', exact: true });
    const next = song.getByRole('button', { name: 'Next part', exact: true });
    await expect(previous).toBeDisabled(); await expect(next).toBeDisabled();
    expect((await song.locator('.song-transport button:not(:first-child)').allTextContents()).every(text => !text.trim())).toBe(true);
    await page.getByRole('button', { name: 'Play song', exact: true }).click();
    await page.getByRole('button', { name: 'Play view', exact: true }).click(); await started(page);
    const mode = view(page);
    const viewPrevious = mode.getByRole('button', { name: 'Previous part', exact: true });
    const viewNext = mode.getByRole('button', { name: 'Next part', exact: true });
    expect((await mode.locator('.transport-row button').allTextContents()).every(text => !text.trim())).toBe(true);
    await expect(viewPrevious).toBeDisabled(); await expect(viewNext).toBeEnabled();
    const identity = await page.evaluate(() => {
      const audio = window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!;
      return { count: window.playViewAudio.length, src: audio.src, duration: audio.duration };
    });
    const position = mode.getByRole('region', { name: 'Song notation', exact: true });
    await viewNext.click();
    await expect(position).toHaveAttribute('data-occurrence-id', 'c1');
    await expect(mode.getByRole('status')).toHaveText('Playing');
    await expect.poll(() => page.evaluate(() => window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!.currentTime)).toBeGreaterThanOrEqual(4);
    await seekPaused(page, 7.25); // Midway through Verse (2), after entering from the same media.
    await viewPrevious.click();
    await expect(position).toHaveAttribute('data-occurrence-id', 'c1');
    await expect(mode.getByRole('status')).toHaveText('Paused');
    await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '32');
    await expect(mode.getByLabel('Scrollable section lyrics', { exact: true })).toHaveText('No lyrics for this section');
    await expect(mode.getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '0');
    await expect(mode.getByRole('region', { name: 'Current grip', exact: true })).toContainText('C');
    await expect(mode.getByRole('region', { name: 'Next', exact: true })).toContainText('G');
    await viewNext.click();
    await expect(position).toHaveAttribute('data-occurrence-id', 'v2');
    await expect(mode.getByLabel('Scrollable section lyrics', { exact: true })).toHaveText('Second verse\nDifferent words');
    // Multiple requests in one browser task must each use the accepted target.
    await viewNext.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(position).toHaveAttribute('data-occurrence-id', 'break');
    await expect(viewNext).toBeDisabled();
    await expect(mode.getByRole('status')).toHaveText('Paused');
    await expect(mode.getByLabel('Scrollable section lyrics', { exact: true })).toHaveText('Breathe');
    await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '112');
    expect(await page.evaluate(() => window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!.currentTime)).toBe(14);
    // Native MP4 time reporting can round down by a microsecond; retain every written rest sample.
    expect(identity.duration).toBeGreaterThanOrEqual(16 - 1 / 44100);
    await viewPrevious.focus(); await page.keyboard.press('Enter');
    await expect(position).toHaveAttribute('data-occurrence-id', 'v3');
    await expect(viewPrevious).toBeFocused();
    expect(await viewPrevious.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const evidence = '../temp/ux/song-sheet-editing-consistency';
    await mkdir(evidence, { recursive: true });
    const iconSize = await page.evaluate(() => matchMedia('(pointer: coarse)').matches ? 44 : 32);
    for (const button of [viewPrevious, viewNext]) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(iconSize); expect(bounds.height).toBeGreaterThanOrEqual(iconSize);
      await expect(button).toBeInViewport();
    }
    expect(await mode.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: `${evidence}/section-seek-play-view-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    const inline = song.getByRole('region', { name: 'Playback notation', exact: true });
    await expect(inline).toHaveAttribute('data-occurrence-id', 'v3');
    await previous.click();
    await expect(inline).toHaveAttribute('data-occurrence-id', 'v2');
    await previous.click();
    await expect(inline).toHaveAttribute('data-occurrence-id', 'c1');
    await previous.click();
    await expect(inline).toHaveAttribute('data-occurrence-id', 'v1');
    await expect(previous).toBeDisabled();
    await next.focus(); await page.keyboard.press('Enter');
    await expect(inline).toHaveAttribute('data-occurrence-id', 'c1');
    if (viewport.width === 1280) {
      // A different selected editor can contain unsaved work while song navigation proceeds.
      await song.getByRole('button', { name: 'Verse, occurrence 3', exact: true }).click();
      await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
      const editor = page.locator('app-song-part-editor');
      await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
      await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Unrelated draft');
      await next.click();
      await expect(inline).toHaveAttribute('data-occurrence-id', 'v2');
      await expect(song.locator('.occurrence-row.is-playing')).toContainText('Second verse');
      await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Unrelated draft');
      await expect(editor.locator('.part-save-status')).toHaveText('Unsaved changes');
      await expect(song.getByRole('button', { name: 'Verse, occurrence 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Keep editing', exact: true })).toHaveCount(0);
    }
    for (const button of [previous, next]) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(iconSize); expect(bounds.height).toBeGreaterThanOrEqual(iconSize);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await next.focus();
    await page.screenshot({ animations: 'disabled', path: `${evidence}/section-seek-inline-${viewport.width}.png` });
    expect(await page.evaluate(() => {
      const audio = window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!;
      return { count: window.playViewAudio.length, src: audio.src, duration: audio.duration };
    })).toMatchObject({ count: identity.count, src: identity.src }); // Final native duration may reconcile by a microsecond.
    await song.getByRole('button', { name: 'Stop song', exact: true }).click();
    await expect(previous).toBeDisabled(); await expect(next).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('entry guard preserves unsaved lyrics, music and preview on cancellation; accepted entry uses saved music', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Verse, occurrence 2', exact: true }).click();
  await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('app-song-part-editor');
  await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Unsaved words');
  await editor.getByRole('button', { name: 'Play', exact: true }).first().click();
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(view(page)).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Unsaved words');
  await expect(editor.locator('.part-save-status')).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(view(page).getByRole('status')).toHaveText('Ready to play');
  expect(await page.evaluate(() => window.playViewAudio.every(audio => audio.paused))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Unsaved words');
  await expect(page.getByRole('button', { name: 'Verse, occurrence 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('missing/limited diagrams keep ordered labels and do not block notation or playback', async ({ page }) => {
  await seed(page, { unavailable: true, noInitial: true });
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  await expect(view(page).getByRole('region', { name: 'Current grip', exact: true })).toContainText('No grip assigned');
  await view(page).getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await seekPaused(page, 1);
  await expect(view(page).getByRole('region', { name: 'Next', exact: true })).toContainText('Mystery');
  await expect(view(page).getByRole('region', { name: 'Next', exact: true })).toContainText('Grip diagram unavailable');
  await expect(view(page).getByRole('region', { name: 'After next', exact: true })).toContainText('Frets 1–8 exceed the 5-fret diagram.');
  await seekPaused(page, 4.5);
  await expect(view(page).getByRole('region', { name: 'Current grip', exact: true })).toContainText('Mystery');
  await expect(view(page).locator('.playback-action-slot')).toHaveCount(1);
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/unavailable-diagrams.png' });
});

test('preparation, rejected startup, interruption and stop have no stale marker or restart', async ({ page }) => {
  await seed(page); await page.getByRole('button', { name: 'Play view', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  await page.route('**/samples/**', async route => { await held; await route.continue().catch(() => {}); });
  await view(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(view(page).getByRole('status')).toHaveText('Preparing…');
  await expect(view(page).getByRole('button', { name: 'Previous part', exact: true })).toBeDisabled();
  await expect(view(page).getByRole('button', { name: 'Next part', exact: true })).toBeDisabled();
  await expect(view(page).locator('.playback-action-slot')).toHaveCount(0);
  await view(page).getByRole('button', { name: 'Stop', exact: true }).click(); release(); await page.unroute('**/samples/**');
  await expect(view(page).getByRole('status')).toHaveText('Ready to play');
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play; let rejected = false;
    HTMLMediaElement.prototype.play = function() {
      if (!rejected) { rejected = true; return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError')); }
      return play.call(this);
    };
  });
  await view(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(view(page).getByRole('button', { name: 'Play prepared audio', exact: true })).toBeVisible();
  await expect(view(page).getByRole('button', { name: 'Next part', exact: true })).toBeDisabled();
  await expect(view(page).locator('.playback-action-slot')).toHaveCount(0);
  await view(page).getByRole('button', { name: 'Resume', exact: true }).click(); await started(page);
  await page.evaluate(() => {
    const audio = window.playViewAudio.findLast(audio => !!audio.getAttribute('src'))!;
    audio.pause(); audio.dispatchEvent(new Event('waiting'));
  });
  await expect(view(page).getByRole('status')).toHaveText('Paused');
  // The shared backend freezes its last position on a media waiting interruption.
  const position = await view(page).locator('.position').textContent();
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
  await expect(view(page).locator('.position')).toHaveText(position!);
  await view(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(view(page).getByRole('status')).toHaveText('Ready to play');
});

test('continuous bars follow media inside one slot and grip handoff keeps the cards fixed', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  const mode = view(page);
  const grip = mode.getByRole('progressbar', { name: 'Next grip progress', exact: true });
  const part = mode.getByRole('progressbar', { name: 'Current part progress' });
  const current = mode.getByRole('region', { name: 'Current grip', exact: true });
  await mode.getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await seekPaused(page, 4.54);
  await expect(grip).toHaveAttribute('aria-valuenow', '76');
  await expect(part).toHaveAttribute('aria-valuenow', '27');
  await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '36');
  await seekPaused(page, 4.62);
  await expect(grip).toHaveAttribute('aria-valuenow', '77');
  await expect(part).toHaveAttribute('aria-valuenow', '31');
  await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '36');
  await page.waitForTimeout(180);
  await expect(grip).toHaveAttribute('aria-valuenow', '77');
  await seekPaused(page, 4.48);
  const before = await current.boundingBox();
  await expect(current.getByRole('heading', { level: 3 })).toHaveText('C alias');
  await mode.getByRole('button', { name: 'Resume', exact: true }).click(); await started(page);
  await expect(current.getByRole('heading', { level: 3 })).toHaveText('G');
  await expect(current).toHaveClass(/grip-handoff/);
  await expect(mode.getByRole('region', { name: 'Next', exact: true }).getByRole('heading', { level: 3 })).toHaveText('C');
  const after = await current.boundingBox();
  expect(after).toEqual(before);
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/grip-handoff.png' });
  await expect(current).not.toHaveClass(/grip-handoff/);
  await mode.getByRole('button', { name: 'Pause', exact: true }).click();
  await seekPaused(page, 6);
  await expect(part).toHaveAttribute('aria-valuenow', '0');
  await expect(mode.getByLabel('Scrollable section lyrics', { exact: true })).toHaveText('Second verse\nDifferent words');
  await expect(grip).toHaveCount(0);
  await expect(mode.getByText('No further grip changes', { exact: true })).toHaveCount(0);
  await expect(mode.getByText('No second upcoming change', { exact: true })).toHaveCount(0);
});

test('the complete song can be browsed before Play and while paused, then follows again on resume', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page);
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  const mode = view(page), notation = mode.getByRole('region', { name: 'Scrollable song notation' });
  await expect(mode.locator('.measure-divider')).toHaveCount(4);
  const segmentCount = await mode.locator('.action-svg').count();
  await notation.evaluate(element => element.scrollLeft = element.scrollWidth);
  const idleScroll = await notation.evaluate(element => element.scrollLeft);
  expect(idleScroll).toBeGreaterThan(800);
  await page.waitForTimeout(200);
  expect(await notation.evaluate(element => element.scrollLeft)).toBe(idleScroll);
  expect(await page.evaluate(() => window.playViewAudio.every(audio => audio.paused))).toBe(true);
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/browse-idle-375.png' });
  await mode.getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBeLessThan(100);
  const first = await mode.locator('.action-svg').first().elementHandle();
  await mode.getByRole('button', { name: 'Pause', exact: true }).click();
  await seekPaused(page, 6.25);
  await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '50');
  await expect(mode.getByRole('region', { name: 'Song notation', exact: true })).toHaveAttribute('data-occurrence-id', 'v2');
  await notation.evaluate(element => element.scrollLeft = 0);
  await page.waitForTimeout(200);
  expect(await notation.evaluate(element => element.scrollLeft)).toBe(0);
  await notation.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/browse-paused-375.png' });
  await mode.getByRole('button', { name: 'Resume', exact: true }).click(); await started(page);
  await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBeGreaterThan(400);
  const marker = await mode.locator('.playback-action-slot').boundingBox();
  const viewport = await notation.boundingBox();
  expect(marker!.x).toBeGreaterThanOrEqual(viewport!.x);
  expect(marker!.x + marker!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
  await seekPaused(page, 4.25);
  await expect(mode.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '34');
  expect(await first!.evaluate(element => element.isConnected)).toBe(true);
  await expect(mode.locator('.action-svg')).toHaveCount(segmentCount);
  await mode.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => notation.evaluate(element => element.scrollLeft)).toBe(0);
  await expect(mode.locator('.measure-divider')).toHaveCount(4);
});

test('beat-by-beat grip countdown keeps its fill and speed when After next becomes Next', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page, { beatGrips: true });
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  const mode = view(page);
  const next = mode.getByRole('progressbar', { name: 'Next grip progress', exact: true });
  const after = mode.getByRole('progressbar', { name: 'After next grip progress', exact: true });
  const part = mode.getByRole('progressbar', { name: 'Current part progress' });
  await mode.getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await seekPaused(page, 0.25);
  await expect(next).toHaveAttribute('aria-valuenow', '50');
  await expect(after).toHaveAttribute('aria-valuenow', '25');
  await expect(part).toHaveAttribute('aria-valuenow', '6');
  const before = await mode.locator('.grip-card').evaluateAll(cards => cards.map(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })));
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/beat-grips-375.png' });
  await seekPaused(page, 0.49);
  await expect(after).toHaveAttribute('aria-valuenow', '49');
  await seekPaused(page, 0.5);
  await expect(mode.locator('.current-grip h3')).toHaveText('G');
  await expect(mode.getByRole('region', { name: 'Next', exact: true }).getByRole('heading', { level: 3 })).toHaveText('Am');
  await expect(mode.getByRole('region', { name: 'After next', exact: true }).getByRole('heading', { level: 3 })).toHaveText('D');
  await expect(next).toHaveAttribute('aria-valuenow', '50');
  await expect(after).toHaveAttribute('aria-valuenow', '0');
  await expect(part).toHaveAttribute('aria-valuenow', '13');
  await page.screenshot({ path: '../temp/ux/song-play-view-continuous/beat-grips-promoted-375.png' });
  await seekPaused(page, 0.51);
  await expect(next).toHaveAttribute('aria-valuenow', '51');
  await seekPaused(page, 0.75);
  await expect(next).toHaveAttribute('aria-valuenow', '75');
  await expect(after).toHaveAttribute('aria-valuenow', '25');
  await seekPaused(page, 1);
  await expect(mode.getByRole('region', { name: 'Next', exact: true }).getByRole('heading', { level: 3 })).toHaveText('D');
  await expect(next).toHaveAttribute('aria-valuenow', '50');
  await seekPaused(page, 0.75);
  await expect(next).toHaveAttribute('aria-valuenow', '75');
  expect(await mode.locator('.grip-card').evaluateAll(cards => cards.map(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })))).toEqual(before);
  await seekPaused(page, 8);
  await expect(next).toHaveCount(0); await expect(after).toHaveCount(0);
  await expect(mode.getByRole('region', { name: 'Next', exact: true })).toHaveText('Next');
  await expect(mode.getByRole('region', { name: 'After next', exact: true })).toHaveText('After next');
});

test('three-minute play view derives markers, lyrics and grips from the shared media clock', async ({ page }) => {
  test.setTimeout(240_000); await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, { long: true });
  await page.getByRole('button', { name: 'Play view', exact: true }).click();
  // Install the recorder before playback so media startup/polling cannot miss opening slots.
  const recording = page.evaluate(() => new Promise<{ time: number; lag: number; correct: boolean; partError: number; gripError: number; afterNextError: number }[]>(resolve => {
    let audio: HTMLAudioElement | undefined;
    const samples: { time: number; lag: number; correct: boolean; partError: number; gripError: number; afterNextError: number }[] = []; let previous = -1;
    const rows = Array.from({ length: 54 }, (_, index) => index % 3 === 1 ? [index] : [index, index]).flat();
    const changes: { time: number; chord: string }[] = [];
    for (let index = 0; index < rows.length; index++) {
      if (index > 0 && rows[index] === rows[index - 1]) continue;
      const chord = rows[index] % 3 === 1 ? 'G' : 'C';
      if (changes.at(-1)?.chord !== chord) changes.push({ time: index * 2 + (chord === 'G' ? 0.5 : 0), chord });
    }
    const frame = () => {
      audio ??= window.playViewAudio.find(audio => !audio.paused);
      if (!audio) { requestAnimationFrame(frame); return; }
      const pane = document.querySelector<HTMLElement>('app-song-play-view .notation-panel');
      const marker = pane?.querySelector<SVGRectElement>('.playback-action-slot');
      const slot = Number(marker?.dataset['slotIndex']);
      const arranged = Number(pane?.dataset['songMeasureIndex']);
      const local = slot - arranged * 16;
      if (marker && slot !== previous) {
        const boundary = previous !== -1; previous = slot;
        if (boundary && (audio.currentTime < 2 || Math.abs(audio.currentTime - 90) < 1 || audio.currentTime > 178)) {
          const text = document.querySelector('.lyrics')?.textContent;
          const occurrence = rows[arranged];
          const partStart = rows.indexOf(occurrence) * 2, partEnd = (rows.lastIndexOf(occurrence) + 1) * 2;
          const expectedPart = Math.max(0, Math.min(100, (audio.currentTime - partStart) / (partEnd - partStart) * 100));
          const partValue = Number(document.querySelector('.lyrics-progress')?.getAttribute('aria-valuenow'));
          const changeIndex = changes.findLastIndex(change => change.time <= slot * 0.125 + 0.000001);
          const next = changes[changeIndex + 1], current = changes[changeIndex];
          const nextStart = changes[changeIndex - 1]?.time ?? 0;
          const gripBar = document.querySelector('.grip-progress');
          const expectedGrip = next ? Math.max(0, Math.min(100, (audio.currentTime - nextStart) / (next.time - nextStart) * 100)) : undefined;
          const gripError = expectedGrip === undefined ? (gripBar ? Infinity : 0) : gripBar ? Math.abs(Number(gripBar.getAttribute('aria-valuenow')) - expectedGrip) : Infinity;
          const afterNext = changes[changeIndex + 2];
          const afterBar = document.querySelector('[aria-label="After next grip progress"]');
          const expectedAfter = afterNext ? Math.max(0, Math.min(100, (audio.currentTime - current.time) / (afterNext.time - current.time) * 100)) : undefined;
          const afterNextError = expectedAfter === undefined ? (afterBar ? Infinity : 0) : afterBar ? Math.abs(Number(afterBar.getAttribute('aria-valuenow')) - expectedAfter) : Infinity;
          const isChorus = occurrence % 3 === 1, isRest = arranged > 0 && rows[arranged - 1] === occurrence;
          const expectedName = isChorus ? local < 4 ? 'C alias' : local < 8 ? 'G' : 'G alias' : isRest || local >= 12 ? 'C alias' : 'C';
          const correct = pane?.dataset['occurrenceId'] === `o${occurrence}` && local === slot % 16 && text === `Words ${occurrence}` && document.querySelector('.current-grip h3')?.textContent === expectedName;
          samples.push({ time: audio.currentTime, lag: audio.currentTime - slot * 0.125, correct, partError: Math.abs(partValue - expectedPart), gripError, afterNextError });
        }
      }
      if (audio.currentTime >= 180 || audio.ended) resolve(samples); else requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  }));
  await view(page).getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  const measurements = await recording;
  await mkdir('../temp/ux/song-play-view-continuous', { recursive: true });
  await writeFile('../temp/ux/song-play-view-continuous/three-minute-chromium.json', JSON.stringify({
    browser: await page.evaluate(() => navigator.userAgent), tempo: 120, duration: 180,
    method: 'Foreground DOM against HTMLAudioElement.currentTime; no physical audio capture', measurements
  }, null, 2));
  for (const [start, end] of [[0, 2], [89, 91], [178, 181]]) {
    const samples = measurements.filter(sample => sample.time >= start && sample.time <= end);
    expect(samples.length).toBeGreaterThan(8); expect(samples.every(sample => sample.correct)).toBe(true);
    expect(Math.max(...samples.map(sample => sample.lag))).toBeLessThanOrEqual(0.05);
    expect(Math.min(...samples.map(sample => sample.lag))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples.map(sample => sample.partError))).toBeLessThanOrEqual(3);
    expect(Math.max(...samples.map(sample => sample.gripError))).toBeLessThanOrEqual(3);
    expect(Math.max(...samples.map(sample => sample.afterNextError))).toBeLessThanOrEqual(3);
  }
  await expect(view(page).getByRole('status')).toHaveText('End of song', { timeout: 10_000 });
  await expect(view(page).getByRole('button', { name: 'Previous part', exact: true })).toBeDisabled();
  await expect(view(page).getByRole('button', { name: 'Next part', exact: true })).toBeDisabled();
  await expect(view(page).getByRole('progressbar', { name: 'Current part progress' })).toHaveAttribute('aria-valuenow', '100');
});

test.describe('touch scrolling', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } });
  test('lyrics and grip strip scroll within the mode while transport stays reachable', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Touch swipe injection uses Chromium CDP; physical WebKit touch remains a separate check.');
    await seed(page, { wide: true }); await page.getByRole('button', { name: 'Play view', exact: true }).click();
    const mode = view(page), content = mode.getByRole('main');
    const session = await context.newCDPSession(page);
    async function swipe(from: { x: number; y: number }, to: { x: number; y: number }) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let index = 1; index <= 8; index++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * index / 8, y: from.y + (to.y - from.y) * index / 8 }] });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const strip = mode.getByRole('region', { name: 'Scrollable grip changes' });
    await strip.scrollIntoViewIfNeeded();
    if (await strip.evaluate(element => element.scrollWidth > element.clientWidth)) {
      const gripBounds = (await strip.boundingBox())!;
      const y = Math.min(500, gripBounds.y + 100);
      await swipe({ x: 310, y }, { x: 60, y });
      await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    } else {
      await expect(mode.getByRole('region', { name: 'After next', exact: true })).toBeInViewport();
    }
    const lyrics = mode.getByLabel('Scrollable section lyrics', { exact: true });
    await lyrics.scrollIntoViewIfNeeded();
    const lyricBounds = (await lyrics.boundingBox())!;
    const contentScroll = await content.evaluate(element => element.scrollTop);
    await swipe({ x: 180, y: Math.min(570, lyricBounds.y + lyricBounds.height - 20) }, { x: 180, y: lyricBounds.y + 20 });
    await expect.poll(() => lyrics.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    expect(await content.evaluate(element => element.scrollTop)).toBe(contentScroll);
    await expect(mode.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
    await expect(mode.getByRole('button', { name: 'Exit play view', exact: true })).toBeInViewport();
    await page.screenshot({ path: '../temp/ux/song-play-view-continuous/touch-lyrics-375.png' });
    await session.detach();
  });
});
