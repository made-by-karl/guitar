import { expect, Locator, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import fixture from '../test/fixtures/long-grip-labels.json';
import { parseTransferFile } from '../src/app/core/services/data-transfer-format';

async function assertSeparateBands(notation: Locator) {
  await expect.poll(() => notation.evaluate(element => {
    const labels = [...element.querySelectorAll('.action-grip-label')].map(label => label.getBoundingClientRect());
    const marks = [...element.querySelectorAll('.modifier')].map(mark => mark.getBoundingClientRect());
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const problems: string[] = [];
    for (const [index, mark] of marks.entries()) {
      if (labels.some(label => overlaps(label, mark))) problems.push('Chord overlaps modifier');
      if (marks.slice(index + 1).some(other => overlaps(mark, other))) problems.push('Modifiers overlap');
    }
    for (const svg of element.querySelectorAll('.action-svg')) {
      const top = svg.getBoundingClientRect().top;
      const staffTop = Math.min(...[...svg.querySelectorAll('.string-line')].map(line => line.getBoundingClientRect().top));
      for (const mark of svg.querySelectorAll('.modifier')) {
        const box = mark.getBoundingClientRect();
        if (box.top < top || box.bottom >= staffTop - 3) problems.push('Modifier outside its band');
      }
    }
    const staffTops = [...element.querySelectorAll('.action-svg')].map(svg =>
      Math.min(...[...svg.querySelectorAll('.string-line')].map(line => line.getBoundingClientRect().top)));
    for (const leader of element.querySelectorAll<SVGPolylineElement>('.grip-label-leaders polyline')) {
      const end = leader.points.getItem(leader.points.numberOfItems - 1);
      const point = new DOMPoint(end.x, end.y).matrixTransform(leader.getScreenCTM()!);
      if (!staffTops.some(top => Math.abs(top - point.y - 3) < 1)) problems.push('Chord leader stops before the action');
    }
    return problems;
  })).toEqual([]);
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`chord and modifier bands stay separate in the score and live preview at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const file = parseTransferFile(JSON.stringify(fixture), 'guitar-song-sheet');
    if (file.format !== 'guitar-song-sheet') throw new Error('Expected song fixture');
    for (const entry of file.data.parts[0].measures) {
      for (const action of entry.measure.actions) {
        if (action) { action.articulation = 'palm-mute'; action.modifiers = ['accent']; }
      }
    }
    await page.goto('/sheets');
    await page.locator('input[type=file]').setInputFiles({ name: 'articulations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.getByRole('button', { name: 'Import copy', exact: true }).click();
    await page.getByRole('link', { name: 'Long grip labels', exact: true }).click();
    await page.getByRole('tab', { name: 'Parts', exact: true }).click();
    await page.locator('app-song-sheet-parts-tab').getByRole('button', { name: /Edit$/ }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    const scores = editor.locator('app-playing-actions');
    await expect(scores.first().locator('.modifier')).not.toHaveCount(0);
    for (const score of await scores.all()) await assertSeparateBands(score);
    await mkdir('../temp/ux/mobile-articulations', { recursive: true });
    await editor.locator('.measure-sequence').screenshot({ path: `../temp/ux/mobile-articulations/score-${viewport.width}.png` });
    await editor.locator('.measure-row').last().click();
    await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
    const modal = page.locator('app-song-part-measure-editor-modal');
    const preview = modal.locator('app-measure-editor-preview app-playing-actions');
    await expect(preview.locator('.action-grip-label')).toHaveText(['Em']);
    await assertSeparateBands(preview);
    const first = modal.locator('.action-position').first();
    const choices = first.locator('.articulation-choices');
    await choices.scrollIntoViewIfNeeded();
    expect((await choices.boundingBox())!.height).toBeLessThanOrEqual(64);
    await first.getByLabel('Palm Mute', { exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(first.getByLabel('Palm Mute', { exact: true })).not.toBeChecked();
    await assertSeparateBands(preview);
    await page.keyboard.press('Space');
    await expect(first.getByLabel('Palm Mute', { exact: true })).toBeChecked();
    await assertSeparateBands(preview);
    await page.screenshot({ path: `../temp/ux/mobile-articulations/editor-${viewport.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await modal.getByRole('button', { name: 'Clear Grips', exact: true }).click();
    await expect(preview.locator('.action-grip-label')).toHaveCount(0);
    await assertSeparateBands(preview);
    await modal.getByRole('button', { name: /Cancel$/ }).click();
    expect(errors).toEqual([]);
  });
}
