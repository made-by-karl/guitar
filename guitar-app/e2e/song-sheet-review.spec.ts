import { expect, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

for (const width of [390, 1280]) {
  test(`renders inherited single and group slides in both part views at ${width}px`, async ({ page }, testInfo) => {
    const warnings: string[] = [];
    page.on('console', message => {
      if (message.type() === 'warning' && message.text().includes('slide skipped')) warnings.push(message.text());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Slide notation');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Slide notation', exact: true })).toBeVisible();
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
          sheet.parts = [{
            id: 'slides', section: 'Slides', lyrics: '', notes: '',
            measures: [{
              id: 'source', measure: {
                timeSignature: '4/4',
                actions: [{ technique: 'strum', strum: { direction: 'D', strings: 'all' } },
                  ...Array(5).fill(null), { technique: 'slide', legato: { string: 5, toFret: 4 } }, null],
                actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
              }
            }, {
              id: 'up', measure: { timeSignature: '4/4', actions: [
                { technique: 'slide', legato: { string: 3, toFret: 4 } }, ...Array(11).fill(null),
                { technique: 'slide', slide: { fretOffset: 1 } }, ...Array(3).fill(null)
              ] }
            }, {
              id: 'down', measure: { timeSignature: '4/4', actions: [
                { technique: 'slide', slide: { fretOffset: -1 } }, ...Array(15).fill(null)
              ] }
            }]
          }];
          store.put(sheet);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await page.getByRole('link', { name: 'Slide notation', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const overview = page.locator('app-song-sheet-parts-tab');
    await expect(overview.locator('.slide-line')).toHaveCount(8);
    await expect(overview.locator('.pick-label')).toHaveText(['4', '4', '5', '4', '5', '4', '3', '4']);
    const markerPositions = await overview.locator('.rhythm-marker').evaluateAll(markers => markers.map(marker => {
      const bounds = marker.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    }));
    for (let index = 1; index < markerPositions.length; index++) {
      const previous = markerPositions[index - 1];
      const current = markerPositions[index];
      if (Math.abs(current.y - previous.y) < 1) expect(current.x - previous.x).toBeCloseTo(22, 0);
    }
    expect(await overview.locator('.notation-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await overview.screenshot({ path: testInfo.outputPath(`slide-overview-${width}.png`) });
    await overview.getByRole('button', { name: /Edit$/ }).click();
    await page.getByRole('tab', { name: 'Music', exact: true }).click();
    const rows = page.locator('.measure-row');
    for (const [index, labels] of [['4'], ['4', '5', '4', '5'], ['4', '3', '4']].entries()) {
      await expect(rows.nth(index).locator('.pick-label')).toHaveText(labels);
      await expect(rows.nth(index).locator('.slide-line')).toHaveCount(labels.length);
    }
    const directions = await rows.locator('.slide-line').evaluateAll(lines => lines.map(line =>
      Math.sign(Number(line.getAttribute('y1')) - Number(line.getAttribute('y2')))));
    expect(directions).toEqual([1, 1, 1, 1, 1, -1, -1, -1]);
    await expect(rows.locator('.technique-mark')).toHaveCount(0);
    await page.locator('.measure-sequence').screenshot({ path: testInfo.outputPath(`slide-editor-${width}.png`) });
    await rows.nth(1).click();
    const toolbar = page.locator('.selected-measure-toolbar');
    await expect(toolbar.getByRole('button', { name: /Play$/ })).toBeEnabled();
    await toolbar.getByRole('button', { name: /Play$/ }).click();
    await toolbar.getByRole('button', { name: /Stop$/ }).click();
    await page.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const editor = page.locator('app-song-part-measure-editor-modal');
    await editor.getByRole('button', { name: 'Play measure', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Stop measure', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(toolbar.getByRole('button', { name: /Play$/ })).toBeEnabled();
    expect(warnings).toEqual([]);
  });
}

for (const width of [390, 768, 1280]) {
  test(`wraps part notation and prevents silent playback at ${width}px`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const target = window as Window & { slideRamps: { value: number; time: number }[] };
      target.slideRamps = [];
      const create = BaseAudioContext.prototype.createBufferSource;
      BaseAudioContext.prototype.createBufferSource = function () {
        const source = create.call(this);
        const ramp = source.playbackRate.exponentialRampToValueAtTime.bind(source.playbackRate);
        source.playbackRate.exponentialRampToValueAtTime = (value, time) => {
          target.slideRamps.push({ value, time });
          return ramp(value, time);
        };
        return source;
      };
    });
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
                timeSignature: '4/4' as const, actions: [strum, null, { technique: 'slide' as const, slide: { fretOffset: 2 } }, ...Array(13).fill(null)],
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
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
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
    await expect(flow.locator('.legato-line')).toHaveCount(12);
    if (width === 1280) {
      await flow.getByRole('button', { name: /Play$/ }).click();
      await expect.poll(() => page.evaluate(() => (window as Window & { slideRamps: unknown[] }).slideRamps.length)).toBeGreaterThanOrEqual(3);
      const ramps = await page.evaluate(() => (window as Window & { slideRamps: { value: number; time: number }[] }).slideRamps.slice(0, 3));
      expect(new Set(ramps.map(ramp => ramp.time)).size).toBe(1);
      expect(ramps.every(ramp => ramp.value > 0)).toBe(true);
      await flow.getByRole('button', { name: /Stop$/ }).click();
    }

    await flow.getByRole('button', { name: /Edit$/ }).click();
    await page.getByRole('tab', { name: 'Music', exact: true }).click();
    await page.locator('.measure-row').nth(1).click();
    await page.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    await expect(measure.getByRole('button', { name: 'Play measure', exact: true })).toBeEnabled();
    await measure.getByRole('button', { name: 'Play measure', exact: true }).click();
    await expect(measure.getByRole('button', { name: 'Stop measure', exact: true })).toBeEnabled();
    await measure.getByRole('button', { name: 'Stop measure', exact: true }).click();
    await expect(measure.getByRole('button', { name: 'Play measure', exact: true })).toBeEnabled();
    await expect(measure.getByLabel('Slide scope', { exact: true })).toHaveValue('grip');
    await measure.getByLabel('Slide scope', { exact: true }).selectOption('single');
    await expect(measure.getByLabel('Fret shift', { exact: true })).toHaveCount(0);
    await measure.getByLabel('Slide scope', { exact: true }).selectOption('grip');
    await measure.getByLabel('Fret shift', { exact: true }).fill('-1');
    await measure.getByRole('button', { name: 'Play measure', exact: true }).click();
    await measure.getByRole('button', { name: /Save Measure$/ }).click();
    await expect(page.locator('.selected-measure-toolbar').getByRole('button', { name: /Play$/ })).toBeEnabled();
    await page.getByRole('button', { name: /Save Part$/ }).click();
    await silent.getByRole('button', { name: /Edit$/ }).click();
    await expect(page.locator('.part-editor-title-row').getByRole('button', { name: /Play$/ })).toBeDisabled();
    await page.getByRole('tab', { name: 'Music', exact: true }).click();
    await page.locator('.measure-row').click();
    await expect(page.locator('.selected-measure-toolbar').getByRole('button', { name: /Play$/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    await expect(page.locator('app-song-part-measure-editor-modal').getByRole('button', { name: 'Play measure', exact: true })).toBeDisabled();
  });
}

test('passes song tuning and saved grips through the pattern editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Pattern context');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Pattern context', exact: true })).toBeVisible();
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
        sheet.tuning[0] = { semitone: 'D', octave: 2 };
        sheet.capodaster = 2;
        sheet.tempo = 112;
        sheet.grips = [{ gripId: 'x|x|o|2|3|2', name: 'Song D' }];
        store.put(sheet);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole('link', { name: 'Pattern context', exact: true }).click();
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
  await page.getByRole('button', { name: /Add Pattern$/ }).click();
  await page.getByRole('button', { name: 'Create first pattern', exact: true }).click();
  const editor = page.locator('app-playing-pattern-editor');
  await editor.getByLabel('Name', { exact: true }).fill('Song pattern');
  await editor.getByLabel('Subdivision', { exact: true }).check();
  await expect(editor.locator('.action-position-label').first()).toHaveText('1');
  await expect(editor.locator('.action-position-label').nth(1)).toHaveText('1e');
  await expect(editor.locator('.action-position-label').nth(2)).toHaveText('1&');
  await expect(editor.locator('.action-position-label').nth(3)).toHaveText('1a');
  await editor.locator('.action-grip-button').first().click();
  await page.getByRole('button', { name: 'Song D', exact: true }).click();
  await expect(editor.locator('.action-grip-button').first()).toContainText('Song D');
  await editor.locator('.action-grip-button').nth(1).click();
  await page.getByRole('button', { name: /Custom Grip Build/ }).click();
  const custom = page.locator('app-custom-grip-editor-modal');
  await custom.locator('.string-card').first().getByLabel('Press Type').selectOption({ label: 'Open' });
  await custom.locator('.string-card').last().getByLabel('Press Type').selectOption({ label: 'Open' });
  await expect(custom.getByRole('group', { name: 'String notes' }).locator('.note'))
    .toHaveText(['E2,', 'x,', 'x,', 'x,', 'x,', 'F#4']);
  await custom.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('app-playing-pattern-editor-modal').getByRole('button', { name: /Save Pattern$/ }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('app-song-sheet-patterns-tab')).toContainText('Song pattern');
});

test('edits and plays a part with legato diagnostics without signal errors', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { playbackStates: AudioContextState[] };
    target.playbackStates = [];
    const create = BaseAudioContext.prototype.createBufferSource;
    BaseAudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      const context = this;
      const start = source.start.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        start(...args);
        target.playbackStates.push(context.state);
      };
      return source;
    };
  });
  const errors: string[] = [];
  const diagnostics: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning' && /skipped:|warning:/.test(message.text())) diagnostics.push(message.text());
  });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Legato diagnostics');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Legato diagnostics', exact: true })).toBeVisible();
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
        sheet.parts = [{
          id: 'legato', section: 'Legato', lyrics: '', notes: '',
          measures: [{ id: 'm', measure: { timeSignature: '4/4', actions: [
            { technique: 'slide', legato: { string: 0, toFret: 3 } },
            { technique: 'pick', pick: [{ mode: 'explicit', string: 1, fret: 4 }] },
            { technique: 'hammer-on', legato: { string: 1, toFret: 2 } },
            { technique: 'slide', legato: { string: 1, toFret: 2 } },
            ...Array(12).fill(null)
          ] } }]
        }];
        store.put(sheet);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole('link', { name: 'Legato diagnostics', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await page.getByRole('button', { name: /Edit$/ }).click();
  const editor = page.locator('app-song-part-editor');
  const play = editor.locator('.part-editor-title-row').getByRole('button', { name: /Play$/ });
  await expect(play).toBeEnabled();
  await editor.getByRole('tab', { name: 'Music', exact: true }).click();
  await editor.locator('.measure-row').click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  await page.locator('app-song-part-measure-editor-modal').getByRole('button', { name: /Save Measure$/ }).click();
  await expect(page.locator('app-song-part-measure-editor-modal')).toHaveCount(0);
  await expect(play).toBeEnabled();
  expect(diagnostics).toEqual([]);
  expect(errors).toEqual([]);
  const starts = await page.evaluate(() => (window as Window & { playbackStates: AudioContextState[] }).playbackStates.length);
  await play.click();
  await expect(editor.locator('.part-editor-playback-actions').getByRole('button', { name: /Stop$/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { playbackStates: AudioContextState[] }).playbackStates.length))
    .toBeGreaterThan(starts);
  expect(await page.evaluate(() => (window as Window & { playbackStates: AudioContextState[] }).playbackStates.at(-1))).toBe('running');
  expect(diagnostics).toHaveLength(3);
  expect(diagnostics[0]).toContain('slide skipped: no previous note');
  expect(diagnostics[1]).toContain('hammer-on warning');
  expect(diagnostics[2]).toContain('slide warning');
  await editor.locator('.part-editor-playback-actions').getByRole('button', { name: /Stop$/ }).click();
  expect(errors).toEqual([]);
});
