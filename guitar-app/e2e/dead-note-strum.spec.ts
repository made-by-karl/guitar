import { expect, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { RenderedAudioService } from '../src/app/core/services/rendered-audio.service';

async function trackMedia(page: Page) {
  await page.addInitScript(() => {
    const elements: HTMLAudioElement[] = [];
    Object.assign(window, { guitarMedia: elements });
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) { const audio = new Target(...args); elements.push(audio); return audio; }
    });
  });
}

async function measurePlayback(page: Page) {
  const ready = page.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await ready.isVisible() || await page.evaluate(() =>
    (window as unknown as { guitarMedia: HTMLAudioElement[] }).guitarMedia.some(a => !a.paused)
  )).toBe(true);
  if (await ready.isVisible()) await ready.click();
  return page.evaluate(async () => {
    const audio = (window as unknown as { guitarMedia: HTMLAudioElement[] }).guitarMedia.find(a => !a.paused)!;
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(audio.src)).arrayBuffer());
    const data = decoded.getChannelData(0);
    let peak = 0, tail = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    const samples = data.subarray(Math.round(0.20 * 44100), Math.round(0.27 * 44100));
    for (const value of samples) tail += value * value;
    return { peak, tail: Math.sqrt(tail / samples.length) };
  });
}

test('accepted palm mute and dead strum render audible WAVs without the comparison or placeholder bank', async ({ page }) => {
  await trackMedia(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const obsolete: string[] = [];
  page.on('request', request => { if (/samples\/(palm-muted|audition)/.test(request.url())) obsolete.push(request.url()); });
  await page.goto('/maintenance/midi-test');
  await expect(page.locator('app-palm-mute-comparison')).toHaveCount(0);
  await page.getByRole('button', { name: /Palm Muted/ }).click();
  const palm = await measurePlayback(page);
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await page.getByRole('button', { name: 'Dead-note Strum', exact: true }).click();
  const dead = await measurePlayback(page);
  expect(palm.peak).toBeGreaterThan(0.01);
  expect(dead.peak).toBeGreaterThan(0.01);
  expect(dead.peak).toBeLessThanOrEqual(0.951);
  expect(palm.tail).toBeGreaterThan(dead.tail);
  expect(dead.tail).toBeLessThan(0.0001);
  expect(obsolete).toEqual([]); expect(errors).toEqual([]);
});

test('dead strum removes earlier guitar tails while subsequent notes remain audible', async ({ page }) => {
  await page.goto('/maintenance/midi-test');
  const rms = await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(el: Element): { playbackService: { rendered: RenderedAudioService } } } }).ng;
    const renderer = ng.getComponent(document.querySelector('app-midi-test')!).playbackService.rendered;
    const common = { playbackDuration: 0.8, actionDuration: 0.125, velocity: 0.7 };
    const result = await renderer.renderInstructions([
      { ...common, time: 0, technique: 'normal', chokeAt: 0.2, notes: [{ note: { semitone: 'E', octave: 2 } }] },
      { ...common, time: 0.2, technique: 'dead-note', notes: [{ note: { semitone: 'E', octave: 2 } }] },
      { ...common, time: 0.8, technique: 'normal', notes: [{ note: { semitone: 'A', octave: 2 } }] }
    ], 1);
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await result.blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const energy = (from: number, to: number) => {
      const samples = data.subarray(Math.round(from * 44100), Math.round(to * 44100));
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    };
    return { before: energy(0.02, 0.08), afterDead: energy(0.45, 0.7), later: energy(0.85, 0.9) };
  });
  expect(rms.before).toBeGreaterThan(0.001);
  expect(rms.afterDead).toBeLessThan(0.00001);
  expect(rms.later).toBeGreaterThan(0.001);
});

for (const width of [375, 768, 1280]) {
  test(`strum mode edits and reopens with direction, range and cross notation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 1024 });
    await page.goto('/patterns/editor');
    await page.locator('#patternEditorName').fill(`Dead strum ${width}`);
    const editor = page.locator('app-playing-measure-editor').first();
    await editor.getByTitle('Add Technique', { exact: true }).first().click();
    await editor.getByRole('link', { name: /Strum Up$/ }).first().click();
    const mode = editor.getByLabel('Mode', { exact: true });
    await expect(mode).toHaveValue('normal');
    await mode.selectOption('dead-note');
    await editor.getByLabel('Strings', { exact: true }).selectOption('bass');
    await expect(editor.getByLabel('Direction', { exact: true }).locator('option:checked')).toHaveText('Up');
    await expect(editor.getByLabel('Palm Mute', { exact: true })).toHaveCount(0);
    await editor.getByLabel('Accent', { exact: true }).check();
    await mode.focus();
    await mkdir('../temp/ux/dead-note-strum', { recursive: true });
    await page.screenshot({ path: `../temp/ux/dead-note-strum/mode-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Save$/ }).click();
    await expect(page).toHaveURL(/\/patterns$/);
    await page.reload();
    const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: `Dead strum ${width}`, exact: true }) });
    await expect(card.locator('.dead-note-mark')).toHaveCount(3);
    await card.screenshot({ path: `../temp/ux/dead-note-strum/notation-${width}.png` });
    await card.getByRole('button', { name: /Edit$/ }).click();
    await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('dead-note');
    await expect(page.getByLabel('Direction', { exact: true }).locator('option:checked')).toHaveText('Up');
    await expect(page.getByLabel('Strings', { exact: true })).toHaveValue('bass');
    await expect(page.getByLabel('Accent', { exact: true })).toBeChecked();
  });
}

test('the sheet measure editor offers the same strum mode and applies it to the part', async ({ page }) => {
  await page.goto('/sheets');
  await page.getByPlaceholder('New Song Sheet Name').fill('Dead-note sheet');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: 'Dead-note sheet', exact: true }).click();
  await page.getByRole('button', { name: 'Start writing', exact: true }).click();
  const part = page.locator('app-song-part-editor');
  await part.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'New measure', exact: true }).click();
  await part.getByRole('button', { name: 'Edit selected measure', exact: true }).click();
  const modal = page.locator('app-song-part-measure-editor-modal');
  await modal.getByTitle('Add Technique', { exact: true }).first().click();
  await modal.getByRole('link', { name: /Strum Down$/ }).first().click();
  await modal.getByLabel('Mode', { exact: true }).selectOption('dead-note');
  await modal.getByRole('button', { name: /Apply to part$/ }).click();
  await expect(part.locator('.dead-note-mark')).toHaveCount(6);
  await part.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(part.locator('.part-save-status')).toHaveText('All changes saved');
  await page.reload();
  await page.getByRole('button', { name: 'Untitled part, occurrence 1', exact: true }).click();
  await expect(page.locator('.dead-note-mark').first()).toBeAttached();
});
