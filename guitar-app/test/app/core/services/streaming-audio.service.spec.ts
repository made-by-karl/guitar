import { webcrypto } from 'node:crypto';
import { StreamingAudioService } from '@/app/core/services/streaming-audio.service';
import { StreamingAudioEncoderService } from '@/app/core/services/streaming-audio-encoder.service';
import { RenderedAudioService, RenderedWindow } from '@/app/core/services/rendered-audio.service';
import { PlaybackPlan } from '@/app/core/services/playback.service';
import { FakeMediaSource, FakeStreamAudio } from '@test/helpers/streaming-media';

const plan: PlaybackPlan = { totalDuration: 20, totalSegments: 1, segmentStartTimes: [0], instructions: [
  { time: 0, playbackDuration: 0.5, actionDuration: 0.5, technique: 'normal', velocity: 0.3, notes: [{ note: { semitone: 'E', octave: 2 } }] }
] };
const window = (start: number, end: number): RenderedWindow => ({ startFrame: start, endFrame: end, final: false, pcm: {} as AudioBuffer });

describe('stream preparation and encoded-cache ownership', () => {
  let service: StreamingAudioService;
  let render: jest.Mock;
  let encode: jest.Mock;
  let originalCrypto: PropertyDescriptor | undefined;
  beforeEach(() => {
    jest.useFakeTimers(); FakeMediaSource.instances = [];
    originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:stream') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    render = jest.fn(async (_notes, _duration, start: number, end: number) => window(start, end));
    encode = jest.fn(async () => new Uint8Array([1]));
    service = new StreamingAudioService({ renderWindow: render, streamingGain: jest.fn(async () => 1), instructionEnd: () => 3.5 } as unknown as RenderedAudioService,
      { encode } as unknown as StreamingAudioEncoderService);
    // Supply an already-proved platform; real encode/append/play/seek detection is
    // covered by the browser suite, while this controls asynchronous ownership.
    (service as unknown as { compatibility: Promise<unknown> }).compatibility = Promise.resolve(FakeMediaSource);
  });
  afterEach(() => {
    service.ngOnDestroy(); jest.useRealTimers();
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  });
  const attach = async (input = plan) => {
    const abort = new AbortController(), source = (await service.prepare(input, abort.signal))!;
    const audio = new FakeStreamAudio();
    await source.attach(audio as unknown as HTMLAudioElement, abort.signal, 0, { duration: jest.fn(), error: jest.fn() });
    return { source, audio, abort };
  };
  it('reuses encoded audio after browser/session release and invalidates it when musical inputs change', async () => {
    const first = await attach(); first.source.dispose();
    const second = await attach(); second.source.dispose();
    expect(render).toHaveBeenCalledTimes(1); expect(encode).toHaveBeenCalledTimes(1);
    const third = await attach({ ...plan, instructions: [{ ...plan.instructions[0], velocity: 0.7 }] }); third.source.dispose();
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('lets a cached seek finish while canceled speculative native work is still unresolved', async () => {
    const { source, audio } = await attach();
    let finish!: (value: RenderedWindow) => void;
    render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    audio.currentTime = 4; source.request(4); await jest.advanceTimersByTimeAsync(0);
    FakeMediaSource.instances[0].buffer.buffered.values = [];
    audio.currentTime = 0; source.request(0); await jest.advanceTimersByTimeAsync(0);
    expect(FakeMediaSource.instances[0].buffer.appended).toEqual([0, 0]);
    expect(render).toHaveBeenCalledTimes(2);
    finish(window(4 * 44100, 8 * 44100)); await jest.advanceTimersByTimeAsync(0);
    expect(FakeMediaSource.instances[0].buffer.appended).toEqual([0, 0]);
  });
  it('keeps short requests on complete-file playback without probing or rendering windows', async () => {
    expect(await service.prepare({ ...plan, totalDuration: 4 }, new AbortController().signal)).toBeUndefined();
    expect(render).not.toHaveBeenCalled(); expect(encode).not.toHaveBeenCalled();
  });
});
