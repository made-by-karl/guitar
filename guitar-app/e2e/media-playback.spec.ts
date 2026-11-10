import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { richSheet, transferEnvelope } from '../test/fixtures/data-transfer';

declare global {
  interface Window { mediaElements: HTMLAudioElement[]; }
}
async function trackMedia(page: Page) {
  await page.addInitScript(() => {
    window.mediaElements = [];
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) {
        const audio = new Target(...args);
        window.mediaElements.push(audio);
        return audio;
      }
    });
  });
}
const controls = (page: Page) => page.locator('app-media-playback-controls');
async function audibleMedia(page: Page) {
  // Some engines require a fresh gesture after asynchronous preparation.
  const prepared = controls(page).getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await prepared.isVisible() || await page.evaluate(() => window.mediaElements.some(audio => !audio.paused))).toBe(true);
  const alreadyStarting = await page.evaluate(() => window.mediaElements.some(audio => !audio.paused));
  if (!alreadyStarting && await prepared.isVisible()) await prepared.click();
  await expect.poll(() => page.evaluate(() => window.mediaElements.some(audio => !audio.paused && audio.currentTime > 0.1))).toBe(true);
  return page.evaluate(async () => {
    const audio = window.mediaElements.find(audio => !audio.paused)!;
    const encoded = await (await fetch(audio.src)).arrayBuffer();
    const header = String.fromCharCode(...new Uint8Array(encoded, 0, 4));
    const context = new OfflineAudioContext(1, 1, 24000);
    const decoded = await context.decodeAudioData(encoded);
    const data = decoded.getChannelData(0);
    let peak = 0; for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    return { header, peak, duration: audio.duration, type: (await fetch(audio.src)).headers.get('Content-Type') };
  });
}

test('cold and cached chord playback renders audible WAV media and navigation releases it', async ({ page }) => {
  await trackMedia(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/maintenance/midi-test');
  expect(await page.evaluate(() => window.mediaElements.length)).toBe(0);
  await page.getByRole('button', { name: 'E Major Triad', exact: true }).click();
  const audio = await audibleMedia(page);
  expect(audio.header).toBe('RIFF'); expect(audio.peak).toBeGreaterThan(0.01); expect(audio.type).toContain('audio/wav');
  await controls(page).getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(controls(page).locator('section')).toHaveCount(0);
  await page.getByRole('button', { name: 'E Major Triad', exact: true }).click();
  await audibleMedia(page);
  await page.getByRole('link', { name: /Metronome/ }).first().click();
  await expect(controls(page).locator('section')).toHaveCount(0);
  expect(await page.evaluate(() => window.mediaElements.every(audio => audio.paused && !audio.getAttribute('src')))).toBe(true);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`prepared playback retry and stop remain reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await trackMedia(page);
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      let rejected = false;
      HTMLMediaElement.prototype.play = function() {
        if (!rejected) { rejected = true; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
        return play.call(this);
      };
    });
    await page.goto('/maintenance/midi-test');
    await page.getByRole('button', { name: /Palm Muted/ }).click();
    const play = controls(page).getByRole('button', { name: 'Play prepared audio', exact: true });
    await expect(play).toBeVisible();
    expect(await page.evaluate(() => window.mediaElements.every(audio => audio.paused))).toBe(true);
    const box = await play.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await mkdir('../temp/ux/media-playback', { recursive: true });
    await play.focus();
    await page.screenshot({ path: `../temp/ux/media-playback/ready-${viewport.width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    const result = await audibleMedia(page); expect(result.peak).toBeGreaterThan(0.01);
    expect(await page.evaluate(() => window.mediaElements.length)).toBe(1);
    await controls(page).getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(controls(page).locator('section')).toHaveCount(0);
  });
}

test('failed palm-muted assets produce a retryable error while clean and percussion playback stay independent', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await trackMedia(page);
  await page.route('**/samples/palm-muted/*.wav', route => route.abort());
  await page.goto('/maintenance/midi-test');
  await page.getByRole('button', { name: /Palm Muted/ }).click();
  await expect(controls(page).getByRole('button', { name: 'Retry playback', exact: true })).toBeVisible();
  await mkdir('../temp/ux/media-playback', { recursive: true });
  await page.screenshot({ path: '../temp/ux/media-playback/error-375.png', fullPage: true });
  expect(await page.evaluate(() => window.mediaElements.length)).toBe(0);
  await controls(page).getByRole('button', { name: 'Stop playback', exact: true }).click();
  await page.getByRole('button', { name: 'E Major Triad', exact: true }).click();
  await audibleMedia(page);
  await controls(page).getByRole('button', { name: 'Stop playback', exact: true }).click();
  await page.getByRole('button', { name: /Body Knock/ }).click();
  const percussion = await audibleMedia(page);
  expect(percussion.peak).toBeGreaterThan(0.01);
  const stopPercussion = controls(page).getByRole('button', { name: 'Stop playback', exact: true });
  if (await stopPercussion.isVisible()) await stopPercussion.click();
  await page.unroute('**/samples/palm-muted/*.wav');
  await page.getByRole('button', { name: /Palm Muted/ }).click();
  await expect(controls(page).getByRole('status')).toContainText('Playing');
  await audibleMedia(page);
});

test('metronome loops use media time and apply a prepared tempo without falsely reporting it early', async ({ page }) => {
  await trackMedia(page); await page.goto('/metronome');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await audibleMedia(page);
  await expect(page.locator('.beat.active')).toHaveCount(1);
  const before = await page.evaluate(() => window.mediaElements.find(audio => !audio.paused)!.currentTime);
  await expect.poll(() => page.evaluate(() => window.mediaElements.find(audio => !audio.paused)?.currentTime ?? 0)).toBeGreaterThan(before + 0.25);
  await page.getByLabel('BPM selection mode', { exact: true }).selectOption('custom');
  const input = page.locator('#bpm');
  await input.fill('160'); await input.blur();
  await expect(input).toHaveValue('160');
  await expect.poll(() => page.evaluate(() => window.mediaElements.filter(audio => !audio.paused).length)).toBe(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(await page.evaluate(() => window.mediaElements.every(audio => audio.paused))).toBe(true);
});

test('sheet arrangements follow media pause, resume and completion, including repeated occurrences', async ({ page }) => {
  await trackMedia(page); await page.goto('/sheets');
  await page.locator('app-json-import input[type=file]').setInputFiles({ name: 'song.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(transferEnvelope('guitar-song-sheet', richSheet()))) });
  await page.getByRole('button', { name: 'Import copy', exact: true }).click();
  await page.getByRole('link', { name: 'My song', exact: true }).click();
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await audibleMedia(page);
  await expect(page.locator('.occurrence-row.is-playing')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause song', exact: true }).click();
  expect(await page.evaluate(() => window.mediaElements.every(audio => audio.paused))).toBe(true);
  await page.getByRole('button', { name: 'Resume song', exact: true }).click();
  await audibleMedia(page);
  // Seek the existing media into the second occurrence rather than re-rendering notes.
  await page.evaluate(() => { window.mediaElements.find(audio => !audio.paused)!.currentTime = 5; });
  await expect(page.locator('.occurrence-row.is-playing')).toHaveCount(1);
  expect(await page.evaluate(() => window.mediaElements.length)).toBe(1);
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play song', exact: true })).toBeVisible();
  await expect(controls(page).locator('section')).toHaveCount(0);
});

for (const bpm of [20, 80, 260]) {
  test(`metronome crosses three native loop boundaries at ${bpm} BPM`, async ({ page }) => {
    test.setTimeout(180000);
    await trackMedia(page); await page.goto('/metronome');
    await page.getByLabel('BPM selection mode', { exact: true }).selectOption('custom');
    await page.getByLabel('Custom BPM', { exact: true }).fill(String(bpm));
    await page.getByLabel('Custom BPM', { exact: true }).blur();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await audibleMedia(page);
    let previous = 0, loops = 0;
    await expect.poll(async () => {
      const position = await page.evaluate(() => {
        const audio = window.mediaElements.find(audio => !audio.paused);
        return { time: audio?.currentTime ?? 0, duration: audio?.duration ?? 0,
          loop: audio?.loop ?? false, paused: !audio, error: window.mediaElements.at(-1)?.error?.message ?? '' };
      });
      if (!position.paused && position.time < previous - 1) loops++;
      previous = position.time;
      return { ...position, loops };
    }, { timeout: 170000, intervals: [250] }).toMatchObject({ loop: true, loops: expect.any(Number) });
    // Observe three complete native loops at the selected BPM, without seeks or speed changes.
    await expect.poll(async () => {
      const position = await page.evaluate(() => window.mediaElements.find(audio => !audio.paused)?.currentTime ?? -1);
      if (position >= 0 && position < previous - 1) loops++;
      previous = position;
      return loops;
    }, { timeout: 170000, intervals: [250] }).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.beat.active')).toHaveCount(1);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });
}

test('Stop invalidates a cold render and late sample completion cannot start audio', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); await trackMedia(page);
  let release!: () => void;
  await page.route('**/samples/notes/guitar_E2.mp3', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.continue();
  });
  await page.goto('/maintenance/midi-test');
  await page.getByRole('button', { name: 'E Major Triad', exact: true }).click();
  await expect(controls(page).getByRole('status')).toContainText('Preparing');
  await expect.poll(() => !!release).toBe(true);
  await mkdir('../temp/ux/media-playback', { recursive: true });
  await page.screenshot({ path: '../temp/ux/media-playback/preparing-768.png', fullPage: true });
  await controls(page).getByRole('button', { name: 'Stop playback', exact: true }).click();
  release();
  await expect.poll(() => page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(el: Element): { playbackService: { rendered: { pending: Map<string, unknown> } } } } }).ng;
    return ng.getComponent(document.querySelector('app-midi-test')!).playbackService.rendered.pending.size;
  })).toBe(0);
  expect(await page.evaluate(() => window.mediaElements.length)).toBe(0);
  await expect(controls(page).locator('section')).toHaveCount(0);
});

test('a five-minute plan prepares bounded media, seeks into its existing tail and releases its player', async ({ page }) => {
  await trackMedia(page); await page.goto('/maintenance/midi-test');
  const metrics = await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(el: Element): { playbackService: {
      getFiniteSession(id: string): { play(plan: unknown): Promise<void> };
      rendered: { cache: Map<string, { blob: Blob }> };
    } } } }).ng;
    const playback = ng.getComponent(document.querySelector('app-midi-test')!).playbackService;
    const instruction = { time: 0, playbackDuration: 0.5, actionDuration: 0.5, velocity: 0.7, technique: 'normal', notes: [{ note: { semitone: 'E', octave: 2 } }] };
    const plan = { instructions: [instruction, { ...instruction, time: 299.5 }], totalDuration: 300,
      segmentStartTimes: Array.from({ length: 150 }, (_, index) => index * 2), totalSegments: 150 };
    const start = performance.now();
    await playback.getFiniteSession('five-minute-check').play(plan);
    const coldMs = performance.now() - start;
    const cacheBytes = [...playback.rendered.cache.values()].reduce((sum, value) => sum + value.blob.size, 0);
    return { coldMs, cacheBytes };
  });
  const retry = controls(page).getByRole('button', { name: 'Play prepared audio', exact: true });
  if (await retry.isVisible()) await retry.click();
  await expect.poll(() => page.evaluate(() => window.mediaElements.some(audio => !audio.paused && audio.currentTime > 0.1))).toBe(true);
  expect(metrics.cacheBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(await page.evaluate(() => window.mediaElements[0].duration)).toBeCloseTo(303, 1);
  await page.evaluate(() => { window.mediaElements[0].currentTime = 302.8; });
  await expect(controls(page).locator('section')).toHaveCount(0);
  expect(await page.evaluate(() => window.mediaElements[0].getAttribute('src'))).toBeNull();
  await mkdir('../temp/ux/media-playback', { recursive: true });
  await writeFile(`../temp/ux/media-playback/desktop-five-minute-${test.info().project.name}.json`, JSON.stringify({ project: test.info().project.name, ...metrics }, null, 2));
});
