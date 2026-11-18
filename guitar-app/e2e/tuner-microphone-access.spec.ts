import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`microphone recovery at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      let attempts = 0;
      Object.defineProperty(window, 'captureAttempts', { get: () => attempts });
      Object.defineProperty(navigator.permissions, 'query', { value: async () => ({ state: 'denied' }) });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        attempts++;
        if (attempts === 1) throw new DOMException('blocked', 'NotAllowedError');
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        destination.stream.getTracks().forEach(track => track.addEventListener('ended', () => void context.close()));
        return destination.stream;
      } });
    });
    await page.goto('/tuner');
    const status = page.getByRole('status').filter({ hasText: 'Microphone access is blocked' });
    await expect(status).toBeVisible();
    await expect(status).toContainText('phone');
    expect(await page.evaluate(() => (window as unknown as { captureAttempts: number }).captureAttempts)).toBe(0);
    const retry = page.getByRole('button', { name: 'Try again', exact: true });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(retry).toBeEnabled();
    await page.screenshot({ path: `../temp/ux/tuner-microphone-access/blocked-${viewport.width}.png` });
    await retry.click();
    await expect(page.getByText('Mic Open', { exact: true })).toBeVisible();
    await expect(status).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  });
}

test('missing permission query and departure during a pending capture', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: undefined });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise(() => {}) });
  });
  await page.goto('/tuner');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Requesting…' })).toBeDisabled();
  await page.getByRole('link', { name: 'Guitar Companion', exact: true }).click();
  await page.locator('a[href="/tuner"]').last().click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
});

test('capture denial stays visible without permission queries', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: undefined });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('blocked', 'NotAllowedError'); } });
  });
  await page.goto('/tuner');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Microphone access is blocked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
});
