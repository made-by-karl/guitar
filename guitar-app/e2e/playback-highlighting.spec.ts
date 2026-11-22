import { cancelMeasure } from './song-workspace-actions';
import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

declare global { interface Window { highlightAudio: HTMLAudioElement[]; } }

async function seed(page: Page, tempo = 120, long = false, dense = false) {
  await page.addInitScript(() => {
    window.highlightAudio = [];
    window.Audio = new Proxy(window.Audio, { construct(Target, args) {
      const audio = new Target(...args); window.highlightAudio.push(audio); return audio;
    } });
  });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Highlight fixture');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Highlight fixture', exact: true })).toBeVisible();
  const id = await page.evaluate(async ({ tempo, long, dense }) => {
    const database = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result);
    });
    const sheet = await new Promise<SongSheet>(resolve => {
      const request = database.transaction('songSheets').objectStore('songSheets').getAll();
      request.onsuccess = () => resolve(request.result[0]);
    });
    const actions = Array(16).fill(null);
    actions[0] = { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 2 }] };
    actions[4] = { technique: 'hammer-on', legato: { string: 0, toFret: 4 } };
    actions[8] = { technique: 'slide', slide: { fretOffset: 2 } };
    actions[12] = { technique: 'percussive', percussive: { technique: 'body-knock' } };
    if (dense) actions.fill({ technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 2 }] });
    sheet.tempo = tempo;
    sheet.parts = [
      { id: 'verse', section: 'Verse', notes: 'Keep this musical definition', measures: [
        { id: 'v-m1', measure: { timeSignature: '4/4', actions } },
        { id: 'v-rest', measure: { timeSignature: '4/4', actions: Array(16).fill(null) } }
      ] },
      { id: 'chorus', section: 'Chorus', notes: '', measures: [{ id: 'c-m1', measure: { timeSignature: '4/4', actions } }] }
    ];
    sheet.arrangement = long ? Array.from({ length: 54 }, (_, index) => ({ id: `o${index}`, partId: index % 3 === 1 ? 'chorus' : 'verse', lyrics: `Words ${index}` }))
      : [{ id: 'v1', partId: 'verse', lyrics: 'First words' }, { id: 'c1', partId: 'chorus', lyrics: 'Chorus words' }, { id: 'v2', partId: 'verse', lyrics: 'Second words' }];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('songSheets', 'readwrite'); transaction.objectStore('songSheets').put(sheet);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close(); return sheet.id;
  }, { tempo, long, dense });
  await page.goto(`/sheets/${id}`);
  return id;
}

async function started(page: Page) {
  await expect.poll(async () => {
    const active = await page.evaluate(() => window.highlightAudio.some(audio => !audio.paused));
    if (active) return page.evaluate(() => window.highlightAudio.some(audio => !audio.paused && audio.currentTime > 0));
    const button = page.getByRole('button', { name: 'Play prepared audio', exact: true }).first();
    if (await button.isVisible()) await button.click({ timeout: 500 }).catch(() => {});
    return false;
  }, { timeout: 45_000 }).toBe(true);
}
async function seekPaused(page: Page, time: number) {
  await page.evaluate(time => {
    const audio = window.highlightAudio.findLast(audio => !!audio.getAttribute('src'))!;
    audio.pause(); audio.currentTime = time; audio.dispatchEvent(new Event('timeupdate'));
  }, time);
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`continuous playback reuses editor drawings and respects page scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await seed(page);
    const song = page.locator('app-song-arrangement');
    const pane = song.getByRole('region', { name: 'Playback notation' });
    await song.getByRole('button', { name: 'Play song', exact: true }).click(); await started(page);
    await expect(pane.getByRole('button')).toHaveCount(0);
    const firstSegment = await pane.locator('.action-svg').first().elementHandle();
    const segmentCount = await pane.locator('.action-svg').count();
    await seekPaused(page, 0.25);
    await expect(pane.locator('.playback-position')).toHaveText('Paused · Measure 1 of 2 · Action 3');
    await expect(pane.locator('strong')).toHaveText('Verse (1)');
    await song.getByRole('button', { name: 'Resume song', exact: true }).focus();
    for (const [time, occurrence, measure, slot] of [[1.875, 'v1', 'v-m1', '15'], [2, 'v1', 'v-rest', '16'], [4.25, 'c1', 'c-m1', '34'], [6.25, 'v2', 'v-m1', '50']] as const) {
      await seekPaused(page, time);
      await expect(pane).toHaveAttribute('data-occurrence-id', occurrence);
      await expect(pane).toHaveAttribute('data-measure-id', measure);
      await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', slot);
      const preview = await pane.locator('.notation-measure').evaluate(element => {
        const viewport = element.getBoundingClientRect();
        const marker = element.querySelector('.playback-action-slot')!.getBoundingClientRect();
        return { left: marker.left - viewport.left, width: marker.width, viewport: element.clientWidth,
          atEnd: element.scrollLeft >= element.scrollWidth - element.clientWidth - 1 };
      });
      // Two slots of history, with the remaining width available for upcoming
      // actions even when seeking backwards within the same mounted drawing.
      expect(preview.left).toBeGreaterThanOrEqual(0);
      if (!preview.atEnd) {
        expect(preview.left).toBeLessThanOrEqual((preview.width + 2) * 2 + 2);
        expect(preview.left).toBeLessThan(preview.viewport * 0.3);
      }
      await expect(song.locator('.occurrence-row.is-playing')).toHaveCount(1);
      expect(await firstSegment!.evaluate(element => element.isConnected)).toBe(true);
      await expect(pane.locator('.action-svg')).toHaveCount(segmentCount);
      await expect(song.getByRole('button', { name: 'Resume song', exact: true })).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await expect(pane.locator('.playback-position')).toContainText('Playing');
    // Deliberately leave the playing view. Following may scroll only its own x viewport.
    const scrollTop = await page.evaluate(() => {
      const footer = document.createElement('div'); footer.style.height = '1600px';
      const button = document.createElement('button'); button.textContent = 'Read below the song'; footer.append(button);
      document.querySelector('app-song-arrangement')!.append(footer);
      button.focus({ preventScroll: true });
      const root = document.querySelector<HTMLElement>('.app-content-container')!;
      root.scrollTop = 800;
      const audio = window.highlightAudio.findLast(audio => !!audio.getAttribute('src'))!;
      audio.currentTime = 2.01; audio.dispatchEvent(new Event('timeupdate'));
      return root.scrollTop;
    });
    await expect(pane.locator('.playback-action-slot')).not.toHaveAttribute('data-slot-index', '50');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    expect(await page.locator('.app-content-container').evaluate(element => element.scrollTop)).toBe(scrollTop);
    await expect(page.getByRole('button', { name: 'Read below the song', exact: true })).toBeFocused();
    await song.getByRole('button', { name: 'Pause song', exact: true }).click();
    await page.screenshot({ path: `../temp/ux/playback-highlighting/continuous-${viewport.width}.png`, fullPage: true });
    await song.getByRole('button', { name: 'Stop song', exact: true }).click();
    await expect(pane).toHaveCount(0);

    await song.getByRole('button', { name: 'Verse, occurrence 2', exact: true }).click();
    await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = song.locator('app-song-part-editor');
    await expect(editor.getByLabel('Part name', { exact: true })).toBeDisabled();
    await editor.locator('.measure-row').first().click();
    await editor.getByRole('button', { name: 'Play', exact: true }).first().click(); await started(page);
    await seekPaused(page, 2.25);
    await expect(editor.locator('app-song-playback')).toHaveCount(0);
    await expect(editor.locator('.measure-row').nth(1).locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '2');
    await expect(editor.locator('.measure-row.is-selected')).toHaveAttribute('aria-label', 'Select measure 1');
    await expect(editor.getByLabel('Part name', { exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: 'Stop', exact: true }).first().click();
    await editor.getByRole('tab', { name: 'Lyrics', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Unsaved words stay here');
    await editor.getByRole('button', { name: 'Play', exact: true }).first().click(); await started(page);
    await seekPaused(page, 0.5);
    await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue('Unsaved words stay here');
    await expect(editor.locator('.part-save-status')).toHaveText('Unsaved changes');
    await editor.getByRole('button', { name: 'Stop', exact: true }).first().click();
    await editor.getByRole('button', { name: 'Back to song', exact: true }).last().click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await song.getByRole('region', { name: 'Selected occurrence actions' }).getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
    await seekPaused(page, 0.25); await expect(pane).toHaveAttribute('data-occurrence-id', 'v2');
    await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '2');
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await expect(page.locator('.playback-action-slot')).toHaveCount(0);
    expect(await page.evaluate(() => window.highlightAudio.every(audio => audio.paused && !audio.getAttribute('src')))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Parts keeps the playback component while a measure editor highlights its existing live preview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await seed(page);
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  const parts = page.locator('app-song-sheet-parts-tab');
  await parts.locator('.part-select').first().click();
  await parts.getByRole('region', { name: 'Selected part actions' }).getByRole('button', { name: 'Play', exact: true }).click(); await started(page);
  await seekPaused(page, 2.25);
  const pane = parts.getByRole('region', { name: 'Playback notation' });
  await expect(pane.getByRole('button')).toHaveCount(0);
  await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '18');
  await expect(parts.locator('.part-measure-list .playback-action-slot')).toHaveCount(0);
  await parts.getByRole('group', { name: 'Part playback', exact: true }).first().getByRole('button', { name: 'Previous measure', exact: true }).click();
  await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '0');
  await parts.getByRole('group', { name: 'Part playback', exact: true }).first().getByRole('button', { name: 'Next measure', exact: true }).click();
  await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '16');
  await parts.getByRole('group', { name: 'Part playback', exact: true }).first().getByRole('button', { name: 'Stop', exact: true }).click();
  await parts.locator('.part-select').first().click();
  await parts.getByRole('region', { name: 'Selected part actions' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('app-song-part-editor');
  await editor.getByRole('button', { name: 'Unlock editing…', exact: true }).click();
  await page.getByRole('button', { name: 'Edit all 2 occurrences', exact: true }).click();
  await editor.getByLabel('Part name', { exact: true }).fill('Unsaved Verse');
  await editor.locator('.measure-row').first().click();
  await editor.getByRole('button', { name: 'Duplicate selected measure', exact: true }).click();
  await expect(editor.locator('.measure-row')).toHaveCount(3);
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  const modal = page.locator('app-song-part-measure-editor-modal');
  await modal.getByRole('button', { name: 'Play measure', exact: true }).click(); await started(page);
  await seekPaused(page, 0.25);
  const preview = modal.getByRole('region', { name: 'Live measure preview' });
  await expect(preview.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '2');
  await expect(modal.locator('app-song-playback')).toHaveCount(0);
  await expect(preview.locator('.playback-position')).toHaveText('Paused · Action 3');
  await page.screenshot({ path: '../temp/ux/playback-highlighting/reused-measure-375.png', fullPage: true });
  await cancelMeasure(page);
  await expect(editor.locator('.playback-action-slot')).toHaveCount(0);
  await expect(editor.locator('.part-save-status')).toHaveText('Unsaved changes');
  await editor.getByRole('button', { name: 'Back to parts', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(parts.locator('.card h6').first()).toHaveText('Verse');
});

test('three-minute foreground playback follows repeated sections and rests without accumulating media-clock drift', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, 120, true);
  // Record before Play so startup polling cannot miss the opening boundary samples.
  const recording = page.evaluate(() => new Promise<{ time: number; slot: number; lag: number }[]>(resolve => {
    let audio: HTMLAudioElement | undefined;
    const samples: { time: number; slot: number; lag: number }[] = [];
    let previous = -1;
    const frame = () => {
      audio ??= window.highlightAudio.find(audio => !audio.paused);
      if (!audio) { requestAnimationFrame(frame); return; }
      const pane = document.querySelector<HTMLElement>('.playback-pane');
      const marker = pane?.querySelector<SVGRectElement>('.playback-action-slot');
      if (pane && marker) {
        const slot = Number(marker.dataset['slotIndex']);
        if (slot !== previous) {
          const isBoundary = previous !== -1;
          previous = slot;
          if (isBoundary && (audio.currentTime < 2 || Math.abs(audio.currentTime - 90) < 1 || audio.currentTime > 178)) {
            samples.push({ time: audio.currentTime, slot, lag: audio.currentTime - slot * 0.125 });
          }
        }
      }
      if (audio.currentTime >= 180 || audio.ended) resolve(samples);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  await page.getByRole('button', { name: 'Play song', exact: true }).click(); await started(page);
  const measurements = await recording;
  await mkdir('../temp/ux/playback-highlighting', { recursive: true });
  await writeFile('../temp/ux/playback-highlighting/three-minute-chromium.json', JSON.stringify({
    browser: await page.evaluate(() => navigator.userAgent), tempo: 120, duration: 180,
    method: 'Foreground DOM marker boundary against actual HTMLAudioElement.currentTime. No physical audio capture.', measurements
  }, null, 2));
  for (const [start, end] of [[0, 2], [89, 91], [178, 181]]) {
    const window = measurements.filter(sample => sample.time >= start && sample.time <= end);
    expect(window.length).toBeGreaterThan(8);
    expect(Math.max(...window.map(sample => sample.lag))).toBeLessThanOrEqual(0.05);
    expect(Math.min(...window.map(sample => sample.lag))).toBeGreaterThanOrEqual(0);
  }
  await expect(page.locator('.playback-pane')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.playback-action-slot, .occurrence-row.is-playing')).toHaveCount(0);
});

test('preparation and rejected startup have no marker, and stopping pending work cannot restore it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await seed(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/samples/**', async route => { await held; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  const pane = page.getByRole('region', { name: 'Playback notation' });
  await expect(pane.locator('.playback-position')).toContainText('Preparing');
  await expect(page.locator('.playback-action-slot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop song', exact: true }).click(); release();
  await page.unroute('**/samples/**');
  await expect(pane).toHaveCount(0);
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    let rejected = false;
    HTMLMediaElement.prototype.play = function() {
      if (!rejected) { rejected = true; return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError')); }
      return play.call(this);
    };
  });
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect(pane.locator('.playback-position')).toContainText('Ready to play');
  await expect(page.locator('.playback-action-slot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play prepared audio', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Resume song', exact: true }).click(); await started(page);
  await expect(pane.locator('.playback-action-slot')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await expect(page.locator('.playback-action-slot')).toHaveCount(0);
  expect(await page.evaluate(() => window.highlightAudio.every(audio => audio.paused && !audio.getAttribute('src')))).toBe(true);
});

for (const tempo of [60, 180]) {
  test(`consecutive attacks follow media time, pause and seek at ${tempo} BPM`, async ({ page }) => {
    await seed(page, tempo, false, true);
    await page.getByRole('button', { name: 'Play song', exact: true }).click(); await started(page);
    const measurements = await page.evaluate(tempo => new Promise<number[]>(resolve => {
      const audio = window.highlightAudio.find(audio => !audio.paused)!;
      const duration = 60 / tempo / 4;
      let previous = -1;
      const lags: number[] = [];
      const frame = () => {
        const marker = document.querySelector<SVGRectElement>('.playback-action-slot');
        const slot = Number(marker?.dataset['slotIndex']);
        if (marker && slot !== previous && audio.currentTime < duration * 16) {
          if (previous !== -1) lags.push(audio.currentTime - slot * duration);
          previous = slot;
        }
        if (audio.currentTime >= duration * 15) resolve(lags);
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }), tempo);
    await mkdir('../temp/ux/playback-highlighting', { recursive: true });
    await writeFile(`../temp/ux/playback-highlighting/media-clock-${tempo}.json`, JSON.stringify({
      tempo, method: 'DOM slot transition against actual media currentTime; no physical audio capture', measurements
    }, null, 2));
    expect(measurements.length).toBeGreaterThan(8);
    expect(Math.max(...measurements)).toBeLessThanOrEqual(0.05);
    expect(Math.min(...measurements)).toBeGreaterThanOrEqual(0);
    const pane = page.getByRole('region', { name: 'Playback notation' });
    await page.getByRole('button', { name: 'Pause song', exact: true }).click();
    await expect(pane.locator('.playback-position')).toContainText('Paused');
    const frozen = await pane.locator('.playback-position').textContent();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
    await expect(pane.locator('.playback-position')).toHaveText(frozen!);
    await seekPaused(page, 60 / tempo / 2);
    await expect(pane.locator('.playback-action-slot')).toHaveAttribute('data-slot-index', '2');
    await page.getByRole('button', { name: 'Resume song', exact: true }).click(); await started(page);
    await expect(pane.locator('.playback-position')).toContainText('Playing');
    await page.getByRole('button', { name: 'Stop song', exact: true }).click();
    await expect(page.locator('.playback-action-slot')).toHaveCount(0);
  });
}
