import * as Tone from 'tone';
import { RenderedAudioService, RENDER_CACHE_BYTES, MAX_PENDING_RENDERS } from '@/app/core/services/rendered-audio.service';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { note } from '@/app/core/music/semitones';

const tone = Tone as typeof Tone & { __samplerInstances: { options: { urls: Record<string, string> }; dispose: jest.Mock; triggerAttackRelease: jest.Mock }[];
  __offlineContexts: { dispose: jest.Mock; close: jest.Mock; render: jest.Mock }[] };
const clean: MidiInstruction = { time: 0, playbackDuration: 0.5, actionDuration: 0.5, technique: 'normal', velocity: 0.7, notes: [{ note: note('E', 2) }] };

describe('Offline rendering, sample isolation and bounded cache', () => {
  let service: RenderedAudioService;
  let encoder: { encode: jest.Mock };
  beforeEach(() => {
    tone.__samplerInstances.length = 0; tone.__offlineContexts.length = 0;
    encoder = { encode: jest.fn(() => new Blob(['sound'])) };
    service = new RenderedAudioService(encoder as unknown as WavEncoderService);
  });
  afterEach(() => { service.ngOnDestroy(); jest.restoreAllMocks(); });

  it('deduplicates identical work, retains release tails and disposes temporary instruments and contexts', async () => {
    const [first, second] = await Promise.all([service.renderInstructions([clean], 1), service.renderInstructions([clean], 1)]);
    expect(first).toBe(second); expect(first.durationSeconds).toBe(3.5);
    expect(encoder.encode).toHaveBeenCalledTimes(1);
    expect(tone.__offlineContexts).toHaveLength(1);
    expect(tone.__offlineContexts[0]).toMatchObject({ channels: 1, sampleRate: 44100 });
    expect(tone.__samplerInstances[0].dispose).toHaveBeenCalled();
    expect(tone.__offlineContexts[0].close).toHaveBeenCalled();
    expect(tone.__offlineContexts[0].dispose).toHaveBeenCalled();
  });

  it('loads a distinct WAV bank for palm mute without requiring percussion or clean notes', async () => {
    await service.renderInstructions([{ ...clean, technique: 'palm-muted' }], 1);
    expect(tone.__samplerInstances).toHaveLength(1);
    expect(Object.values(tone.__samplerInstances[0].options.urls)).toEqual(expect.arrayContaining(['/samples/palm-muted/guitar_E2.wav', '/samples/palm-muted/guitar_E5.wav']));
    await service.renderInstructions([clean], 1);
    expect(encoder.encode).toHaveBeenCalledTimes(2);
    expect(tone.__samplerInstances[1].options.urls['E2']).toBe('/samples/notes/guitar_E2.mp3');
  });

  it('keeps queued sound and its cache identity detached from later plan edits', async () => {
    const source = { ...clean, notes: [{ note: note('E', 2) }] };
    const pending = service.renderInstructions([source], 1);
    source.notes[0].note.semitone = 'A';
    await pending;
    expect(tone.__samplerInstances[0].triggerAttackRelease).toHaveBeenCalledWith('E2', 0.5, 0, 0.7);
  });

  it('renders every group slide as an independent continuous pitch ramp and disposes its sources', async () => {
    const sources = (Tone as unknown as { __bufferSources: {
      playbackRate: { exponentialRampToValueAtTime: jest.Mock }; start: jest.Mock; stop: jest.Mock; dispose: jest.Mock
    }[] }).__bufferSources;
    sources.length = 0;
    await service.renderInstructions([{ ...clean, technique: 'slide', playbackDuration: 0.8,
      legatos: [
        { string: 0, source: { note: note('E', 2) }, target: { note: note('F#', 2) } },
        { string: 1, source: { note: note('A', 2) }, target: { note: note('B', 2) } }
      ] }], 1);
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      expect(source.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledWith(2 ** (2 / 12), 0.22);
      expect(source.start).toHaveBeenCalledWith(0, 0.03, undefined, 0.7);
      expect(source.stop).toHaveBeenCalledWith(0.8);
      expect(source.dispose).toHaveBeenCalled();
    }
  });

  it('evicts by byte size without owning or revoking any player URL; oversized results remain usable but uncached', async () => {
    encoder.encode.mockReturnValue({ size: RENDER_CACHE_BYTES * 0.6 } as Blob);
    const first = await service.renderInstructions([clean], 1);
    await service.renderInstructions([{ ...clean, velocity: 0.6 }], 1);
    expect(await service.renderInstructions([clean], 1)).not.toBe(first);
    encoder.encode.mockReturnValue({ size: RENDER_CACHE_BYTES + 1 } as Blob);
    const large = await service.renderInstructions([clean], 10);
    expect(await service.renderInstructions([clean], 10)).not.toBe(large);
  });

  it('does not let cancellation by one consumer cancel another identical request', async () => {
    const stopped = new AbortController(), active = new AbortController();
    const first = service.renderInstructions([clean], 1, stopped.signal);
    const second = service.renderInstructions([clean], 1, active.signal);
    stopped.abort();
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe('rejected'); expect(results[1].status).toBe('fulfilled');
    expect(encoder.encode).toHaveBeenCalledTimes(1);
  });

  it('stops loading further banks when every consumer cancels while the first bank is loading', async () => {
    const stopped = new AbortController();
    const pending = service.renderInstructions([clean, { ...clean, technique: 'palm-muted' }], 1, stopped.signal);
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    stopped.abort();
    await failure;
    expect(tone.__samplerInstances).toHaveLength(1);
    expect(tone.__samplerInstances[0].dispose).toHaveBeenCalled();
  });

  it('rejects failed required assets, allows retry and never substitutes the clean bank', async () => {
    const loading = jest.spyOn(service, 'sampler').mockRejectedValueOnce(new Error('Palm sample decode failed'));
    await expect(service.renderInstructions([{ ...clean, technique: 'palm-muted' }], 1)).rejects.toThrow('decode failed');
    expect(tone.__offlineContexts[0].dispose).toHaveBeenCalled();
    loading.mockRestore();
    await expect(service.renderInstructions([{ ...clean, technique: 'palm-muted' }], 1)).resolves.toBeDefined();
    expect(Object.values(tone.__samplerInstances[0].options.urls).every(url => url.includes('/palm-muted/'))).toBe(true);
  });

  it('times out a stalled slide load and disposes a buffer that arrives after the timeout', async () => {
    jest.useFakeTimers();
    let finish!: (buffer: Tone.ToneAudioBuffer) => void;
    jest.spyOn(Tone.ToneAudioBuffer, 'fromUrl').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = service.renderInstructions([{ ...clean, technique: 'slide',
      legato: { string: 0, source: { note: note('E', 2) }, target: { note: note('F#', 2) } }
    }], 1);
    const failure = expect(pending).rejects.toThrow('Slide samples could not be loaded');
    try {
      await jest.advanceTimersByTimeAsync(20001); await failure;
      const late = new Tone.ToneAudioBuffer(); finish(late);
      await Promise.resolve();
      expect(late.dispose).toHaveBeenCalled();
      expect(tone.__offlineContexts[0].dispose).toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('bounds a long arrangement and skips queued renders canceled before allocation', async () => {
    await expect(service.renderInstructions([clean], 700)).rejects.toThrow('too long');
    const controller = new AbortController();
    const pending = service.renderInstructions([clean], 1, controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(tone.__offlineContexts).toHaveLength(0);
  });

  it('bounds the pending queue and returns a recoverable busy error for excess work', async () => {
    const controllers = Array.from({ length: MAX_PENDING_RENDERS }, () => new AbortController());
    const requests = controllers.map((controller, index) => service.renderInstructions([{ ...clean, velocity: index / 10 }], 1, controller.signal));
    const settled = Promise.allSettled(requests);
    await expect(service.renderInstructions([{ ...clean, velocity: 0.99 }], 1)).rejects.toThrow('preparation is busy');
    controllers.forEach(controller => controller.abort());
    expect((await settled).every(result => result.status === 'rejected')).toBe(true);
  });
});
