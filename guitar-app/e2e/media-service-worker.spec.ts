import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('dist/guitar-app/browser');
const wavPath = '/samples/palm-muted/guitar_E2.wav';
const mp3Path = '/samples/notes/guitar_E2.mp3';
const digest = (data: Buffer) => createHash('sha1').update(data).digest('hex');

test('production service worker caches WAV and MP3 assets and activates a revised WAV', async ({ page, context }) => {
  test.skip(!existsSync(resolve(root, 'ngsw.json')), 'Run npm run build before the production service-worker check.');
  const original = await readFile(resolve(root, wavPath.slice(1)));
  const changed = Buffer.from(original); changed[60] ^= 1;
  const manifest = JSON.parse(await readFile(resolve(root, 'ngsw.json'), 'utf8')) as { hashTable: Record<string, string> };
  expect(Object.keys(manifest.hashTable).filter(path => path.startsWith('/samples/palm-muted/') && path.endsWith('.wav'))).toHaveLength(7);
  expect(manifest.hashTable[mp3Path]).toBeDefined();
  const samplePaths = Object.keys(manifest.hashTable).filter(path => path.startsWith('/samples/') && /\.(wav|mp3)$/.test(path));
  let updated = false;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    try {
      const revision = { ...manifest, hashTable: { ...manifest.hashTable, [wavPath]: digest(changed) } };
      const data = updated && pathname === wavPath ? changed : updated && pathname === '/ngsw.json'
        ? Buffer.from(JSON.stringify(revision)) : await readFile(resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1)));
      const type: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css' };
      response.writeHead(200, { 'Content-Type': type[extname(pathname)] ?? (pathname === '/' ? 'text/html' : 'application/octet-stream'), 'Cache-Control': 'no-store' });
      response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Production test server did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  const fetchHash = () => page.evaluate(async ({ wavPath, mp3Path, samplePaths }) => {
    const buffers = new Map(await Promise.all(samplePaths.map(async path => [path, await (await fetch(path)).arrayBuffer()] as const)));
    const wav = buffers.get(wavPath)!;
    const mp3 = buffers.get(mp3Path)!;
    const hash = await crypto.subtle.digest('SHA-1', wav);
    return { hash: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''), mp3Size: mp3.byteLength,
      sizes: [...buffers.values()].map(buffer => buffer.byteLength) };
  }, { wavPath, mp3Path, samplePaths });
  const operation = (action: string, nonce: number) => page.evaluate(({ action, nonce }) => new Promise<boolean>((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'OPERATION_COMPLETED' && event.data.nonce === nonce) {
        navigator.serviceWorker.removeEventListener('message', listener);
        if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
      }
    };
    navigator.serviceWorker.addEventListener('message', listener);
    navigator.serviceWorker.controller!.postMessage({ action, nonce });
  }), { action, nonce });
  try {
    await page.goto(origin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/ngsw-worker.js'); await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // Worker activation precedes Angular's first version initialization/prefetch.
    // A controlled online request waits for that initialization before disconnecting.
    expect((await fetchHash()).hash).toBe(digest(original));
    await context.setOffline(true);
    const initial = await fetchHash();
    expect(initial.hash).toBe(digest(original)); expect(initial.mp3Size).toBeGreaterThan(0);
    expect(initial.sizes).toHaveLength(samplePaths.length); expect(initial.sizes.every(size => size > 44)).toBe(true);
    await context.setOffline(false);
    updated = true;
    await operation('CHECK_FOR_UPDATES', 672913);
    await operation('ACTIVATE_UPDATE', 672914);
    await page.reload();
    await context.setOffline(true);
    const latest = await fetchHash();
    expect(latest.hash).toBe(digest(changed)); expect(latest.mp3Size).toBeGreaterThan(0);
    expect(latest.sizes).toHaveLength(samplePaths.length); expect(latest.sizes.every(size => size > 44)).toBe(true);
  } finally {
    await context.setOffline(false);
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  }
});
