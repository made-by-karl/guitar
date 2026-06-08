import { BehaviorSubject } from 'rxjs';
import * as Tone from 'tone';
import { MetronomeService } from '@/app/features/metronome/services/metronome.service';
import { HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

describe('MetronomeService', () => {
  const createService = () => {
    const progress = new BehaviorSubject<HtmlAudioProgress>({
      channel: 'metronome',
      currentTime: 0,
      duration: 10,
      ended: false
    });
    const htmlAudio = {
      play: jest.fn().mockResolvedValue(undefined),
      fadeOutAndStop: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      progress$: jest.fn(() => progress.asObservable())
    };
    const wavEncoder = {
      encode: jest.fn(() => new Blob(['wav'], { type: 'audio/wav' }))
    };

    return {
      service: new MetronomeService(htmlAudio as any, wavEncoder as any),
      htmlAudio,
      progress
    };
  };

  beforeEach(() => {
    (Tone as any).__samplerInstances.length = 0;
    (Tone as any).Offline.mockClear();
  });

  it('renders a loop and starts media playback', async () => {
    const { service, htmlAudio } = createService();

    await service.start({
      bpm: 120,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    expect((Tone as any).Offline).toHaveBeenCalledWith(expect.any(Function), 8);
    expect(htmlAudio.play).toHaveBeenCalledWith('metronome', 'blob:mock-audio-url', {
      loop: true,
      ownedUrl: true
    });
    expect(service.getSnapshot()).toEqual(expect.objectContaining({
      running: true,
      labels: ['1', '&', '2', '&', '3', '&', '4', '&'],
      activeIndex: -1,
      tickDurationSeconds: 0.25
    }));
  });

  it('renders accented, main, and sub-beat events for 4/4', async () => {
    const { service } = createService();

    await service.start({
      bpm: 100,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    const sampler = (Tone as any).__samplerInstances[0];
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'C#3', 0.2, 0, 1.0);
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'D3', 0.15, 0.3, 0.8);
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(3, 'C3', 0.2, 0.6, 0.85);
  });

  it('uses time-signature accent mapping for 6/8 beat 4', async () => {
    const { service } = createService();

    await service.start({
      bpm: 100,
      timeSignature: '6/8',
      subdivision: 'none'
    });

    const sampler = (Tone as any).__samplerInstances[0];
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'C#3', 0.2, 0, 1.0);
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'C3', 0.2, 0.3, 0.85);
    expect(sampler.triggerAttackRelease).toHaveBeenNthCalledWith(4, 'C#3', 0.2, 0.8999999999999999, 1.0);
  });

  it('derives active index from media progress', async () => {
    const { service, progress } = createService();

    await service.start({
      bpm: 120,
      timeSignature: '4/4',
      subdivision: '8th'
    });

    progress.next({
      channel: 'metronome',
      currentTime: 0.51,
      duration: 8,
      ended: false
    });

    expect(service.getSnapshot().activeIndex).toBe(2);
    expect(service.getSnapshot().tickAudioTime).toBeCloseTo(0.5);
  });

  it('updates labels immediately, fades the old loop, and starts the rendered replacement', async () => {
    const { service, htmlAudio } = createService();

    await service.start({
      bpm: 100,
      timeSignature: '4/4',
      subdivision: '8th'
    });
    (Tone as any).Offline.mockClear();

    await service.updateConfig({
      bpm: 100,
      timeSignature: '6/8',
      subdivision: '16th'
    });

    expect(service.getSnapshot().labels).toEqual(['1', 'e', '2', 'e', '3', 'e', '4', 'e', '5', 'e', '6', 'e']);
    expect(service.getSnapshot().running).toBe(true);
    expect((Tone as any).Offline).toHaveBeenCalledTimes(1);
    expect(htmlAudio.fadeOutAndStop).toHaveBeenCalledWith('metronome', 120);
    expect(htmlAudio.play).toHaveBeenCalledTimes(2);
    expect(htmlAudio.play).toHaveBeenLastCalledWith('metronome', 'blob:mock-audio-url', {
      loop: true,
      ownedUrl: true
    });
  });

  it('updates labels without starting media when config changes while stopped', async () => {
    const { service, htmlAudio } = createService();

    await service.updateConfig({
      bpm: 90,
      timeSignature: '4/4',
      subdivision: '16th'
    });

    expect(htmlAudio.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().labels).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a']);
    expect(service.getSnapshot().running).toBe(false);
  });
});
