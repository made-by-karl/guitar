import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`uses compact song-sheet tabs and saves settings and links at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Tab test');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('link', { name: 'Tab test', exact: true }).click();
    const sheet = page.locator('app-song-sheet');
    const tabs = sheet.getByRole('tablist', { name: 'Song sheet sections' });
    await expect(tabs.getByRole('tab')).toHaveCount(6);
    const labels = ['Song', 'Parts', 'Grips', 'Patterns', 'Tempo & Tuning', 'Links'];
    for (const label of labels) {
      const tab = tabs.getByRole('tab', { name: label, exact: true });
      await expect(tab).toBeVisible();
      await expect(tab.locator('i')).toBeVisible();
      if (width < 576) {
        await expect(tab.locator('.sheet-tab-label')).toBeHidden();
      } else {
        await expect(tab.locator('.sheet-tab-label')).toBeVisible();
      }
      expect(await tab.evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px');
    }
    expect(await tabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(sheet.locator('.sheet-links')).toHaveCount(0);
    await expect(sheet.locator('app-song-tuning-editor')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`song-sheet-tabs-${width}.png`), fullPage: true });

    await tabs.getByRole('tab', { name: 'Grips', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'Grip Library' })).toBeVisible();
    await tabs.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await expect(sheet.locator('app-song-sheet-patterns-tab')).toBeVisible();
    await tabs.getByRole('tab', { name: 'Tempo & Tuning', exact: true }).click();
    await expect(page.locator('.cdk-overlay-pane')).toHaveCount(0);
    await sheet.getByLabel('Capodaster (Fret)', { exact: true }).fill('2');
    await sheet.getByLabel('BPM selection mode', { exact: true }).selectOption('custom');
    await sheet.getByLabel('Custom BPM', { exact: true }).fill('112');
    await sheet.getByLabel('String 6 note', { exact: true }).selectOption('D');
    await sheet.getByLabel('String 6 octave', { exact: true }).selectOption('3');
    await tabs.getByRole('tab', { name: 'Links', exact: true }).click();
    await tabs.getByRole('tab', { name: 'Tempo & Tuning', exact: true }).click();
    await expect(sheet.getByLabel('Capodaster (Fret)', { exact: true })).toHaveValue('2');
    await expect(sheet.getByLabel('String 6 note', { exact: true })).toHaveValue('D');
    await expect(sheet.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Save Settings', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('status')).toHaveText('All changes saved automatically.');
    // Wait for the browser transaction to finish before navigating away.
    await expect.poll(() => page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('GuitarAppDatabase');
        request.onsuccess = () => resolve(request.result);
      });
      const settings = await new Promise<{ capodaster: number; tempo: number; tuning: { semitone: string; octave: number }[] }>(resolve => {
        const request = database.transaction('songSheets').objectStore('songSheets').getAll();
        request.onsuccess = () => resolve(request.result[0]);
      });
      database.close();
      return { capo: settings.capodaster, tempo: settings.tempo, bass: settings.tuning[0] };
    })).toEqual({ capo: 2, tempo: 112, bass: { semitone: 'D', octave: 3 } });
    await page.reload();
    await tabs.getByRole('tab', { name: 'Tempo & Tuning', exact: true }).click();
    await expect(sheet.getByLabel('Capodaster (Fret)', { exact: true })).toHaveValue('2');
    await expect(sheet.getByLabel('Custom BPM', { exact: true })).toHaveValue('112');
    await expect(sheet.getByLabel('String 6 note', { exact: true })).toHaveValue('D');
    await expect(sheet.getByLabel('String 6 octave', { exact: true })).toHaveValue('3');
    await page.screenshot({ path: testInfo.outputPath(`song-sheet-tuning-${width}.png`), fullPage: true });

    await tabs.getByRole('tab', { name: 'Links', exact: true }).click();
    await sheet.getByRole('button', { name: /Add Link$/ }).click();
    const linkEditor = page.locator('app-song-sheet-link-editor-modal');
    await linkEditor.getByLabel('URL', { exact: true }).click();
    await linkEditor.getByLabel('URL', { exact: true }).fill('https://example.com/lesson');
    await linkEditor.getByLabel('Description', { exact: true }).fill('Practice lesson');
    await linkEditor.getByRole('button', { name: 'Save Link', exact: true }).click();
    await expect(linkEditor).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: 'Practice lesson', exact: true })).toHaveAttribute('href', 'https://example.com/lesson');
    await page.reload();
    await tabs.getByRole('tab', { name: 'Parts', exact: true }).press('End');
    await expect(tabs.getByRole('tab', { name: 'Links', exact: true })).toBeFocused();
    await expect(sheet.getByRole('link', { name: 'Practice lesson', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
