import { MetronomeService, MetronomeConfig } from '@/app/features/metronome/services/metronome.service';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';
import { playbackHarness } from '@test/helpers/media-playback';
const config: MetronomeConfig = { bpm: 80, timeSignature: '4/4', subdivision: '8th' };
const audio = { blob: new Blob(), durationSeconds: 12 };

describe('Rendered metronome', () => {
  function setup() {
    const { media, emit } = playbackHarness();
    const sampler = { triggerAttackRelease: jest.fn() };
    const rendered = {
      render: jest.fn(async (_key, duration, schedule, _signal, trim = 0) => {
        await schedule({}, []); return { blob: new Blob(), durationSeconds: duration - trim };
      }), sampler: jest.fn(async () => sampler)
    };
    const service = new MetronomeService(rendered as unknown as RenderedAudioService, media as unknown as HtmlAudioPlaybackService);
    return { service, rendered, media, emit, sampler };
  }
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it.each([20, 80, 260])('renders four looping measures plus decay pre-roll at %i BPM', async bpm => {
    const { service, rendered, media, sampler, emit } = setup();
    await service.start({ ...config, bpm });
    const tick = 60 / bpm / 2;
    expect(service.getSnapshot()).toMatchObject({ running: true, config: { bpm }, tickDurationSeconds: tick });
    expect(rendered.render).toHaveBeenCalledWith(expect.stringContaining('metronome:'), expect.any(Number), expect.any(Function), expect.any(AbortSignal), expect.any(Number));
    expect(media.play).toHaveBeenCalledWith('metronome', expect.any(Function), { loop: true, label: 'Metronome' });
    expect(sampler.triggerAttackRelease.mock.calls[0]).toEqual(['C#3', 0.2, 0, 1]);
    expect(sampler.triggerAttackRelease.mock.calls[1]).toEqual(['D3', 0.15, tick, 0.8]);
    for (const position of [0, tick * 8 * 3 + tick * 5, tick * 8 - 0.01, 0.01]) {
      emit('metronome', { currentTime: position });
      expect(service.getSnapshot().activeIndex).toBe(Math.floor(position / tick) % 8);
    }
    service.ngOnDestroy();
  });
  it('preserves grouped-meter accents and sixteenth subdivision spacing', async () => {
    const { service, sampler } = setup();
    await service.start({ bpm: 120, timeSignature: '6/8', subdivision: '16th' });
    expect(service.getSnapshot().labels).toHaveLength(12);
    expect(service.getSnapshot().tickDurationSeconds).toBe(0.125);
    expect(sampler.triggerAttackRelease.mock.calls[6]).toEqual(['C#3', 0.2, 0.75, 1]);
    service.ngOnDestroy();
  });
  it('keeps the old tempo during rendering and changes on the next tick with preserved beat order', async () => {
    const { service, rendered, emit } = setup();
    await service.start(config); emit('metronome', { currentTime: 0.8 });
    let finish!: (value: typeof audio) => void;
    rendered.render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const updating = service.updateConfig({ ...config, bpm: 100 });
    expect(service.getSnapshot()).toMatchObject({ running: true, preparing: true, config: { bpm: 80 }, activeIndex: 2 });
    finish(audio); await updating;
    await jest.advanceTimersByTimeAsync(320);
    expect(service.getSnapshot().config.bpm).toBe(80);
    await jest.advanceTimersByTimeAsync(10);
    expect(service.getSnapshot()).toMatchObject({ running: true, config: { bpm: 100 }, activeIndex: 3 });
    service.ngOnDestroy();
  });
  it('uses only the latest meter update and prevents pending changes from starting after Stop', async () => {
    const { service, rendered, media } = setup();
    await service.start(config);
    let finish!: (value: typeof audio) => void;
    rendered.render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const stale = service.updateConfig({ ...config, bpm: 60 });
    await service.updateConfig({ ...config, timeSignature: '6/8', subdivision: 'none' });
    finish(audio); await stale; await jest.advanceTimersByTimeAsync(376);
    expect(service.getSnapshot()).toMatchObject({ config: { timeSignature: '6/8' }, activeIndex: 0 });
    rendered.render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const stopped = service.updateConfig({ ...config, bpm: 260 }); service.stop();
    const count = media.play.mock.calls.length;
    finish(audio); await stopped; await jest.runAllTimersAsync();
    expect(media.play).toHaveBeenCalledTimes(count);
    expect(service.getSnapshot().running).toBe(false);
    service.ngOnDestroy();
  });
  it('retains a working loop after replacement failure and does not start when configuring stopped controls', async () => {
    const { service, rendered, media } = setup();
    await service.updateConfig({ ...config, timeSignature: '6/8', subdivision: '16th' });
    expect(media.play).not.toHaveBeenCalled(); expect(service.getSnapshot().labels).toHaveLength(12);
    await service.start(config); rendered.render.mockRejectedValueOnce(new Error('Decode failed'));
    await service.updateConfig({ ...config, bpm: 100 });
    expect(service.getSnapshot()).toMatchObject({ running: true, config: { bpm: 80 }, preparing: false, error: 'Decode failed' });
    service.ngOnDestroy();
  });

  it('replaces interrupted media when configuration changes and waits for an explicit resume', async () => {
    const { service, media, emit } = setup();
    await service.start(config);
    emit('metronome', { status: 'paused' });
    await service.updateConfig({ ...config, bpm: 120 });
    expect(media.play).toHaveBeenLastCalledWith('metronome', expect.any(Function), { label: 'Metronome', loop: true, autoStart: false });
    expect(service.getSnapshot()).toMatchObject({ running: false, config: { bpm: 120 } });
    emit('metronome', { status: 'playing' });
    expect(service.getSnapshot()).toMatchObject({ running: true, config: { bpm: 120 } });
    service.ngOnDestroy();
  });
});
