import { cancelMeasure, cancelSongPattern } from './song-workspace-actions';
import { expect, Locator, Page, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';
import type { PlayingPattern } from '../src/app/features/patterns/services/playing-patterns.model';

const viewports = [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 375, height: 400 }];

async function seed(page: Page) {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Floating preview');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Floating preview', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GuitarAppDatabase');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['songSheets', 'playingPatterns'], 'readwrite');
      const store = transaction.objectStore('songSheets');
      const request: IDBRequest<SongSheet[]> = store.getAll();
      request.onsuccess = () => {
        const sheet = request.result[0];
        const measure: PlayingPattern['measures'][number] = { timeSignature: '4/4', actions: Array(16).fill(null) };
        measure.actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
        measure.actions[2] = { technique: 'pick', pick: Array.from({ length: 6 }, (_, string) => ({ mode: 'explicit', string, fret: string + 1 })) };
        measure.actions[4] = { technique: 'hammer-on', legatoMode: 'relative', legato: { string: 'bass', target: { anchor: 'grip-note', fretOffset: 2 } } };
        measure.actions[6] = { technique: 'slide', slide: { fretOffset: 2 } };
        measure.actions[10] = { technique: 'slide', legato: { string: 2, toFret: 7 } };
        measure.actions[12] = { technique: 'percussive', percussive: { technique: 'body-knock' } };
        const grip = { gripId: 'x|3|2|o|1|o', name: 'C major' };
        const history = { timeSignature: '4/4' as const, actions: [{ technique: 'strum' as const, strum: { direction: 'D' as const, strings: 'all' as const } }, ...Array(15).fill(null)],
          actionGrips: [{ ...grip, measureIndex: 0, actionIndex: 0 }] };
        sheet.grips = [grip];
        sheet.parts = [{ id: 'part', section: 'Verse', notes: '', measures: [
          { id: 'history', measure: history }, { id: 'long', measure }
        ] }];
        sheet.arrangement = [{ id: 'occ', partId: 'part', lyrics: '' }];
        store.put(sheet);
        const pattern: PlayingPattern = { id: 'preview-pattern', name: 'Preview fixture', description: '', category: 'Test',
          measures: [measure, structuredClone(measure)], actionGrips: [{ ...grip, measureIndex: 0, actionIndex: 0 }],
          isCustom: true, createdAt: 1, updatedAt: 1 };
        transaction.objectStore('playingPatterns').put(pattern);
      };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

async function openSongMeasure(page: Page) {
  await page.getByRole('link', { name: 'Floating preview', exact: true }).click();
  await page.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
    await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('app-song-part-editor');
  await editor.locator('.measure-row').last().click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  return page.locator('app-song-part-measure-editor-modal');
}

async function assertMapping(editor: Locator) {
  await expect.poll(() => editor.evaluate(element => {
    const panel = element.querySelector('app-measure-editor-preview')!.getBoundingClientRect();
    const root = element.querySelector('.modal-body, .pattern-content')!;
    const rootBounds = root.getBoundingClientRect();
    if (panel.bottom > rootBounds.top + 1) return { matches: false, reason: 'preview overlaps form viewport' };
    const top = Math.max(rootBounds.top, panel.bottom, 0);
    const bottom = Math.min(rootBounds.bottom, window.innerHeight);
    const groups = [...element.querySelectorAll<HTMLElement>('[data-preview-measure]')];
    const exposed = groups.map(group => ({
      index: Number(group.dataset['previewMeasure']),
      cards: [...group.querySelectorAll<HTMLElement>('.action-position')].map(card => {
        const box = card.getBoundingClientRect();
        const height = box.right > rootBounds.left && box.left < rootBounds.right ? Math.max(0, Math.min(box.bottom, bottom) - Math.max(box.top, top)) : 0;
        return { index: Number(card.dataset['actionIndex']), height: height >= 1 ? height : 0 };
      })
    }));
    const shownIndex = Number(element.querySelector<HTMLElement>('.editor-preview')?.dataset['measureIndex']);
    const selected = exposed.find(group => group.index === (groups.length === 1 ? 0 : shownIndex));
    const expected = selected?.cards.filter(card => card.height > 0).map(card => card.index) ?? [];
    const actual = [...element.querySelectorAll<SVGRectElement>('.visible-action-slot.in-view')].map(mark => Number(mark.dataset['slotIndex']));
    const scores = exposed.map(group => group.cards.reduce((sum, card) => sum + card.height, 0));
    const selectedHeight = selected?.cards.reduce((sum, card) => sum + card.height, 0) ?? 0;
    const correctMeasure = selectedHeight === Math.max(0, ...scores);
    const notebook = element.querySelector<HTMLElement>('.notation-measure');
    const marks = [...element.querySelectorAll<SVGRectElement>('.visible-action-slot.in-view')].map(mark => mark.getBoundingClientRect());
    let exposedSpan = true;
    if (notebook && marks.length) {
      const bounds = notebook.getBoundingClientRect();
      const left = Math.min(...marks.map(mark => mark.left));
      const right = Math.max(...marks.map(mark => mark.right));
      exposedSpan = right - left <= notebook.clientWidth
        ? left >= bounds.left - 2 && right <= bounds.right + 2
        : left >= bounds.left - 2 && left < bounds.right;
    }
    return { expected, actual, matches: JSON.stringify(expected) === JSON.stringify(actual) && correctMeasure && exposedSpan };
  })).toMatchObject({ matches: true });
}

async function scrollToCard(editor: Locator, index: number, inset = 12) {
  await editor.evaluate((element, options) => {
    const root = element.querySelector('.modal-body, .pattern-content')!;
    const card = element.querySelectorAll('.action-position')[options.index];
    const panel = element.querySelector('app-measure-editor-preview')!;
    root.scrollTop += card.getBoundingClientRect().top - Math.max(root.getBoundingClientRect().top, panel.getBoundingClientRect().bottom) - options.inset;
  }, { index, inset });
  await assertMapping(editor);
}

for (const viewport of viewports) {
  test(`song draft stays visible, mapped and cancellable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const editor = await openSongMeasure(page);
    const preview = editor.getByRole('region', { name: 'Live measure preview' });
    if (viewport.height <= 480) await preview.getByRole('button', { name: 'Expand preview', exact: true }).click();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('aria-description', 'Measure 2, 4/4');
    await expect(preview).not.toContainText('In view');
    await expect(preview).not.toContainText('undefined');
    const chevron = (await preview.getByRole('button', { name: 'Collapse preview', exact: true }).boundingBox())!;
    expect(chevron.width).toBe(32);
    expect(chevron.height).toBe(31);
    await assertMapping(editor);
    for (const card of [1, 3, 7]) {
      await scrollToCard(editor, card);
      await expect(preview).toBeInViewport({ ratio: 1 });
    }
    // The last blank form remains usable, with footer controls outside the scroll root.
    await editor.locator('.action-position').last().getByTitle('Add Technique', { exact: true }).click();
    await editor.locator('.action-position').last().getByRole('link', { name: /Strum Down$/ }).click();
    await assertMapping(editor);
    await expect(page.getByRole('button', { name: 'Apply to part', exact: false })).toBeInViewport({ ratio: 1 });
    const root = editor.locator('.modal-body, .pattern-content');
    const scrollBefore = await root.evaluate(element => element.scrollTop);
    await preview.getByRole('button', { name: 'Collapse preview', exact: true }).click();
    await expect(preview.locator('app-playing-actions')).toHaveCount(0);
    await expect(preview).toContainText('Measure preview');
    // The shorter scroll content can clamp scrollTop at the end; keep the same last form reachable.
    expect(await root.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollBefore / 2);
    await expect(editor.locator('.action-position').last()).toBeInViewport();
    await preview.getByRole('button', { name: 'Expand preview', exact: true }).click();
    await expect(preview.locator('app-playing-actions')).toBeVisible();
    await expect(preview.locator('.preview-collapsed-label')).toHaveCount(0);
    await assertMapping(editor);
    await page.screenshot({ path: `../temp/ux/floating-measure-editor-preview/song-${viewport.width}x${viewport.height}.png` });
    await cancelMeasure(page);
    await page.locator('app-song-part-editor').getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    await expect(editor.locator('.action-position').last().getByTitle('Add Technique', { exact: true })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('live edits, tall cards, subdivisions, grips and keyboard focus use accepted draft state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  const editor = await openSongMeasure(page);
  const preview = editor.getByRole('region', { name: 'Live measure preview' });
  const first = editor.locator('.action-position').first();
  const previousArrow = await preview.locator('.strum-head').first().getAttribute('points');
  await first.getByLabel('Direction', { exact: true }).selectOption({ label: 'Up' });
  await expect(preview.locator('.strum-head').first()).not.toHaveAttribute('points', previousArrow!);
  await first.locator('.action-grip-button').click();
  const chooser = page.locator('app-grip-source-selector-modal');
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(first.locator('.action-grip-button')).toBeFocused();
  await assertMapping(editor);
  await first.locator('.action-grip-button').click();
  await chooser.getByRole('button', { name: /C major/ }).click();
  await expect(preview.locator('.action-grip-label')).toHaveText('C major');
  await first.locator('.action-grip-button').click();
  await chooser.getByRole('button', { name: /Clear Assignment/ }).click();
  await expect(preview.locator('.action-grip-label')).toHaveCount(0);
  await scrollToCard(editor, 1, -140);
  await expect(preview.locator('.visible-action-slot.in-view[data-slot-index="2"]')).toHaveCount(1);
  await assertMapping(editor);
  await editor.locator('#pickFret_2_5').fill('10');
  await expect(preview.locator('.pick-label').filter({ hasText: /^10$/ })).toHaveCount(1);
  await editor.locator('.action-position').nth(1).locator('#pickFret_2_5').focus();
  await assertMapping(editor);
  await editor.getByRole('button', { name: 'Collapse preview', exact: true }).click();
  await editor.locator('#subdivisionSwitch').check();
  await expect(editor.locator('.action-position')).toHaveCount(16);
  await editor.getByRole('button', { name: 'Expand preview', exact: true }).click();
  await assertMapping(editor);
  await editor.locator('#timeSignature').selectOption({ label: '3/4' });
  await expect(editor.locator('.action-position')).toHaveCount(6);
  await expect(preview).toHaveAttribute('aria-description', 'Measure 2, 3/4');
  await assertMapping(editor);
  await page.setViewportSize({ width: 375, height: 400 });
  await editor.locator('#pickFret_2_5').focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => editor.evaluate(element => {
    const target = document.activeElement!.getBoundingClientRect();
    const body = element.querySelector('.modal-body, .pattern-content')!.getBoundingClientRect();
    return target.top >= body.top && target.bottom <= body.bottom;
  })).toBe(true);
  await page.getByRole('button', { name: 'Apply to part', exact: false }).click();
  await page.locator('app-song-part-editor').getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  await expect(editor.locator('#timeSignature option:checked')).toHaveText('3/4');
});

for (const viewport of viewports) {
  test(`one pattern preview follows exposed measures and refreshes after copy/removal at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    await page.goto('/patterns');
    const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Preview fixture', exact: true }) });
    await card.getByRole('button', { name: /Edit$/ }).click();
    const editor = page.locator('app-playing-pattern-editor-modal');
    const preview = editor.getByRole('region', { name: 'Live measure preview' });
    await expect(editor.locator('app-measure-editor-preview')).toHaveCount(1);
    await scrollToCard(editor, 8);
    await expect(preview).toHaveAttribute('aria-description', 'Measure 2, 4/4');
    await assertMapping(editor);
    await editor.locator('[data-preview-measure="1"]').getByTitle('Copy measure', { exact: true }).click();
    await editor.getByRole('button', { name: 'Add Measure', exact: false }).click();
    await page.getByRole('button', { name: 'Use Copy', exact: true }).click();
    await scrollToCard(editor, 16);
    await expect(preview).toHaveAttribute('aria-description', 'Measure 3, 4/4');
    await editor.locator('[data-preview-measure="2"]').getByTitle('Remove measure', { exact: true }).click();
    await expect(editor.locator('[data-preview-measure]')).toHaveCount(2);
    await scrollToCard(editor, 8);
    await expect(preview).toHaveAttribute('aria-description', 'Measure 2, 4/4');
    await expect(page.locator('.notification-snackbar')).toHaveCount(0);
    await page.screenshot({ path: `../temp/ux/floating-measure-editor-preview/pattern-${viewport.width}x${viewport.height}.png` });
    await page.setViewportSize({ width: 375, height: 400 });
    await editor.locator('#playingPatternName').focus();
    await editor.locator('.modal-body, .pattern-content').evaluate(element => { element.scrollTop = 0; });
    await expect(preview).toHaveCount(0);
    await editor.getByRole('button', { name: /Cancel$/ }).click();
  });
}

test('sheet and part pattern creation share the pane without saving canceled drafts', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page);
  await page.getByRole('link', { name: 'Floating preview', exact: true }).click();
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
  await page.getByRole('button', { name: /Add Pattern$/ }).click();
  await page.getByRole('button', { name: 'Create first pattern', exact: true }).click();
  const editor = page.locator('app-song-pattern-workspace');
  await editor.locator('.action-position').first().locator('.action-grip-button').focus();
  await expect(editor.getByRole('region', { name: 'Live measure preview' })).toBeVisible();
  await assertMapping(editor);
  await cancelSongPattern(page);
  await page.getByRole('tab', { name: 'Song', exact: true }).click();
  await page.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
    await page.locator('app-song-arrangement .selection-actions').getByRole('button', { name: 'Edit', exact: true }).click();
  const part = page.locator('app-song-part-editor');
  await part.getByRole('button', { name: 'Add before first measure', exact: true }).click();
  await page.getByRole('button', { name: 'Create new pattern', exact: true }).click();
  await editor.locator('.action-position').first().locator('.action-grip-button').focus();
  await expect(editor.getByRole('region', { name: 'Live measure preview' })).toBeVisible();
  await assertMapping(editor);
  await cancelSongPattern(page);
  await expect(part.locator('.part-save-status')).not.toHaveText('Unsaved changes');
});

test('the routed pattern editor docks its preview above a separate forms viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/patterns/editor?id=preview-pattern');
  const editor = page.locator('app-patterns-editor');
  await expect.poll(async () => (await editor.locator('.action-position').count()) > 0 || errors.length > 0).toBe(true);
  expect(errors).toEqual([]);
  const forms = editor.locator('.pattern-forms');
  await forms.locator('.action-position').last().getByTitle('Add Technique').focus();
  const preview = editor.getByRole('region', { name: 'Live measure preview' });
  await expect(preview).toBeVisible();
  expect((await preview.boundingBox())!.y + (await preview.boundingBox())!.height).toBeLessThanOrEqual((await forms.boundingBox())!.y + 1);
  await page.screenshot({ path: '../temp/ux/floating-measure-editor-preview/pattern-route-375x667.png' });
  await preview.getByRole('button', { name: 'Collapse preview', exact: true }).click();
  await expect(preview.locator('app-playing-actions')).toHaveCount(0);
  await expect(preview).toContainText('Measure preview');
  expect(errors).toEqual([]);
});

test('expanded preview fits every grip-label line without vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('playingPatterns', 'readwrite');
      const store = transaction.objectStore('playingPatterns');
      const request: IDBRequest<PlayingPattern> = store.get('preview-pattern');
      request.onsuccess = () => {
        const pattern = request.result;
        pattern.actionGrips = [0, 2, 4, 6, 8].map(actionIndex => ({ measureIndex: 0, actionIndex,
          gripId: 'x|3|2|o|1|o', name: `Custom grip at position ${actionIndex + 1}` }));
        store.put(pattern);
      };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.goto('/patterns');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Preview fixture', exact: true }) });
  await card.getByRole('button', { name: /Edit$/ }).click();
  const editor = page.locator('app-playing-pattern-editor-modal');
  await editor.locator('.action-position').first().locator('.action-grip-button').focus();
  const preview = editor.getByRole('region', { name: 'Live measure preview' });
  await expect(preview.locator('.action-grip-label')).toHaveCount(5);
  await expect.poll(() => preview.locator('.preview-drawing').evaluate(element => element.clientHeight)).toBeGreaterThan(128);
  for (const viewport of [{ width: 375, height: 667 }, { width: 375, height: 400 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => preview.evaluate(element => {
      const drawing = element.querySelector<HTMLElement>('.preview-drawing')!;
      const notebook = element.querySelector<HTMLElement>('.notation-measure')!;
      const bounds = drawing.getBoundingClientRect();
      const labelsFit = [...element.querySelectorAll('.action-grip-label')].every(label => {
        const labelBounds = label.getBoundingClientRect();
        return labelBounds.top >= bounds.top && labelBounds.bottom <= bounds.bottom;
      });
      drawing.scrollTop = 100; notebook.scrollTop = 100;
      return labelsFit && drawing.scrollHeight <= drawing.clientHeight + 1
        && notebook.scrollHeight <= notebook.clientHeight + 1 && drawing.scrollTop === 0 && notebook.scrollTop === 0;
    })).toBe(true);
    await page.screenshot({ path: `../temp/ux/floating-measure-editor-preview/grip-labels-${viewport.width}x${viewport.height}.png` });
  }
  await preview.getByRole('button', { name: 'Collapse preview' }).press('Enter');
  await expect(preview).toContainText('Measure preview');
});
