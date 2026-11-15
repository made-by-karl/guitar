import { expect, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function trackMedia(page: Page, rejectFirstPlay = false) {
  await page.addInitScript(reject => {
    const elements: HTMLAudioElement[] = [];
    Object.assign(window, { feedbackMedia: elements });
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) { const audio = new Target(...args); elements.push(audio); return audio; }
    });
    if (reject) {
      const play = HTMLMediaElement.prototype.play;
      let rejected = false;
      HTMLMediaElement.prototype.play = function() {
        if (!rejected) { rejected = true; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
        return play.call(this);
      };
    }
  }, rejectFirstPlay);
}

async function isPlaying(page: Page) {
  return page.evaluate(() => (window as unknown as { feedbackMedia: HTMLAudioElement[] }).feedbackMedia.some(a => !a.paused && a.currentTime > 0.05));
}

async function finishStart(page: Page) {
  const ready = page.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await isPlaying(page) || await ready.isVisible()).toBe(true);
  if (!await isPlaying(page) && await ready.isVisible()) await ready.click();
  await expect.poll(() => isPlaying(page)).toBe(true);
}

test('MIDI opts into the overlay; normal metronome playback has no status panel and navigation still stops it', async ({ page }) => {
  await trackMedia(page);
  await page.goto('/maintenance/midi-test');
  await page.getByRole('button', { name: 'E Major Triad', exact: true }).click();
  await finishStart(page);
  await expect(page.locator('app-media-playback-controls.overlay')).toContainText('Playing');
  await page.getByRole('link', { name: /Metronome/ }).first().click();
  expect(await page.evaluate(() => (window as unknown as { feedbackMedia: HTMLAudioElement[] }).feedbackMedia.every(a => a.paused && !a.getAttribute('src')))).toBe(true);
  await expect(page.locator('app-media-playback-controls.overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await finishStart(page);
  await expect(page.locator('app-media-playback-controls section')).toHaveCount(0);
  await page.getByRole('link', { name: /Playing Patterns/ }).first().click();
  await expect(page).toHaveURL(/\/patterns$/);
  expect(await page.evaluate(() => (window as unknown as { feedbackMedia: HTMLAudioElement[] }).feedbackMedia.every(a => a.paused && !a.getAttribute('src')))).toBe(true);
});

for (const width of [375, 768, 1280]) {
  test(`blocked playback recovers inline and disappears after Play at ${width}px`, async ({ page }) => {
    await trackMedia(page, true);
    await page.setViewportSize({ width, height: width === 375 ? 667 : 1024 });
    await page.goto('/metronome');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const panel = page.locator('app-media-playback-controls');
    await expect(panel.getByRole('button', { name: 'Play prepared audio', exact: true })).toBeVisible();
    expect(await panel.evaluate(element => getComputedStyle(element).position)).not.toBe('fixed');
    await mkdir('../temp/ux/page-playback-controls', { recursive: true });
    await page.screenshot({ path: `../temp/ux/page-playback-controls/inline-${width}.png`, fullPage: true });
    await panel.getByRole('button', { name: 'Play prepared audio', exact: true }).click();
    await expect.poll(() => isPlaying(page)).toBe(true);
    await expect(panel.locator('section')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { feedbackMedia: HTMLAudioElement[] }).feedbackMedia.length)).toBe(1);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });
}

test('an inline source error can be retried without enabling the floating panel', async ({ page }) => {
  await trackMedia(page);
  await page.route('**/samples/metronome/*.mp3', route => route.abort());
  await page.goto('/metronome');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const panel = page.locator('app-media-playback-controls');
  await expect(panel.getByRole('button', { name: 'Retry playback', exact: true })).toBeVisible();
  await expect(page.locator('app-media-playback-controls.overlay')).toHaveCount(0);
  await page.unroute('**/samples/metronome/*.mp3');
  await panel.getByRole('button', { name: 'Retry playback', exact: true }).click();
  const ready = panel.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await isPlaying(page) || await ready.isVisible()).toBe(true);
  if (await ready.isVisible()) await ready.click();
  await expect.poll(() => isPlaying(page)).toBe(true);
  await expect(panel.locator('section')).toHaveCount(0);
});

for (const width of [375, 1280]) {
test(`a blocked grip preview recovers inside its dialog and closing releases audio at ${width}px`, async ({ page }) => {
  await trackMedia(page, true);
  await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Playback recovery');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: 'Playback recovery', exact: true }).click();
  await page.getByRole('tab', { name: 'Grips', exact: true }).click();
  await page.getByRole('button', { name: /Add Grip$/ }).click();
  await page.getByRole('button', { name: /Custom Grip Build/ }).click();
  const editor = page.locator('app-custom-grip-editor-modal');
  await editor.getByLabel('Press Type').first().selectOption({ label: 'Open' });
  await editor.getByRole('button', { name: 'Play Grip', exact: true }).click();
  const recovery = editor.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect(recovery).toBeVisible();
  const bounds = await recovery.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(width === 375 ? 667 : 900);
  await mkdir('../temp/ux/page-playback-controls', { recursive: true });
  await page.screenshot({ path: `../temp/ux/page-playback-controls/dialog-${width}.png`, fullPage: true });
  await expect(page.locator('app-media-playback-controls.overlay')).toHaveCount(0);
  await expect(page.locator('.page-playback-feedback')).toHaveCount(0);
  await recovery.click();
  await expect.poll(() => isPlaying(page)).toBe(true);
  await expect(editor.locator('app-media-playback-controls section')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.page-playback-feedback')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { feedbackMedia: HTMLAudioElement[] }).feedbackMedia.every(a => a.paused && !a.getAttribute('src')))).toBe(true);
});
}

test('grip and pattern previews use their page controls without a playing popup', async ({ page }) => {
  await trackMedia(page);
  await page.goto('/grips/C');
  await page.getByRole('button', { name: /Play Chord$/ }).first().click();
  await finishStart(page);
  await expect(page.locator('app-media-playback-controls section')).toHaveCount(0);
  await page.getByRole('link', { name: /Playing Patterns/ }).first().click();
  await page.getByRole('button', { name: /Play$/ }).first().click();
  await finishStart(page);
  await expect(page.locator('app-media-playback-controls.overlay')).toHaveCount(0);
  await expect(page.locator('app-media-playback-controls section')).toHaveCount(0);
});
