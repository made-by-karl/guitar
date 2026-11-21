import { expect, Locator, Page } from '@playwright/test';

async function discardAndReturn(page: Page, child: Locator, saveLabel: string, discardLabel: string): Promise<void> {
  const path = page.getByRole('navigation', { name: 'Editor navigation' }).filter({ has: page.getByRole('button', { name: saveLabel, exact: true }) });
  await path.getByRole('button', { name: /^Back to/ }).click();
  const choice = page.locator('app-song-sheet-choice-modal');
  await expect.poll(async () => await child.count() === 0 || await choice.isVisible()).toBe(true);
  if (await choice.isVisible()) await choice.getByRole('button', { name: discardLabel, exact: true }).click();
  await expect(child).toHaveCount(0);
}

export async function cancelMeasure(page: Page): Promise<void> {
  await discardAndReturn(page, page.locator('app-song-part-measure-editor-modal'), 'Apply to part', 'Discard measure changes');
}

export async function cancelSongPattern(page: Page): Promise<void> {
  await discardAndReturn(page, page.locator('app-song-pattern-workspace'), 'Save Pattern', 'Discard changes');
}
