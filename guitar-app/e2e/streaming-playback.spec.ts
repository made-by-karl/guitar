import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { PlaybackPlan } from '@/app/core/services/playback.service';
import type { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { probeAacStreaming } from './helpers/aac-streaming-prototype';
import tears from '../test/fixtures/streaming-playback/tears-in-heaven.json';
import openRoad from '../test/fixtures/streaming-playback/open-road.json';
import risingSun from '../test/fixtures/streaming-playback/rising-sun.json';

interface BaselineMetrics {
  mode: string;
  start: number;
  planningMs: number;
  preparationMs: number;
  sampleBankMs: number;
  decodeMs: number;
  decodeCalls: number;
  postprocessMs: number;
  toneRenderMs: number;
  nativeRenderMs: number;
  articulationRenderMs: number;
  wavEncodeMs: number;
  renderReadyMs?: number;
  firstPlayingMs?: number;
  firstAdvancingClockMs?: number;
  duration?: number;
  blobBytes?: number;
  peakMainPcmBytes: number;
  heapBefore?: number;
  heapAfter?: number;
  plan?: { measures: number; instructions: number; notationSeconds: number; plannedSeconds: number };
}
interface ProbeState { current: BaselineMetrics; audio: HTMLAudioElement[]; renderCompleteAt?: number; }
declare global { interface Window { streamingBaseline: ProbeState; } }

async function instrumentBaseline(page: Page, forceCompleteFile = true) {
  await page.evaluate(forceCompleteFile => {
    type RenderInternals = Pick<RenderedAudioService, 'render' | 'sampler' | 'renderInstructions'> & { cache: Map<string, unknown>; bytes: number; encoder: { encode(buffer: AudioBuffer): Blob } };
    type SongInternals = {
      planner: { buildPlaybackPlan(...args: unknown[]): PlaybackPlan & { notationDuration: number } };
      playback: { rendered: RenderInternals; streaming?: { disabled: boolean } };
    };
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: SongInternals } } }).ng;
    const song = ng.getComponent(document.querySelector('app-song-arrangement')!).playback;
    const renderer = song.playback.rendered;
    if (forceCompleteFile && song.playback.streaming) song.playback.streaming.disabled = true;
    const state: ProbeState = window.streamingBaseline = { current: {} as BaselineMetrics, audio: [] as HTMLAudioElement[] };
    const plan = song.planner.buildPlaybackPlan.bind(song.planner);
    song.planner.buildPlaybackPlan = (...args) => {
      const start = performance.now(); const result = plan(...args);
      state.current.planningMs += performance.now() - start;
      if (result.totalSegments >= (state.current.plan?.measures ?? 0)) state.current.plan = {
        measures: result.totalSegments, instructions: result.instructions.length,
        notationSeconds: result.notationDuration, plannedSeconds: result.totalDuration
      };
      return result;
    };
    const render = renderer.render.bind(renderer);
    renderer.render = (identity, duration, schedule, ...rest) => render(identity, duration, async (context, resources, check) => {
      const nativeRender = context.render.bind(context);
      context.render = async (...args) => {
        const start = performance.now();
        try { return await nativeRender(...args); }
        finally { state.renderCompleteAt = performance.now(); state.current.toneRenderMs += state.renderCompleteAt - start; }
      };
      const start = performance.now();
      try { await schedule(context, resources, check); }
      finally { state.current.preparationMs += performance.now() - start; }
    }, ...rest);
    const sampler = renderer.sampler.bind(renderer);
    renderer.sampler = async (...args) => {
      const start = performance.now();
      try { return await sampler(...args); }
      finally { state.current.sampleBankMs += performance.now() - start; }
    };
    const encode = renderer.encoder.encode.bind(renderer.encoder);
    renderer.encoder.encode = buffer => {
      const start = performance.now();
      state.current.postprocessMs += start - (state.renderCompleteAt ?? start);
      const result = encode(buffer);
      state.current.wavEncodeMs += performance.now() - start;
      state.current.blobBytes = result.size; state.current.duration = buffer.duration;
      return result;
    };
    const instructions = renderer.renderInstructions.bind(renderer);
    renderer.renderInstructions = async (...args) => {
      const result = await instructions(...args);
      state.current.renderReadyMs = performance.now() - state.current.start;
      state.current.blobBytes = result.blob.size; state.current.duration = result.durationSeconds;
      return result;
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = async function(data, success, failure) {
      const start = performance.now();
      try { return await decode.call(this, data, success, failure); }
      finally { state.current.decodeCalls++; state.current.decodeMs += performance.now() - start; }
    };
    const native = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = async function() {
      const start = performance.now();
      const frames = this.length;
      const result = await native.call(this);
      const elapsed = performance.now() - start;
      if (result.duration < 1) state.current.articulationRenderMs += elapsed;
      else { state.current.nativeRenderMs += elapsed; state.current.peakMainPcmBytes = Math.max(state.current.peakMainPcmBytes, frames * result.numberOfChannels * 4); }
      return result;
    };
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) {
        const audio = new Target(...args); state.audio.push(audio);
        audio.addEventListener('playing', () => { state.current.firstPlayingMs ??= performance.now() - state.current.start; });
        return audio;
      }
    });
  }, forceCompleteFile);
}

async function measurePlayback(page: Page, mode: string) {
  await page.evaluate(mode => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    window.streamingBaseline.renderCompleteAt = undefined;
    window.streamingBaseline.current = {
      mode, start: performance.now(), planningMs: 0, preparationMs: 0, sampleBankMs: 0, decodeMs: 0, decodeCalls: 0, postprocessMs: 0,
      toneRenderMs: 0, nativeRenderMs: 0, articulationRenderMs: 0, wavEncodeMs: 0,
      peakMainPcmBytes: 0, heapBefore: memory.memory?.usedJSHeapSize
    };
    if (mode === 'warm-samples') {
      const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { rendered: { cache: Map<string, unknown>; bytes: number } } } } } }).ng;
      const renderer = ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback.rendered;
      renderer.cache.clear(); renderer.bytes = 0;
    }
    performance.clearResourceTimings();
  }, mode);
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await retry.isVisible() || await page.evaluate(() => window.streamingBaseline.audio.some(a => !a.paused)), { timeout: 120000 }).toBe(true);
  if (await retry.isVisible()) await retry.click();
  await expect.poll(() => page.evaluate(() => window.streamingBaseline.audio.some(a => !a.paused && a.currentTime > 0.1))).toBe(true);
  const result = await page.evaluate(() => {
    const state = window.streamingBaseline;
    state.current.firstAdvancingClockMs = performance.now() - state.current.start;
    state.current.heapAfter = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const audio = state.audio.find(a => !a.paused)!;
    return { ...state.current, mediaDuration: audio.duration,
      buffered: Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]),
      sampleRequests: performance.getEntriesByType('resource').filter(e => e.name.includes('/samples/')).map(e => {
        const entry = e as PerformanceResourceTiming;
        return { path: new URL(entry.name).pathname, startMs: entry.startTime - state.current.start,
          durationMs: entry.duration, transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize };
      }) };
  });
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
  return result;
}

const evidence = '../temp/ux/streaming-playback';
for (const source of ['media', 'managed'] as const) {
test(`AAC ${source} prototype proves append, playback, underrun recovery and seek`, async ({ page }, testInfo) => {
  await page.goto('/maintenance/midi-test');
  const result = await page.evaluate(probeAacStreaming, source);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/aac-${source}-${testInfo.project.name}.json`, JSON.stringify(result, null, 2));
  expect(result.support.secureContext).toBe(true);
  test.skip(result.outcome === 'unsupported', 'Native AAC path unsupported; this is not streaming acceptance');
  expect(result, JSON.stringify(result)).toMatchObject({ outcome: 'append-play-seek' });
  expect(result.randomSeekTime).toBeCloseTo(9, 1);
  expect(result.underrunTime).toBeGreaterThan(3.5);
  expect(result.recoveredWithoutPlay).toBe(true);
  expect(result.firstRanges![0][1]).toBeLessThan(5);
  expect(result.completedRanges).toHaveLength(1);
  expect(result.completedRanges![0][1]).toBeGreaterThan(11);
});
}

for (const [name, fixture] of Object.entries({ tears, openRoad, risingSun })) {
  test(`full-file baseline: ${name} cold, warm samples and cached WAV`, async ({ page }, testInfo) => {
    test.skip(process.env['STREAMING_BENCHMARK'] !== '1', 'Opt-in performance measurement');
    await page.goto('/sheets');
    await page.locator('app-json-import input[type=file]').setInputFiles({ name: `${name}.json`, mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.getByRole('button', { name: 'Import copy', exact: true }).click();
    await page.getByRole('link', { name: fixture.data.name, exact: true }).click();
    await expect(page.locator('app-song-arrangement')).toBeVisible();
    await instrumentBaseline(page);
    const runs = [];
    for (const mode of ['cold', 'warm-samples', 'warm-blob']) runs.push(await measurePlayback(page, mode));
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/baseline-${name}-${testInfo.project.name}.json`, JSON.stringify({
      recordedAt: new Date().toISOString(), project: testInfo.project.name,
      userAgent: await page.evaluate(() => navigator.userAgent), fixture: name, runs,
      notes: ['Cold means a new browser context and empty rendered-blob cache; the host filesystem may be warm.',
        'Warm samples clears only the rendered-blob cache. HTTP/decoder caches remain browser-owned.',
        'Stage durations may overlap; do not sum preparation, sample-bank, articulation and native-render timings.',
        'PCM bytes are one main float buffer, not total process memory. JS heap is optional and excludes native audio allocations.',
        'First advancing clock includes polling/gesture latency. First playing is a media event, not acoustic output.']
    }, null, 2));
    expect(runs[0].blobBytes).toBeGreaterThan(44);
    expect(runs[2].wavEncodeMs).toBe(0);
    if (name === 'tears') {
      expect(fixture.data.arrangement).toHaveLength(14);
      expect(runs[0].plan?.measures).toBe(84);
      expect(runs[0].plan?.notationSeconds).toBeCloseTo(84 * 4 * 60 / 76, 4);
    }
  });
}

test('production stream starts with a prefix and seeks without replacing its media element', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/maintenance/midi-test');
  const result = await page.evaluate(async () => {
    type Renderer = RenderedAudioService;
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playbackService: {
      streaming?: { probeFailure?: string; disabled: boolean }; rendered: Renderer; getFiniteSession(id: string): { play(plan: PlaybackPlan): Promise<void> };
    } } } }).ng;
    const playback = ng.getComponent(document.querySelector('app-midi-test')!).playbackService;
    const windows: { from: number; to: number; ms: number }[] = [];
    const original = playback.rendered.renderWindow.bind(playback.rendered);
    playback.rendered.renderWindow = async (...args) => {
      const start = performance.now(); const result = await original(...args);
      windows.push({ from: result.startFrame / 44100, to: result.endFrame / 44100, ms: performance.now() - start }); return result;
    };
    const media: HTMLAudioElement[] = [];
    window.Audio = new Proxy(window.Audio, { construct(Target, args) { const audio = new Target(...args); media.push(audio); return audio; } });
    const start = performance.now();
    const instruction = { time: 0, playbackDuration: 0.5, actionDuration: 0.5, velocity: 0.3, technique: 'normal' as const,
      notes: [{ note: { semitone: 'E' as const, octave: 2 } }] };
    await playback.getFiniteSession('stream-check').play({ instructions: Array.from({ length: 24 }, (_, n) => ({ ...instruction, time: n * 2 })),
      totalDuration: 48, totalSegments: 24, segmentStartTimes: Array.from({ length: 24 }, (_, n) => n * 2) });
    const first = media[0];
    const state = { windows, media, playback, startedMs: performance.now() - start };
    (window as unknown as { productionStream: typeof state }).productionStream = state;
    return { snapshot: (playback as unknown as { media: { getSnapshot(channel: string): unknown } }).media.getSnapshot('finite:stream-check'), compatibility: { present: !!playback.streaming, error: playback.streaming?.probeFailure, disabled: playback.streaming?.disabled }, startedMs: state.startedMs, windowsAtStart: windows.slice(), duration: first?.duration, paused: first?.paused };
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/production-smoke-${testInfo.project.name}.json`, JSON.stringify(result, null, 2));
  expect(result.windowsAtStart.length, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.windowsAtStart.at(-1)!.to).toBeLessThan(48);
  const retry = page.getByRole('button', { name: 'Play prepared audio', exact: true });
  if (await retry.isVisible()) await retry.click();
  expect(result.snapshot).not.toMatchObject({ status: 'error' });
  await expect.poll(() => page.evaluate(() => {
    const state = (window as unknown as { productionStream: { media: HTMLAudioElement[] } }).productionStream;
    return state.media[0].currentTime;
  })).toBeGreaterThan(4.5);
  const seek = await page.evaluate(async () => {
    const state = (window as unknown as { productionStream: {
      media: HTMLAudioElement[]; playback: { media: { pause(channel: string): void; seek(channel: string, time: number): void } };
    } }).productionStream;
    state.playback.media.pause('finite:stream-check'); state.playback.media.seek('finite:stream-check', 40);
    return { count: state.media.length, paused: state.media[0].paused, target: state.media[0].currentTime };
  });
  expect(seek).toEqual({ count: 1, paused: true, target: 40 });
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { productionStream: { media: HTMLAudioElement[] } }).productionStream.media[0];
    return Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]).some(([start, end]) => start <= 40 && end > 40);
  })).toBe(true);
  const cachedSeek = await page.evaluate(() => {
    const state = (window as unknown as { productionStream: { media: HTMLAudioElement[]; windows: unknown[];
      playback: { media: { seek(channel: string, time: number): void } } } }).productionStream;
    const count = state.windows.length; state.playback.media.seek('finite:stream-check', 0); return count;
  });
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { productionStream: { media: HTMLAudioElement[] } }).productionStream.media[0];
    return audio.buffered.length > 0 && audio.buffered.start(0) === 0;
  })).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { productionStream: { windows: unknown[] } }).productionStream.windows.length)).toBe(cachedSeek);
  expect(errors).toEqual([]);
});

test('window PCM and independent lossless fragments preserve the full-render signal across musical boundaries', async ({ page }, testInfo) => {
  await page.goto('/maintenance/midi-test');
  const comparison = await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playbackService: {
      rendered: RenderedAudioService; streaming: { encoder: { encode(pcm: AudioBuffer, signal: AbortSignal): Promise<Uint8Array> } };
    } } } }).ng;
    const playback = ng.getComponent(document.querySelector('app-midi-test')!).playbackService;
    const common = { playbackDuration: 0.5, actionDuration: 0.125, velocity: 0.15 };
    const e = { note: { semitone: 'E' as const, octave: 2 } }, a = { note: { semitone: 'A' as const, octave: 2 } };
    const instructions: PlaybackPlan['instructions'] = [
      { ...common, time: 0, playbackDuration: 2, technique: 'normal', notes: [e], chokeAt: 8.08 },
      { ...common, time: 3.95, playbackDuration: 1, technique: 'normal', notes: [e, a, { note: { semitone: 'D', octave: 3 } }], playNotes: 'sequential', chokeAt: 8.08 },
      { ...common, time: 7.9, playbackDuration: 0.8, technique: 'slide', notes: [e, a], chokeAt: 8.08, legatos: [
        { source: e, target: { note: { semitone: 'F#', octave: 2 } }, string: 0 },
        { source: a, target: { note: { semitone: 'B', octave: 2 } }, string: 1 }
      ] },
      { ...common, time: 7.95, technique: 'percussive', percussion: { technique: 'body-knock' } },
      { ...common, time: 8, technique: 'normal', notes: [e], chokeAt: 8.08 },
      { ...common, time: 8.08, technique: 'dead-note', notes: [e, a], playNotes: 'reversed' },
      { ...common, time: 8.4, technique: 'palm-muted', notes: [a] },
      { ...common, time: 11, technique: 'normal', notes: [e] }
    ];
    const full = await playback.rendered.renderInstructions(instructions, 12);
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const reference = await decoder.decodeAudioData(await full.blob.arrayBuffer());
    const end = Math.ceil(Math.max(12, ...instructions.map(i => playback.rendered.instructionEnd(i))) * 44100);
    const samples: Float32Array[] = [];
    let codecError = 0;
    const abort = new AbortController();
    for (let start = 0; start < end; start += 4 * 44100) {
      const window = await playback.rendered.renderWindow(instructions, 12, start, Math.min(end, start + 4 * 44100), abort.signal, 1, 1, start + 4 * 44100 >= end);
      const raw = window.pcm.getChannelData(0); samples.push(raw);
      const encoded = await playback.streaming.encoder.encode(window.pcm, abort.signal);
      const decoded = await decoder.decodeAudioData(encoded.slice().buffer);
      if (decoded.length !== raw.length) throw new Error(`FLAC frame mismatch: ${decoded.length} / ${raw.length}`);
      for (let i = 0; i < raw.length; i++) codecError = Math.max(codecError, Math.abs(raw[i] - decoded.getChannelData(0)[i]));
    }
    const candidate = new Float32Array(samples.reduce((n, data) => n + data.length, 0));
    let offset = 0; for (const data of samples) { candidate.set(data, offset); offset += data.length; }
    let maxError = 0, peak = 0;
    const expected = reference.getChannelData(0);
    for (let i = 0; i < Math.min(candidate.length, expected.length); i++) {
      maxError = Math.max(maxError, Math.abs(candidate[i] - expected[i])); peak = Math.max(peak, Math.abs(expected[i]));
    }
    return { maxError, codecError, frames: candidate.length, referenceFrames: reference.length, peak };
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/pcm-comparison-${testInfo.project.name}.json`, JSON.stringify(comparison, null, 2));
  expect(comparison.peak).toBeGreaterThan(0.01);
  expect(Math.abs(comparison.frames - comparison.referenceFrames)).toBeLessThanOrEqual(2);
  expect(comparison.maxError).toBeLessThan(2 / 32768);
  expect(comparison.codecError).toBeLessThan(2 / 32768);
});

async function openLongSong(page: Page, alreadyOnSheets = false) {
  if (!alreadyOnSheets) await page.goto('/sheets');
  await page.locator('app-json-import input[type=file]').setInputFiles({ name: 'benchmark.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tears)) });
  await page.getByRole('button', { name: 'Import copy', exact: true }).click();
  await page.getByRole('link', { name: tears.data.name, exact: true }).click();
  await expect(page.locator('app-song-arrangement')).toBeVisible();
}

interface LongRun {
  started: number; firstPlayingMs?: number; firstWindowCount?: number; phase: string;
  windows: { start: number; end: number; ms: number }[];
  buffers: { time: number; ahead: number }[]; underruns: number[];
  audio: HTMLAudioElement[]; maxOfflineSeconds: number;
  encodingMs: number; encodedBytes: number; maxEncodedCacheBytes: number; decodedAssetBytes: number; maxHeapBytes?: number;
  firstPlayingStages?: BaselineMetrics & { encodingMs: number };
}
declare global { interface Window { longStreamRun: LongRun; } }

async function instrumentLongSong(page: Page) {
  await instrumentBaseline(page, false);
  await page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { rendered: RenderedAudioService; streaming: { encoder: { encode(pcm: AudioBuffer, signal: AbortSignal): Promise<Uint8Array> }; bytes: number } } } } } }).ng;
    const playback = ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback;
    const renderer = playback.rendered;
    const state = window.longStreamRun = { started: 0, phase: 'sustain', windows: [], buffers: [], underruns: [], audio: [], maxOfflineSeconds: 0, encodingMs: 0, encodedBytes: 0, maxEncodedCacheBytes: 0, decodedAssetBytes: 0 } as LongRun;
    const encode = playback.streaming.encoder.encode.bind(playback.streaming.encoder);
    playback.streaming.encoder.encode = async (...args) => {
      const start = performance.now();
      try { const bytes = await encode(...args); state.encodedBytes += bytes.byteLength; return bytes; }
      finally { state.encodingMs += performance.now() - start; }
    };
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => { state.maxOfflineSeconds = Math.max(state.maxOfflineSeconds, args[1]); return render(...args); };
    const renderWindow = renderer.renderWindow.bind(renderer);
    renderer.renderWindow = async (...args) => {
      const start = performance.now(), result = await renderWindow(...args);
      state.windows.push({ start: result.startFrame / 44100, end: result.endFrame / 44100, ms: performance.now() - start }); return result;
    };
    const Audio = globalThis.Audio;
    globalThis.Audio = new Proxy(Audio, { construct(Target, args) {
      const audio = new Target(...args); state.audio.push(audio);
      audio.addEventListener('playing', () => {
        state.firstPlayingMs ??= performance.now() - state.started;
        state.firstWindowCount ??= state.windows.length;
        state.firstPlayingStages ??= { ...window.streamingBaseline.current, encodingMs: state.encodingMs };
      });
      audio.addEventListener('waiting', () => {
        if (state.phase === 'sustain' && !audio.seeking && audio.currentTime > 0.1) state.underruns.push(audio.currentTime);
      });
      audio.addEventListener('timeupdate', () => {
        const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
        if (heap !== undefined) state.maxHeapBytes = Math.max(state.maxHeapBytes ?? 0, heap);
        state.maxEncodedCacheBytes = Math.max(state.maxEncodedCacheBytes, playback.streaming.bytes);
        state.decodedAssetBytes = (renderer as unknown as { assetBytes: number }).assetBytes;
        for (let i = 0; i < audio.buffered.length; i++) if (audio.buffered.start(i) <= audio.currentTime && audio.buffered.end(i) >= audio.currentTime) {
          state.buffers.push({ time: audio.currentTime, ahead: audio.buffered.end(i) - audio.currentTime }); break;
        }
      });
      return audio;
    } });
  });
}

async function resetStreamMetrics(page: Page, mode: string) {
  await page.evaluate(mode => {
    const start = performance.now();
    window.longStreamRun.started = start; window.longStreamRun.encodingMs = 0; window.longStreamRun.encodedBytes = 0;
    window.longStreamRun.firstPlayingStages = undefined;
    window.streamingBaseline.current = { mode, start, planningMs: 0, preparationMs: 0, sampleBankMs: 0,
      decodeMs: 0, decodeCalls: 0, postprocessMs: 0, toneRenderMs: 0, nativeRenderMs: 0,
      articulationRenderMs: 0, wavEncodeMs: 0, peakMainPcmBytes: 0 };
    performance.clearResourceTimings();
  }, mode);
}

test('long example completes at normal speed without underruns and replays evicted browser audio from cache', async ({ page }, testInfo) => {
  test.skip(process.env['STREAMING_ACCEPTANCE'] !== '1', 'Opt-in 265-second sustained playback acceptance');
  test.setTimeout(360000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openLongSong(page); await instrumentLongSong(page);
  await resetStreamMetrics(page, 'cold');
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  const prepared = page.getByRole('button', { name: 'Play prepared audio', exact: true });
  await expect.poll(async () => await prepared.isVisible() || await page.evaluate(() => window.longStreamRun.audio.some(a => !a.paused))).toBe(true);
  if (await prepared.isVisible()) await prepared.click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  try {
    await expect.poll(() => page.evaluate(() => window.longStreamRun.audio[0]?.ended), { timeout: 300000, intervals: [1000] }).toBe(true);
  } catch (error) {
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/long-failure-${testInfo.project.name}.json`, JSON.stringify(await streamDebug(page), null, 2));
    throw error;
  }
  const cold = await page.evaluate(() => ({ ...window.longStreamRun, stages: window.streamingBaseline.current, network: performance.getEntriesByType('resource').map(entry => ({ path: new URL(entry.name).pathname, durationMs: entry.duration, transferBytes: (entry as PerformanceResourceTiming).transferSize })), audio: undefined, duration: window.longStreamRun.audio[0].duration,
    ranges: Array.from({ length: window.longStreamRun.audio[0].buffered.length }, (_, i) => [window.longStreamRun.audio[0].buffered.start(i), window.longStreamRun.audio[0].buffered.end(i)]) }));
  expect(cold.firstWindowCount).toBeGreaterThan(0); expect(cold.firstWindowCount).toBeLessThan(8); expect(cold.underruns).toEqual([]);
  expect(cold.maxOfflineSeconds).toBeLessThan(10); expect(cold.duration).toBeGreaterThanOrEqual(265.263);
  const beforeReplay = cold.windows.length;
  await page.evaluate(() => {
    window.longStreamRun.phase = 'replay';
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { resumeSong(): void } } } }).ng;
    ng.getComponent(document.querySelector('app-song-arrangement')!).playback.resumeSong();
  });
  await expect.poll(() => page.evaluate(() => window.longStreamRun.audio[0].currentTime)).toBeGreaterThan(0.1);
  expect(await page.evaluate(() => window.longStreamRun.windows.length)).toBe(beforeReplay);
  expect(await page.evaluate(() => window.longStreamRun.audio.length)).toBe(1);
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
  await page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { streaming: { cache: Map<string, unknown>; bytes: number } } } } } }).ng;
    const streaming = ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback.streaming;
    streaming.cache.clear(); streaming.bytes = 0;
    window.longStreamRun.phase = 'warm'; window.longStreamRun.firstPlayingMs = undefined; window.longStreamRun.firstWindowCount = undefined;
    window.longStreamRun.windows = []; window.longStreamRun.started = performance.now();
  });
  await resetStreamMetrics(page, 'warm-samples');
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.longStreamRun.audio.at(-1)!.currentTime)).toBeGreaterThan(0.1);
  const warm = await page.evaluate(() => ({ stages: window.streamingBaseline.current, firstPlayingStages: window.longStreamRun.firstPlayingStages, encodingMs: window.longStreamRun.encodingMs, sampleRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/samples/')).length, firstPlayingMs: window.longStreamRun.firstPlayingMs, firstWindowCount: window.longStreamRun.firstWindowCount,
    windows: window.longStreamRun.windows, maxOfflineSeconds: window.longStreamRun.maxOfflineSeconds }));
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/long-stream-${testInfo.project.name}.json`, JSON.stringify({ cold, warm, errors }, null, 2));
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`buffering keeps keyboard Pause and rapid section seeks usable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await openLongSong(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { rendered: RenderedAudioService } } } } }).ng;
      const renderer = ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback.rendered;
      const render = renderer.renderWindow.bind(renderer); let held = false;
      renderer.renderWindow = async (...args) => {
        if (!held && args[2] >= 4 * 44100) {
          held = true;
          await new Promise<void>((resolve, reject) => {
            const signal = args[4];
            const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Canceled', 'AbortError')); };
            (window as unknown as { releaseStreamWindow(): void }).releaseStreamWindow = () => { signal.removeEventListener('abort', abort); resolve(); };
            signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
          });
        }
        return render(...args);
      };
      (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio = [];
      globalThis.Audio = new Proxy(globalThis.Audio, { construct(Target, args) {
        const audio = new Target(...args); (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio.push(audio); return audio;
      } });
    });
    await page.getByRole('button', { name: 'Play song', exact: true }).click();
    const prepared = page.getByRole('button', { name: 'Play prepared audio', exact: true });
    await expect.poll(async () => await prepared.isVisible() || await page.getByRole('button', { name: 'Pause song', exact: true }).isVisible()).toBe(true);
    if (await prepared.isVisible()) await prepared.click();
    await expect(page.locator('app-media-playback-controls [role=status]')).toContainText('Buffering');
    await mkdir(evidence, { recursive: true });
    const pause = page.getByRole('button', { name: 'Pause song', exact: true });
    await pause.focus();
    await page.screenshot({ path: `${evidence}/buffering-${viewport.width}-${testInfo.project.name}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Resume song', exact: true })).toBeVisible();
    const pausedTime = await page.evaluate(() => {
      (window as unknown as { releaseStreamWindow(): void }).releaseStreamWindow();
      return (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0].currentTime;
    });
    await expect.poll(() => page.evaluate(() => {
      const audio = (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0];
      return audio.buffered.length && audio.buffered.end(audio.buffered.length - 1);
    })).toBeGreaterThan(4.1);
    expect(await page.evaluate(() => (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0].paused)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0].currentTime)).toBeCloseTo(pausedTime, 2);
    await page.getByRole('button', { name: 'Resume song', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0].currentTime)).toBeGreaterThan(4.5);
    await page.getByRole('button', { name: 'Pause song', exact: true }).click();
    await page.getByRole('button', { name: 'Next part', exact: true }).first().click();
    await page.getByRole('button', { name: 'Next part', exact: true }).first().click();
    const target = tears.data.arrangement.slice(0, 2).reduce((n, occurrence) => n + tears.data.parts.find(part => part.id === occurrence.partId)!.measures.length * 4 * 60 / 76, 0);
    expect(await page.evaluate(() => (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio[0].currentTime)).toBeCloseTo(target, 3);
    expect(await page.evaluate(() => (window as unknown as { bufferingAudio: HTMLAudioElement[] }).bufferingAudio.length)).toBe(1);
    await page.getByRole('button', { name: 'Stop song', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test('persistent streaming quota failure exposes a complete-WAV retry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/maintenance/midi-test');
  const result = await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playbackService: {
      streaming: { compatibility?: Promise<unknown> }; getFiniteSession(id: string): { play(plan: PlaybackPlan): Promise<void> };
    } } } }).ng;
    const playback = ng.getComponent(document.querySelector('app-midi-test')!).playbackService;
    // Count native append attempts after the compatibility probe has completed.
    const original = SourceBuffer.prototype.appendBuffer; let failed = 0;
    SourceBuffer.prototype.appendBuffer = function(data) {
      if (failed < 2 && (window as unknown as { failProductionAppend?: boolean }).failProductionAppend) { failed++; throw new DOMException('Full', 'QuotaExceededError'); }
      return original.call(this, data);
    };
    // Observe the first real media element; the muted probe uses createElement.
    globalThis.Audio = new Proxy(globalThis.Audio, { construct(Target, args) {
      (window as unknown as { failProductionAppend?: boolean }).failProductionAppend = true;
      return new Target(...args);
    } });
    const instruction = { time: 0, playbackDuration: 0.5, actionDuration: 0.5, velocity: 0.3, technique: 'normal' as const,
      notes: [{ note: { semitone: 'E' as const, octave: 2 } }] };
    await playback.getFiniteSession('quota-retry').play({ instructions: [instruction], totalDuration: 20, totalSegments: 1, segmentStartTimes: [0] });
    return failed;
  });
  expect(result).toBe(2);
  const retry = page.getByRole('button', { name: 'Retry playback', exact: true });
  await expect(retry).toBeVisible();
  const contrast = await page.locator('app-media-playback-controls [role=alert]').evaluate(element => {
    const foreground = getComputedStyle(element).color, background = getComputedStyle(element.closest('.card')!).backgroundColor;
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return { foreground, background, ratio: (values[0] + 0.05) / (values[1] + 0.05) };
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/error-contrast-${testInfo.project.name}.json`, JSON.stringify(contrast, null, 2));
  await retry.focus();
  await page.screenshot({ path: `${evidence}/streaming-error-${testInfo.project.name}.png`, fullPage: true });
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
  await retry.click();
  await expect(page.locator('app-media-playback-controls [role=status]')).toContainText('Playing');
});

async function streamDebug(page: Page) {
  return page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { media: {
      players: Map<string, { state: { value: unknown }; stream?: { busy: boolean; failed: boolean; workStart?: number; version: number; target: number; media?: { readyState: string } } }>;
    } } } } } }).ng;
    const player = ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback.media.players.get('finite:song-part-playback');
    const audio = window.longStreamRun.audio[0];
    return { windows: window.longStreamRun.windows, buffers: window.longStreamRun.buffers.slice(-20), underruns: window.longStreamRun.underruns,
      state: player?.state.value, currentTime: audio?.currentTime, duration: audio?.duration, paused: audio?.paused,
      ranges: audio ? Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]) : [],
      source: player?.stream ? { busy: player.stream.busy, failed: player.stream.failed, workStart: player.stream.workStart,
        version: player.stream.version, target: player.stream.target, readyState: player.stream.media?.readyState } : undefined };
  });
}

test('fractional musical times retain exact window lengths beyond the first browser eviction', async ({ page }, testInfo) => {
  await openLongSong(page); await instrumentLongSong(page);
  await resetStreamMetrics(page, 'cold');
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.longStreamRun.audio.some(a => !a.paused))).toBe(true);
  await page.evaluate(() => { window.longStreamRun.audio[0].playbackRate = 2; });
  try {
    await expect.poll(() => page.evaluate(() => window.longStreamRun.audio[0].currentTime), { timeout: 35000 }).toBeGreaterThan(40);
  } finally {
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/fractional-windows-${testInfo.project.name}.json`, JSON.stringify(await streamDebug(page), null, 2));
  }
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
});

test('long example PCM windows match the full-render benchmark at every sample boundary', async ({ page }, testInfo) => {
  test.skip(process.env['STREAMING_ACCEPTANCE'] !== '1', 'Opt-in full-render signal comparison');
  test.setTimeout(180000);
  await openLongSong(page);
  const comparison = await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): {
      currentSheet(): unknown;
      playback: { playSong(sheet: unknown): Promise<void>; session: { play(plan: PlaybackPlan): Promise<void> }; playback: { rendered: RenderedAudioService } };
    } } }).ng;
    const component = ng.getComponent(document.querySelector('app-song-arrangement')!);
    const song = component.playback;
    let plan!: PlaybackPlan;
    const play = song.session.play;
    song.session.play = async produced => { plan = produced; };
    try { await song.playSong(component.currentSheet()); } finally { song.session.play = play; }
    const rendered = song.playback.rendered;
    const full = await rendered.renderInstructions(plan.instructions, plan.totalDuration);
    const reference = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await full.blob.arrayBuffer());
    const abort = new AbortController(), gain = await rendered.streamingGain(plan.instructions, abort.signal);
    const end = Math.ceil(Math.max(plan.totalDuration, ...plan.instructions.map(i => rendered.instructionEnd(i))) * 44100);
    const candidate = new Float32Array(end);
    let length = 0, windows = 0;
    for (let start = 0; start < end; start += 4 * 44100) {
      const final = start + 4 * 44100 >= end;
      const window = await rendered.renderWindow(plan.instructions, plan.totalDuration, start, Math.min(end, start + 4 * 44100), abort.signal, gain, 1, final);
      if (!final && window.pcm.length !== 4 * 44100) throw new Error('A non-final window lost frames.');
      candidate.set(window.pcm.getChannelData(0), start); length = window.endFrame; windows++;
    }
    const expected = reference.getChannelData(0), count = Math.min(length, expected.length);
    let product = 0, energy = 0;
    for (let i = 0; i < count; i++) { product += expected[i] * candidate[i]; energy += candidate[i] ** 2; }
    const globalScale = product / energy;
    let maxError = 0, squaredError = 0;
    for (let i = 0; i < count; i++) {
      const error = Math.abs(expected[i] - candidate[i] * globalScale);
      maxError = Math.max(maxError, error); squaredError += error * error;
    }
    return { windows, frames: length, referenceFrames: expected.length, gain, globalScale, maxError, rmsError: Math.sqrt(squaredError / count) };
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/long-pcm-${testInfo.project.name}.json`, JSON.stringify(comparison, null, 2));
  expect(Math.abs(comparison.frames - comparison.referenceFrames)).toBeLessThanOrEqual(2);
  expect(comparison.windows).toBeGreaterThan(60);
  expect(comparison.maxError).toBeLessThan(2 / 32768);
});

test('background windows yield to metronome changes and a preview returns system ownership to its running loop', async ({ page }) => {
  await page.goto('/metronome');
  await page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { metronomeService: unknown } } }).ng;
    (window as unknown as { concurrentMetronome: unknown }).concurrentMetronome = ng.getComponent(document.querySelector('app-metronome')!).metronomeService;
  });
  await page.getByRole('link', { name: /Song Sheets/ }).first().click();
  await openLongSong(page, true);
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const metronome = (window as unknown as { concurrentMetronome: { start(config: { bpm: number; timeSignature: '4/4'; subdivision: '8th' }): Promise<void> } }).concurrentMetronome;
    await metronome.start({ bpm: 80, timeSignature: '4/4', subdivision: '8th' });
  });
  const immediate = await page.evaluate(async () => {
    const metronome = (window as unknown as { concurrentMetronome: {
      getSnapshot(): { running: boolean; config: { bpm: number } };
      updateConfig(config: { bpm: number; timeSignature: '4/4'; subdivision: '8th' }): Promise<void>;
    } }).concurrentMetronome;
    const first = metronome.updateConfig({ bpm: 120, timeSignature: '4/4', subdivision: '8th' });
    const snapshot = metronome.getSnapshot();
    await metronome.updateConfig({ bpm: 220, timeSignature: '4/4', subdivision: '8th' }); await first;
    return { bpm: snapshot.config.bpm, running: snapshot.running };
  });
  expect(immediate).toEqual({ bpm: 80, running: true });
  await expect.poll(() => page.evaluate(() => (window as unknown as { concurrentMetronome: { getSnapshot(): { config: { bpm: number } } } }).concurrentMetronome.getSnapshot().config.bpm)).toBe(220);
  await page.evaluate(async () => {
    const ng = (window as unknown as { ng: { getComponent(element: Element): { playback: { playback: { playChordFromNotes(...args: unknown[]): Promise<void> } } } } }).ng;
    await ng.getComponent(document.querySelector('app-song-arrangement')!).playback.playback.playChordFromNotes(['E3', 'G3', 'B3'], 0.2, 0.3, 'normal', 'priority-preview');
  });
  if (await page.evaluate(() => !!navigator.mediaSession && typeof MediaMetadata !== 'undefined')) {
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Metronome');
  }
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { concurrentMetronome: { getSnapshot(): { running: boolean } } }).concurrentMetronome.getSnapshot().running)).toBe(true);
  await page.getByRole('link', { name: /Metronome/ }).first().click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('a gesture-rejected stream retries its prepared prefix without a new element or render', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play; let rejected = false;
    HTMLMediaElement.prototype.play = function() {
      if (!this.muted && !rejected) { rejected = true; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
      return play.call(this);
    };
  });
  await openLongSong(page); await instrumentLongSong(page); await resetStreamMetrics(page, 'cold');
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play prepared audio', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.longStreamRun.windows.length)).toBe(1);
  await page.getByRole('button', { name: 'Play prepared audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.longStreamRun.audio.length)).toBe(1);
  await page.getByRole('button', { name: 'Stop song', exact: true }).click();
});
