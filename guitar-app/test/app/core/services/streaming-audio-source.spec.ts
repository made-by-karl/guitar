import { IncrementalAudioSource, EncodedAudioWindow } from '@/app/core/services/streaming-audio-source';
import { FakeMediaSource as Source, FakeStreamAudio as Audio } from '@test/helpers/streaming-media';
const fragment = (start: number): EncodedAudioWindow => ({ start, end: start + 4, bytes: new Uint8Array([1]), final: false });

describe('incremental source ownership, actual ranges and latest seek', () => {
  let source: IncrementalAudioSource, audio: Audio, abort: AbortController;
  let get: jest.Mock<Promise<EncodedAudioWindow>, [number, AbortSignal, number]>;
  const events = { duration: jest.fn(), error: jest.fn() };
  beforeEach(() => {
    jest.useFakeTimers(); Source.instances = []; audio = new Audio(); abort = new AbortController();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:stream') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    get = jest.fn(async start => fragment(start));
    source = new IncrementalAudioSource(120, Source as unknown as new() => MediaSource, 4, get);
    events.error.mockClear(); events.duration.mockClear();
  });
  afterEach(() => { source.dispose(); jest.useRealTimers(); });
  const attach = async () => source.attach(audio as unknown as HTMLAudioElement, abort.signal, 0, events);
  it('prepares a prefix, reuses buffered audio, respects demand and bounds speculative work', async () => {
    await attach(); expect(get).toHaveBeenCalledTimes(1);
    source.request(1); await jest.advanceTimersByTimeAsync(0); expect(get).toHaveBeenCalledTimes(1);
    audio.paused = false; Source.instances[0].dispatchEvent(new Event('endstreaming'));
    source.request(1); await jest.advanceTimersByTimeAsync(0); expect(get).toHaveBeenCalledTimes(1);
    Source.instances[0].dispatchEvent(new Event('startstreaming')); await jest.advanceTimersByTimeAsync(0);
    expect(get.mock.calls.map(call => call[0])).toEqual([0, 4, 8, 12, 16, 20]); expect(events.error).not.toHaveBeenCalled();
  });
  it('accepts only the latest unbuffered seek while paused', async () => {
    await attach(); let finish!: (value: EncodedAudioWindow) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    audio.currentTime = 52; source.request(52); await Promise.resolve(); const oldSignal = get.mock.calls[1][1];
    audio.currentTime = 100; source.request(100); expect(oldSignal.aborted).toBe(true);
    finish(fragment(52)); await jest.advanceTimersByTimeAsync(0);
    expect(Source.instances[0].buffer.appended).toEqual([0, 100]); expect(audio.paused).toBe(true); expect(events.error).not.toHaveBeenCalled();
  });
  it('requests an evicted browser range rather than assuming generated audio remains buffered', async () => {
    await attach(); Source.instances[0].buffer.buffered.values = []; source.request(0); await jest.advanceTimersByTimeAsync(0);
    expect(get.mock.calls.map(call => call[0])).toEqual([0, 0]);
  });
  it('invalidates late work and releases the URL once on route/Stop abort', async () => {
    await attach(); let finish!: (value: EncodedAudioWindow) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    audio.currentTime = 80; source.request(80); await Promise.resolve(); abort.abort(); finish(fragment(80)); await jest.advanceTimersByTimeAsync(0); source.dispose();
    expect(get.mock.calls[1][1].aborted).toBe(true); expect(Source.instances[0].buffer.appended).toEqual([0]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1); expect(events.error).not.toHaveBeenCalled();
  });
  it('retries quota once, then exposes failure instead of looping', async () => {
    await attach(); const buffer = Source.instances[0].buffer; buffer.quotaFailures = 2; audio.currentTime = 80; source.request(80); await jest.advanceTimersByTimeAsync(0);
    expect(events.error).toHaveBeenCalledWith(expect.objectContaining({ name: 'QuotaExceededError' })); expect(buffer.appendBuffer).toHaveBeenCalledTimes(3);
  });
  it('accepts native media seeks as well as transport requests', async () => {
    await attach(); audio.currentTime = 54; audio.seeking = true; audio.dispatchEvent(new Event('seeking'));
    await jest.advanceTimersByTimeAsync(0);
    expect(get.mock.calls.at(-1)![0]).toBe(52);
  });

  it('finishes at the final range endpoint and never reopens it after natural completion', async () => {
    await attach();
    get.mockImplementation(async start => {
      if (get.mock.calls.length > 3) throw new Error('Repeated final append');
      return { ...fragment(start), end: 120, final: true };
    });
    audio.currentTime = 120; audio.paused = false; source.request(120); await jest.advanceTimersByTimeAsync(0);
    expect(Source.instances[0].endOfStream).toHaveBeenCalledTimes(1);
    audio.ended = true; audio.paused = true; audio.dispatchEvent(new Event('timeupdate'));
    await jest.advanceTimersByTimeAsync(0);
    expect(get.mock.calls.map(call => call[0])).toEqual([0, 116]); expect(events.error).not.toHaveBeenCalled();
  });

  it('reuses the last buffered sample for a paused seek instead of reappending its window', async () => {
    await attach(); audio.currentTime = 4 - 1 / 44100; source.request(audio.currentTime);
    await jest.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1); expect(events.error).not.toHaveBeenCalled();
  });

});
