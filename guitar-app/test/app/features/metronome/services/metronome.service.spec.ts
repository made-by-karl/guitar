import * as Tone from 'tone';
import { MetronomeService } from '@/app/features/metronome/services/metronome.service';
import { AudioService } from '@/app/core/services/audio.service';

describe('MetronomeService', () => {
  beforeEach(() => {
    (Tone as any).__samplerInstances.length = 0;
    (Tone as any).Transport.scheduleRepeat.mockClear();
    (Tone as any).Transport.clear.mockClear();
    (Tone as any).Transport.start.mockClear();
    (Tone as any).loaded.mockClear();
  });

  it('schedules repeat ticks and clears only its own ids on stop', async () => {
    const audio = new AudioService();
    const ensureStartedSpy = jest.spyOn(audio, 'ensureStarted');
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'stopped';
    (Tone as any).Transport.seconds = 0;
    (Tone as any).Transport.scheduleRepeat.mockReturnValueOnce(42);

    await service.start({
      bpm: 120,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    expect(ensureStartedSpy).toHaveBeenCalled();
    expect((Tone as any).Transport.start).toHaveBeenCalled();
    expect((Tone as any).Transport.scheduleRepeat).toHaveBeenCalled();

    service.stop();
    expect((Tone as any).Transport.clear).toHaveBeenCalledWith(42);
    expect((Tone as any).Transport.stop).toHaveBeenCalled();
  });

  it('plays accented downbeat and sub-beat sounds', async () => {
    const audio = new AudioService();
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'started';
    (Tone as any).Transport.seconds = 0;
    (Tone as any).Transport.scheduleRepeat.mockReturnValueOnce(7);

    await service.start({
      bpm: 100,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    const callback = (Tone as any).Transport.scheduleRepeat.mock.calls[0][0];

    // first tick => label '1' => accented snare (C#3)
    callback(0.1);
    const sampler = (Tone as any).__samplerInstances[0];
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C#3', 0.2, 0.1, 1.0);

    // second tick => label '&' => djembe (D3)
    callback(0.2);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('D3', 0.15, 0.2, 0.8);
  });

  it('uses time-signature accent mapping for main beats (6/8 accents beat 4)', async () => {
    const audio = new AudioService();
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'started';
    (Tone as any).Transport.seconds = 0;
    (Tone as any).Transport.scheduleRepeat.mockReturnValueOnce(9);

    await service.start({
      bpm: 100,
      timeSignature: '6/8',
      subdivision: 'none'
    });

    const callback = (Tone as any).Transport.scheduleRepeat.mock.calls[0][0];
    const sampler = (Tone as any).__samplerInstances[0];

    // Beat 1
    callback(0.1);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C#3', 0.2, 0.1, 1.0);

    // Beat 2
    callback(0.2);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C3', 0.2, 0.2, 0.85);

    // Beat 3
    callback(0.3);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C3', 0.2, 0.3, 0.85);

    // Beat 4 (accented in 6/8)
    callback(0.4);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C#3', 0.2, 0.4, 1.0);
  });

  it('uses sixteenth intervals for 4/4 sixteenth subdivisions', async () => {
    const audio = new AudioService();
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'stopped';
    (Tone as any).Transport.seconds = 0;
    (Tone as any).Transport.scheduleRepeat.mockReturnValueOnce(5);

    await service.start({
      bpm: 120,
      timeSignature: '4/4',
      subdivision: '16th'
    });

    expect((Tone as any).Transport.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), '16n', '+0.05');
    expect(service.getSnapshot().tickDurationSeconds).toBeCloseTo(0.125);
  });

  it('updates labels immediately and reschedules when config changes while running', async () => {
    const audio = new AudioService();
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'started';
    (Tone as any).Transport.seconds = 0;
    (Tone as any).Transport.scheduleRepeat
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(12);

    await service.start({
      bpm: 100,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    await service.updateConfig({
      bpm: 100,
      timeSignature: '6/8',
      subdivision: '16th'
    });

    expect((Tone as any).Transport.clear).toHaveBeenCalledWith(11);
    expect((Tone as any).Transport.scheduleRepeat).toHaveBeenLastCalledWith(expect.any(Function), '16n', '+0.05');
    expect(service.getSnapshot().labels).toEqual(['1', 'e', '2', 'e', '3', 'e', '4', 'e', '5', 'e', '6', 'e']);
    expect(service.getSnapshot().running).toBe(true);
  });

  it('updates labels immediately without starting transport when config changes while stopped', async () => {
    const audio = new AudioService();
    const service = new MetronomeService(audio);

    (Tone as any).Transport.state = 'stopped';
    (Tone as any).Transport.seconds = 0;

    await service.updateConfig({
      bpm: 90,
      timeSignature: '4/4',
      subdivision: '16th'
    });

    expect((Tone as any).Transport.start).not.toHaveBeenCalled();
    expect(service.getSnapshot().labels).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a']);
    expect(service.getSnapshot().running).toBe(false);
  });
});
