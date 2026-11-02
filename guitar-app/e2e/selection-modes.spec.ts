import { expect, Page, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';

async function storedSheet(page: Page): Promise<SongSheet> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('GuitarAppDatabase'); request.onsuccess = () => resolve(request.result); });
    const sheet = await new Promise<SongSheet>(resolve => { const request = database.transaction('songSheets').objectStore('songSheets').getAll(); request.onsuccess = () => resolve(request.result[0]); });
    database.close(); return sheet;
  });
}

async function createSheet(page: Page, name: string) {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).click();
}

for (const width of [390, 1280]) {
  test(`selects one pattern for a part and multiple for the sheet library at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await createSheet(page, 'Pattern selection modes');
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Import pattern from library', exact: true }).click();
    const picker = page.locator('app-pattern-library-selector-modal');
    const radios = picker.getByRole('radio', { name: /^Select pattern / });
    await expect(picker.getByRole('button', { name: 'Apply Pattern', exact: true })).toBeDisabled();
    await radios.nth(0).click();
    await radios.nth(1).click();
    await expect(picker.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false');
    const selectedName = (await radios.nth(1).locator('.card-title').textContent())!.trim();
    await radios.nth(1).press('ArrowLeft');
    await expect(radios.nth(0)).toBeFocused();
    await radios.nth(0).press('ArrowRight');
    await expect(radios.nth(1)).toBeFocused();
    await picker.getByRole('button', { name: 'Apply Pattern', exact: true }).click();
    await expect(editor.locator('.measure-row').first()).toBeVisible();
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(async () => (await storedSheet(page)).parts[0].measures.length).toBeGreaterThan(0);
    const single = await storedSheet(page);
    expect(single.patterns).toHaveLength(1);
    expect(single.patterns[0].name).toBe(selectedName);
    expect(single.parts[0].measures).toHaveLength(single.patterns[0].measures.length);

    await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await page.getByRole('button', { name: /Add Pattern$/ }).click();
    await page.getByRole('button', { name: 'Import from library', exact: true }).click();
    const checkboxes = picker.getByRole('checkbox', { name: /^Select pattern / });
    await checkboxes.nth(0).click(); await checkboxes.nth(1).click();
    await expect(picker.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(2);
    await picker.getByRole('button', { name: 'Apply Patterns', exact: true }).click();
    await expect.poll(async () => (await storedSheet(page)).patterns.length).toBe(3);
  });

  test(`selects one grip for an action and multiple for the grip library at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await createSheet(page, 'Grip selection modes');
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'New measure', exact: true }).click();
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const measure = page.locator('app-song-part-measure-editor-modal');
    await measure.locator('.action-grip-button').first().click();
    await page.getByRole('button', { name: /Grip From Chord/ }).click();
    const picker = page.locator('app-grip-selector-modal');
    await picker.getByLabel('Root:', { exact: true }).selectOption('D');
    const radios = picker.getByRole('radio', { name: /^Select grip / });
    await radios.nth(0).click(); await radios.nth(1).click();
    await expect(picker.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false');
    await page.screenshot({ path: testInfo.outputPath(`single-grip-${width}.png`), fullPage: true });
    await picker.getByRole('button', { name: 'Apply Grip', exact: true }).click();
    await expect(measure.locator('.action-grip-button').first()).toContainText('D');
    await measure.getByRole('button', { name: /Apply to part$/ }).click();
    await expect(editor.locator('.part-save-status')).toHaveText('Unsaved changes');
    expect((await storedSheet(page)).parts[0].measures).toHaveLength(0);
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(async () => (await storedSheet(page)).parts[0].measures[0].measure.actionGrips?.length).toBe(1);
    const single = await storedSheet(page);
    expect(single.grips).toHaveLength(1);
    expect(single.parts[0].measures[0].measure.actionGrips?.[0].gripId).toBe(single.grips[0].gripId);

    await page.getByRole('tab', { name: 'Grips', exact: true }).click();
    await page.getByRole('button', { name: /Add Grip$/ }).click();
    await page.getByRole('button', { name: /Grip From Chord/ }).click();
    await picker.getByLabel('Root:', { exact: true }).selectOption('C');
    const checkboxes = picker.getByRole('checkbox', { name: /^Select grip / });
    await checkboxes.nth(0).click(); await checkboxes.nth(1).click();
    await expect(picker.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(2);
    await picker.getByRole('button', { name: 'Apply Grips', exact: true }).click();
    await expect.poll(async () => (await storedSheet(page)).grips.length).toBe(3);
  });
}
