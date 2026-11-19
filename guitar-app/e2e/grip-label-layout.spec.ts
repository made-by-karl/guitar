import { expect, Locator, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import fixture from '../test/fixtures/long-grip-labels.json';

const names = ['087xxx', '01010xxx', '0109xxx', '000xxx', 'Em'];
const strumIndices = fixture.data.parts[0].measures.flatMap(entry => entry.measure.actions)
  .flatMap((action, index) => action ? [index] : []);

async function importExample(page: Page) {
  await page.goto('/sheets');
  await page.locator('input[type=file]').setInputFiles('test/fixtures/long-grip-labels.json');
  await page.getByRole('button', { name: 'Import copy', exact: true }).click();
  await page.getByRole('link', { name: 'Long grip labels', exact: true }).click();
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
}

async function assertReadable(notation: Locator, expectedNames: string[], actionIndices: number[], slotSpacing = 22) {
  await expect(notation.locator('.action-grip-label')).toHaveText(expectedNames);
  await expect.poll(() => notation.evaluate((element, { indices, spacing }) => {
    const problems: string[] = [];
    const container = element.querySelector('.notation-scroll')!;
    const bounds = container.getBoundingClientRect();
    const labels = [...container.querySelectorAll<HTMLElement>('.action-grip-label')];
    const stems = [...container.querySelectorAll<SVGLineElement>('.strum-stem')];
    const point = (stem: SVGLineElement) => {
      const position = new DOMPoint(Number(stem.getAttribute('x1')), Number(stem.getAttribute('y1')))
        .matrixTransform(stem.getScreenCTM()!);
      return { x: position.x, y: stem.ownerSVGElement!.getBoundingClientRect().top };
    };
    for (const [index, label] of labels.entries()) {
      const rect = label.getBoundingClientRect();
      if (getComputedStyle(label).visibility !== 'visible') problems.push('Label not laid out');
      if (rect.left < bounds.left + 1 || rect.right > bounds.right - 1 || rect.top < bounds.top + 1) {
        problems.push(`Clipped name: ${label.textContent}`);
      }
      if (label.scrollWidth > label.clientWidth + 1) problems.push('Text overflows label');
      const actionIndex = Number(label.dataset['actionIndex']);
      const stem = stems[indices.indexOf(actionIndex)];
      if (!stem) { problems.push('Missing action'); continue; }
      const anchor = point(stem);
      const staffTop = Math.min(...[...stem.ownerSVGElement!.querySelectorAll('.string-line')]
        .map(line => Number(line.getAttribute('y1'))));
      if (rect.top < anchor.y || rect.bottom >= anchor.y + staffTop) problems.push('Label outside its row band');
      const leader = container.querySelector<SVGPolylineElement>(`polyline[data-action-index="${actionIndex}"]`);
      if (leader) {
        const end = leader.points.getItem(leader.points.numberOfItems - 1);
        if (Math.abs(end.x + bounds.left + container.clientLeft - anchor.x) > 1) problems.push('Leader misses action');
        if (Math.abs(end.y + bounds.top + container.clientTop - anchor.y - staffTop + 3) > 1) problems.push('Leader misses row');
      } else if (Math.abs(rect.left + rect.width / 2 - anchor.x) > 1) {
        problems.push('Shifted label has no leader');
      }
      for (const other of labels.slice(index + 1)) {
        const next = other.getBoundingClientRect();
        if (rect.left < next.right && rect.right > next.left && rect.top < next.bottom && rect.bottom > next.top) {
          problems.push(`Overlapping names: ${label.textContent}, ${other.textContent}`);
        }
      }
    }
    for (let index = 1; index < stems.length; index++) {
      const previous = point(stems[index - 1]), current = point(stems[index]);
      if (Math.abs(previous.y - current.y) < 1
        && Math.abs(current.x - previous.x - (indices[index] - indices[index - 1]) * spacing) > 1) {
        problems.push('Changed rhythmic spacing');
      }
    }
    if (container.scrollWidth > container.clientWidth) problems.push('Notation overflows');
    return problems;
  }, { indices: actionIndices, spacing: slotSpacing })).toEqual([]);
}

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`full custom grip names stay readable across wrapped rows at ${viewport.width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await importExample(page);
    await page.locator('app-song-sheet-parts-tab').getByRole('button', { name: /Edit$/ }).click();
    const editor = page.locator('app-song-part-editor');
    await editor.getByRole('tab', { name: 'Music', exact: true }).click();
    const notation = editor.locator('app-playing-actions');
    await assertReadable(notation.nth(0), names.slice(0, 4), strumIndices.filter(index => index < 16));
    await assertReadable(notation.nth(1), ['Em'], strumIndices.filter(index => index >= 16).map(index => index - 16), 11);
    // A resize reuses the drawing and can move colliding names across row boundaries.
    await page.setViewportSize({ width: viewport.width === 375 ? 1280 : 375, height: 800 });
    await assertReadable(notation.nth(0), names.slice(0, 4), strumIndices.filter(index => index < 16));
    await page.setViewportSize(viewport);
    await assertReadable(notation.nth(0), names.slice(0, 4), strumIndices.filter(index => index < 16));
    await mkdir('../temp/ux/grip-label-layout', { recursive: true });
    await editor.locator('.measure-sequence').screenshot({ path: `../temp/ux/grip-label-layout/editor-${viewport.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('reflows a live assignment longer than the narrow row, then clears the label band', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await importExample(page);
  await page.locator('app-song-sheet-parts-tab').getByRole('button', { name: /Edit$/ }).click();
  const editor = page.locator('app-song-part-editor');
  await editor.getByRole('tab', { name: 'Music', exact: true }).click();
  await editor.locator('.measure-row').first().click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  const modal = page.locator('app-song-part-measure-editor-modal');
  await modal.locator('.action-grip-button').first().click();
  await page.getByRole('button', { name: /Custom Grip Build/ }).click();
  const custom = page.locator('app-custom-grip-editor-modal');
  const longName = 'VeryLongCustomGripNameWithoutSpaces'.repeat(2).slice(0, 60);
  await custom.getByLabel('Press Type', { exact: true }).first().selectOption({ label: 'Open' });
  if (await custom.getByLabel('Grip Name', { exact: true }).isDisabled()) {
    await custom.getByRole('button', { name: 'Link grip name to frets', exact: true }).click();
  }
  await custom.getByLabel('Grip Name', { exact: true }).fill(longName);
  await custom.getByRole('button', { name: 'Save Grip', exact: true }).click();
  await modal.getByRole('button', { name: /Apply to part$/ }).click();
  const notation = editor.locator('app-playing-actions').first();
  await assertReadable(notation, [longName, ...names.slice(1, 4)], strumIndices.filter(index => index < 16));
  expect(await notation.locator('.action-grip-label').first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(15);
  await editor.getByRole('button', { name: 'Clear measure selection', exact: true }).click();
  await notation.screenshot({ path: '../temp/ux/grip-label-layout/multiline-375.png' });

  await editor.locator('.measure-row').first().click();
  await editor.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  await modal.getByRole('button', { name: 'Clear Grips', exact: true }).click();
  await modal.getByRole('button', { name: /Apply to part$/ }).click();
  await expect(notation.locator('.action-grip-label')).toHaveCount(0);
  await expect(notation.locator('.action-svg').first()).toHaveAttribute('viewBox', / 104$/);
});
