import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 741 },
  { width: 390, height: 568 },
  { width: 1280, height: 900 }
]) {
  test(`keeps the custom grip preview clear of the scrolling form at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/sheets');
    await page.getByPlaceholder('New Song Sheet Name').fill('Custom grip layout');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('link', { name: 'Custom grip layout', exact: true }).click();
    await page.getByRole('tab', { name: 'Grips', exact: true }).click();
    await page.getByRole('button', { name: /Add Grip$/ }).click();
    await page.getByRole('button', { name: /Custom Grip Build/ }).click();

    const editor = page.locator('app-custom-grip-editor-modal');
    const preview = editor.getByRole('region', { name: 'Grip preview' });
    const form = editor.locator('.editor-stack');
    const name = editor.getByRole('textbox', { name: 'Grip Name' });
    const play = preview.getByRole('button', { name: 'Play Grip', exact: true });
    const notes = preview.getByRole('group', { name: 'String notes' });
    await expect(name).toBeVisible();
    await expect(preview).not.toContainText(/Preview|Unnamed Grip|6 strings/);
    await expect(notes.locator('.note')).toHaveText(['x,', 'x,', 'x,', 'x,', 'x,', 'x']);
    await expect(play).toBeDisabled();
    await expect(editor.getByLabel('Fret', { exact: true })).toHaveCount(0);
    await name.fill('Mobile grip');

    const previewBox = (await preview.boundingBox())!;
    const formBox = (await form.boundingBox())!;
    const svgBox = (await preview.locator('svg').boundingBox())!;
    expect(svgBox.y).toBeGreaterThanOrEqual(previewBox.y);
    expect(svgBox.y + svgBox.height).toBeLessThanOrEqual(previewBox.y + previewBox.height);
    if (viewport.width < 768) {
      expect(previewBox.height).toBeLessThan(170);
      expect(formBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height);
      expect(formBox.height).toBeGreaterThan(previewBox.height);
    } else {
      expect(previewBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
    }
    await page.screenshot({ path: testInfo.outputPath('custom-grip-top.png') });

    const lastString = editor.locator('.string-card').last();
    await lastString.getByLabel('Press Type').scrollIntoViewIfNeeded();
    await lastString.getByLabel('Press Type').selectOption({ label: 'Open' });
    await expect(lastString.locator('option:checked')).toHaveText('Open');
    expect(await form.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect((await preview.boundingBox())!.y).toBeCloseTo(previewBox.y, 0);
    await expect(preview.locator('svg text').last()).toHaveText('o');
    await expect(notes.locator('.note').last()).toHaveText('E4');
    await expect(play).toBeEnabled();
    const playBox = (await play.boundingBox())!;
    expect(playBox.y).toBeGreaterThanOrEqual(previewBox.y);
    expect(playBox.y + playBox.height).toBeLessThanOrEqual(previewBox.y + previewBox.height);
    const lastStringBox = (await lastString.getByLabel('Press Type').boundingBox())!;
    if (viewport.width < 768) {
      expect(lastStringBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height);
    }
    await page.screenshot({ path: testInfo.outputPath('custom-grip-scrolled.png') });

    await lastString.getByLabel('Press Type').selectOption({ label: 'Single Press' });
    await lastString.getByLabel('Fret', { exact: true }).fill('3');
    await expect(notes.locator('.note').last()).toHaveText('G4');
    const firstString = editor.locator('.string-card').first();
    await firstString.getByLabel('Press Type').selectOption({ label: 'Single Press' });
    await lastString.getByLabel('Fret', { exact: true }).fill('6');
    const rangeError = preview.getByRole('alert');
    await expect(rangeError).toHaveText('Frets 1–6 exceed the 5-fret diagram.');
    await expect(preview.locator('.diagram-error-backdrop svg')).toHaveCount(1);
    await expect(preview.locator('svg circle, svg text')).toHaveCount(0);
    expect(await rangeError.evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
    if (viewport.width < 768) {
      expect((await preview.boundingBox())!.height).toBeLessThan(170);
    }
    await page.screenshot({ path: testInfo.outputPath('custom-grip-range-error.png') });
    await lastString.getByLabel('Fret', { exact: true }).fill('5');
    await expect(rangeError).toHaveCount(0);
    await expect(preview.locator('svg circle')).toHaveCount(2);
    await firstString.getByLabel('Press Type').selectOption({ label: 'Muted' });
    await lastString.getByLabel('Fret', { exact: true }).fill('3');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Open' });
    await expect(lastString.getByLabel('Fret', { exact: true })).toHaveCount(0);
    const linkName = editor.getByRole('button', { name: 'Link grip name to frets', exact: true });
    await linkName.click();
    await expect(linkName).toHaveAttribute('aria-pressed', 'true');
    await expect(name).toBeDisabled();
    await expect(name).toHaveValue('xxxxx0');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Single Press' });
    await expect(name).toHaveValue('xxxxx3');
    await lastString.getByLabel('Fret', { exact: true }).fill('5');
    await expect(name).toHaveValue('xxxxx5');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Muted' });
    await expect(name).toHaveValue('xxxxxx');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Open' });
    await linkName.click();
    await expect(linkName).toHaveAttribute('aria-pressed', 'false');
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue('xxxxx0');
    await name.fill('Custom name');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Single Press' });
    await expect(name).toHaveValue('Custom name');
    await lastString.getByLabel('Press Type').selectOption({ label: 'Open' });
    await linkName.click();
    await expect(name).toHaveValue('xxxxx0');
    await expect(name).toBeDisabled();
    expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('custom-grip-linked.png') });

    await editor.getByRole('button', { name: 'Save Grip', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const library = page.locator('app-song-sheet-grips-tab');
    await expect(library.locator('.grip-title')).toHaveText('xxxxx0');
    const savedDiagramBox = (await library.locator('svg').boundingBox())!;
    expect(savedDiagramBox.width).toBe(140);
    expect(savedDiagramBox.height).toBe(210);
  });
}

test('uses song tuning and capo in the custom grip preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 741 });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Tuned grip');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: 'Tuned grip', exact: true }).click();
  await page.getByRole('tab', { name: 'Tempo & Tuning', exact: true }).click();
  await page.getByLabel('Capodaster (Fret)', { exact: true }).fill('2');
  await page.getByLabel('String 6 note', { exact: true }).selectOption('D');
  await page.getByLabel('String 6 octave', { exact: true }).selectOption('2');
  await expect(page.locator('app-song-tuning-editor').getByRole('status')).toHaveText('All changes saved automatically.');
  await page.getByRole('tab', { name: 'Grips', exact: true }).click();
  await page.getByRole('button', { name: /Add Grip$/ }).click();
  await page.getByRole('button', { name: /Custom Grip Build/ }).click();

  const editor = page.locator('app-custom-grip-editor-modal');
  const strings = editor.locator('.string-card');
  await strings.first().getByLabel('Press Type').selectOption({ label: 'Open' });
  await strings.last().getByLabel('Press Type').selectOption({ label: 'Open' });
  await expect(editor.getByRole('group', { name: 'String notes' }).locator('.note'))
    .toHaveText(['E2,', 'x,', 'x,', 'x,', 'x,', 'F#4']);
  await expect(editor.getByRole('button', { name: 'Play Grip', exact: true })).toBeEnabled();
  await expect(editor.getByRole('button', { name: 'Save Grip', exact: true })).toBeDisabled();
});
