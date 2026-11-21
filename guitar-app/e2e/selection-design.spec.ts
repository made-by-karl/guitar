import { expect, Locator, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

const evidence = '../temp/ux/selection-design';

async function seed(page: Page): Promise<void> {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Selection design');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Selection design', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('GuitarAppDatabase'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('songSheets', 'readwrite'), store = tx.objectStore('songSheets'), request = store.getAll();
      request.onsuccess = () => {
        const sheet: SongSheet = request.result[0];
        const measure = { timeSignature: '4/4', actions: [{ technique: 'percussive' as const, percussive: { technique: 'body-knock' as const } }, ...Array(15).fill(null)], actionGrips: [] };
        sheet.parts = ['Verse', 'Chorus'].map(section => ({ id: section, section, notes: '', measures: Array.from({ length: 12 }, (_, i) => ({ id: `${section}-${i}`, measure })) }));
        sheet.arrangement = sheet.parts.map(part => ({ id: `occ-${part.id}`, partId: part.id, lyrics: '' }));
        sheet.grips = [{ gripId: 'x|3|2|o|1|o', name: 'C' }];
        sheet.patterns = ['One', 'Two'].map(name => ({ id: name, name, description: '', category: '', suggestedGenre: '', exampleSong: '', measures: [measure], createdAt: 0, updatedAt: 0 }));
        store.put(sheet);
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.getByRole('link', { name: 'Selection design', exact: true }).click();
  await mkdir(evidence, { recursive: true });
}

async function actionSamples(actions: Locator) {
  // Wait for actual hover/pressed transitions before measuring their final colors.
  await actions.evaluate(async element => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
  return actions.getByRole('button').evaluateAll(buttons => {
    const rgba = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number);
      return { rgb: values.slice(0, 3), alpha: values[3] ?? 1 };
    };
    const blend = (foreground: number[], background: number[], alpha: number) => foreground.map((v, i) => v * alpha + background[i] * (1 - alpha));
    const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    return buttons.map(button => {
      const style = getComputedStyle(button), rect = button.getBoundingClientRect();
      const surface = rgba(getComputedStyle(button.closest('.app-selection-actions')!).backgroundColor);
      const background = rgba(style.backgroundColor), foreground = rgba(style.color), opacity = Number(style.opacity);
      // A translucent bar may pass over notation, a selected card or empty space.
      // Black/white underlays bound its worst contrast without ignoring alpha.
      const ratios = [[0, 0, 0], [255, 255, 255]].map(underlay => {
        const panel = blend(surface.rgb, underlay, surface.alpha);
        const buttonBg = blend(background.rgb, panel, background.alpha);
        const icon = blend(foreground.rgb, buttonBg, foreground.alpha);
        return contrast(blend(icon, panel, opacity), blend(buttonBg, panel, opacity));
      });
      return { label: button.getAttribute('aria-label'), text: button.textContent!.trim(), width: rect.width, height: rect.height, disabled: (button as HTMLButtonElement).disabled, opacity, ratio: Math.min(...ratios) };
    });
  });
}

async function checkActionContrast(actions: Locator) {
  const samples = await actionSamples(actions);
  for (const sample of samples) {
    expect(sample.opacity, sample.label!).toBe(1);
    expect(sample.ratio, sample.label!).toBeGreaterThanOrEqual(sample.disabled ? 3 : 4.5);
  }
  return samples;
}

async function checkActionLayout(actions: Locator, buttonSize: number): Promise<void> {
  const box = (await actions.boundingBox())!;
  const close = actions.locator('.app-selection-close');
  await expect(close).toHaveCount(1);
  await expect(close).toHaveCSS('border-top-width', '0px');
  await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(close).toHaveCSS('margin-top', '0px');
  await expect(close).toHaveCSS('margin-bottom', '0px');
  const closeBox = (await close.boundingBox())!;
  const header = (await actions.locator('.app-selection-header').boundingBox())!;
  expect(Math.abs(closeBox.y + closeBox.height / 2 - header.y - header.height / 2)).toBeLessThan(1);
  expect(Math.abs(box.x + box.width - closeBox.x - closeBox.width - 13)).toBeLessThan(1);
  const commands = actions.locator('.app-selection-commands');
  const regular = (await commands.boundingBox())!;
  const remove = (await actions.locator('.app-selection-buttons > .btn-outline-danger').boundingBox())!;
  expect(regular.y).toBeGreaterThanOrEqual(closeBox.y + closeBox.height);
  if (Math.abs(regular.y - remove.y) < 1) {
    expect(Math.abs(remove.x - regular.x - regular.width - buttonSize - 16)).toBeLessThan(1);
  } else {
    expect(remove.y).toBeGreaterThanOrEqual(regular.y + regular.height);
  }
  const playback = actions.locator('.part-transport');
  if (await playback.count()) {
    const playButtons = await playback.getByRole('button').evaluateAll(buttons => buttons.map(button => {
      const { x, y, height } = button.getBoundingClientRect(); return { x, y, height };
    }));
    if (actions.page().viewportSize()!.width <= 700) {
      expect(regular.y).toBeGreaterThanOrEqual(Math.max(...playButtons.map(button => button.y + button.height)));
    }
    if (regular.y >= playButtons[0].y + playButtons[0].height) {
      expect(Math.abs(regular.x - playButtons[0].x)).toBeLessThan(1);
      expect(Math.min(...playButtons.map(button => Math.abs(button.x - remove.x)))).toBeLessThan(1);
    }
  }
}

async function checkActions(actions: Locator, selected: Locator): Promise<void> {
  await expect(actions).toBeVisible();
  await checkActionLayout(actions, 32);
  const footprint = await actions.evaluate(element => {
    const box = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
    return { left: box.left - parent.left, right: parent.right - box.right, overflow: element.scrollWidth > element.clientWidth };
  });
  expect(footprint.left).toBeGreaterThanOrEqual(12);
  expect(footprint.right).toBeGreaterThanOrEqual(12);
  expect(Math.abs(footprint.left - footprint.right)).toBeLessThan(1);
  expect(footprint.overflow).toBe(false);
  expect(footprint.left).toBeLessThanOrEqual(13);
  expect(footprint.right).toBeLessThanOrEqual(13);
  await expect(selected).toHaveCSS('background-color', 'rgb(231, 241, 255)');
  await expect(actions).toHaveCSS('opacity', '1');
  const surface = await actions.evaluate(element => getComputedStyle(element).backgroundColor.match(/[\d.]+/g)!.map(Number));
  expect(surface[0]).toBeGreaterThan(surface[2]); // Warm surface, independent of selection blue.
  expect(surface[3]).toBeGreaterThanOrEqual(.9);
  expect(surface[3]).toBeLessThan(1);
  const samples = await checkActionContrast(actions);
  for (const sample of samples) {
    expect(sample.label).toBeTruthy(); expect(sample.text).toBe('');
    expect(sample.width).toBe(32); expect(sample.height).toBe(32);
  }
}

async function addButtonAppearance(button: Locator) {
  await expect(button.locator('i')).toHaveClass('bi bi-plus');
  return button.evaluate(element => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, color: style.color, border: style.borderColor, font: style.font, padding: style.padding, gap: style.gap, radius: style.borderRadius };
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`shared selection, icons and aligned workspaces at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page);
    const song = page.locator('app-song-arrangement');
    if (viewport.width > 700) {
      const left = (await song.locator('.occurrence-list').boundingBox())!, right = (await song.locator('.occurrence-editor-placeholder').boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    }
    await song.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).press('Enter');
    const songHeader = song.locator('.app-selection-header');
    await expect(songHeader.locator('.occurrence-number')).toHaveText('1');
    await expect(songHeader).not.toContainText('Occurrence');
    await expect(songHeader.locator('strong')).toHaveAttribute('title', 'Verse (1)');
    await checkActions(song.getByRole('region', { name: 'Selected occurrence actions' }), song.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/song-${viewport.width}.png` });
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    const parts = page.locator('app-song-sheet-parts-tab');
    const partAdd = await addButtonAppearance(parts.getByRole('button', { name: 'Add Part', exact: true }));
    if (viewport.width > 700) {
      await expect(parts.locator('.workspace-placeholder .bi')).toBeVisible();
      const left = (await parts.locator('.card').first().boundingBox())!, right = (await parts.locator('.workspace-placeholder').boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    }
    await parts.getByRole('button', { name: 'Select Verse', exact: true }).click();
    const partActions = parts.getByRole('region', { name: 'Selected part actions' });
    await checkActions(partActions, parts.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/parts-${viewport.width}.png` });
    await partActions.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.locator('.measure-row').first().click();
    await checkActions(editor.locator('.selected-measure-toolbar'), editor.locator('.measure-row.is-selected'));
    await page.screenshot({ path: `${evidence}/measures-${viewport.width}.png` });
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    const path = editor.locator('.workspace-path'), preview = measure.locator('.editor-preview');
    for (const scroll of [0, 60, 180]) {
      await page.locator('.app-content-container').evaluate((element, amount) => { element.scrollTop += amount; }, scroll);
      const pathBox = (await path.boundingBox())!, previewBox = (await preview.boundingBox())!;
      expect(previewBox.y).toBeGreaterThanOrEqual(pathBox.y + pathBox.height - 1);
    }
    await page.locator('.app-content-container').evaluate(element => { element.scrollTop = 0; });
    await path.scrollIntoViewIfNeeded();
    for (const label of ['Collapse preview', 'Expand preview']) {
      const play = (await measure.getByRole('button', { name: 'Play measure', exact: true }).boundingBox())!;
      const toggle = measure.getByRole('button', { name: label, exact: true });
      const box = (await toggle.boundingBox())!;
      expect([play.width, play.height, box.width, box.height]).toEqual([32, 32, 32, 32]);
      await toggle.click();
    }
    await measure.locator('.modal-body').evaluate(element => { element.scrollTop = 700; });
    await page.screenshot({ path: `${evidence}/preview-${viewport.width}.png` });
    await path.getByRole('button', { name: 'Back to part', exact: true }).click();
    await editor.getByRole('button', { name: 'Back to parts', exact: true }).click();
    await page.getByRole('tab', { name: 'Grips', exact: true }).click();
    const grips = page.locator('app-song-sheet-grips-tab');
    expect(await addButtonAppearance(grips.getByRole('button', { name: 'Add Grip', exact: true }))).toEqual(partAdd);
    await expect(grips.locator('.library-select .bi-circle, .library-select .bi-check-circle-fill')).toHaveCount(0);
    await expect(grips.getByRole('region')).toHaveCount(0);
    await grips.getByRole('button', { name: 'Select grip C', exact: true }).press('Space');
    await checkActions(grips.getByRole('region', { name: 'Selected grip actions' }), grips.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/grips-${viewport.width}.png` });
    await grips.locator('.app-selection-close').click();
    await expect(grips.locator('.is-selected')).toHaveCount(0);
    await expect(grips.getByRole('region', { name: 'Selected grip actions' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    const patterns = page.locator('app-song-sheet-patterns-tab');
    expect(await addButtonAppearance(patterns.getByRole('button', { name: 'Add Pattern', exact: true }))).toEqual(partAdd);
    await expect(patterns.locator('.library-select .bi-circle, .library-select .bi-check-circle-fill')).toHaveCount(0);
    await patterns.getByRole('button', { name: 'Select pattern One', exact: true }).click();
    const actions = patterns.getByRole('region', { name: 'Selected pattern actions' });
    await checkActions(actions, patterns.locator('.is-selected'));
    await page.screenshot({ path: `${evidence}/patterns-${viewport.width}.png` });
    await actions.getByRole('button', { name: 'Copy pattern', exact: true }).click();
    await expect(patterns.locator('.card')).toHaveCount(3);
    await expect(actions).toContainText('One');
    await patterns.getByRole('button', { name: 'Select pattern Two', exact: true }).press('Enter');
    await expect(actions).toContainText('Two');
    await actions.getByRole('button', { name: 'Delete pattern', exact: true }).click();
    await expect(patterns.locator('.card')).toHaveCount(2);
    await expect(actions).toHaveCount(0);
    await patterns.getByRole('button', { name: 'Select pattern One', exact: true }).click();
    await actions.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(actions).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('touch preview controls share the larger hit target', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await seed(page);
    await page.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
    const actions = page.getByRole('region', { name: 'Selected occurrence actions' });
    await checkActionLayout(actions, 44);
    await page.screenshot({ path: `${evidence}/touch-action-columns.png` });
    for (const button of await actions.getByRole('button').all()) {
      const box = (await button.boundingBox())!; expect([box.width, box.height]).toEqual([44, 44]);
    }
    await actions.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.locator('.measure-row').first().click();
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    for (const label of ['Play measure', 'Collapse preview']) {
      const box = (await measure.getByRole('button', { name: label, exact: true }).boundingBox())!;
      expect([box.width, box.height]).toEqual([44, 44]);
    }
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByRole('button', { name: 'Select Verse', exact: true }).click();
    const partActions = page.getByRole('region', { name: 'Selected part actions' });
    await expect(partActions).toBeInViewport({ ratio: 1 });
    await checkActionLayout(partActions, 44);
    expect(await partActions.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally { await context.close(); }
});


test('warm translucent actions retain contrast when disabled, hovered, pressed and focused', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page);
  await page.getByRole('button', { name: 'Verse, occurrence 1', exact: true }).click();
  const actions = page.getByRole('region', { name: 'Selected occurrence actions' });
  const states: Record<string, Awaited<ReturnType<typeof actionSamples>>> = {};
  states['idle'] = await checkActionContrast(actions);
  await expect(actions.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
  const edit = actions.getByRole('button', { name: 'Edit', exact: true });
  const remove = actions.getByRole('button', { name: 'Remove occurrence', exact: true });
  for (const button of [actions.locator('.app-selection-close'), edit, remove]) {
    await button.hover();
    states[`${await button.getAttribute('aria-label')}-hover`] = await checkActionContrast(actions);
    await page.mouse.down();
    try { states[`${await button.getAttribute('aria-label')}-pressed`] = await checkActionContrast(actions); }
    finally {
      await page.mouse.move(0, 0); // Release outside so no editor/removal action runs.
      await page.mouse.up();
    }
  }
  await edit.focus(); await edit.press('Tab');
  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS('outline-style', 'solid');
  await expect(remove).toHaveCSS('outline-width', '2px');
  states['keyboard-focus'] = await checkActionContrast(actions);
  await page.screenshot({ path: `${evidence}/warm-actions-keyboard.png` });
  await writeFile(`${evidence}/warm-action-contrast.json`, JSON.stringify(states, null, 2));
});
