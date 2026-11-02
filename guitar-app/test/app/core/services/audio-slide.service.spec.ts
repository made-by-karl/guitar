import * as Tone from 'tone';
import { AudioService } from '@/app/core/services/audio.service';
import { note, transpose } from '@/app/core/music/semitones';

interface SourceMock {
  options: { playbackRate: number; onended: () => void };
  playbackRate: { setValueAtTime: jest.Mock; exponentialRampToValueAtTime: jest.Mock };
  start: jest.Mock;
  stop: jest.Mock;
  dispose: jest.Mock;
}

const { __bufferSources: sources } = jest.requireActual<{ __bufferSources: SourceMock[] }>('tone');

describe('Continuous guitar slides', () => {
  let audio: AudioService;

  beforeEach(() => {
    sources.length = 0;
    jest.clearAllMocks();
    audio = new AudioService();
  });

  afterEach(() => audio.ngOnDestroy());

  it('shares preparation across concurrent requests and reuses decoded buffers', async () => {
    await Promise.all([audio.ensureSlideBuffersInitialized(), audio.ensureSlideBuffersInitialized()]);
    await audio.ensureSlideBuffersInitialized();
    expect(Tone.ToneAudioBuffer.fromUrl).toHaveBeenCalledTimes(7);
  });

  it.each([-12, -1, 1, 12])('glides %s semitones with one sample voice and no intermediate attacks', async shift => {
    await audio.ensureSlideBuffersInitialized();
    audio.playPitchSlide({ source: note('G', 3), target: transpose(note('G', 3), shift), string: 3,
      startTime: 2, duration: 0.8, glideDuration: 0.2, velocity: 0.7 });
    expect(sources).toHaveLength(1);
    const source = sources[0];
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(source.options.playbackRate, 2);
    expect(source.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      source.options.playbackRate * 2 ** (shift / 12), 2.2
    );
    expect(source.stop).toHaveBeenCalledWith(2.8);
    source.options.onended();
    expect(source.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps simultaneous voices independent and disposes active sources', async () => {
    await audio.ensureSlideBuffersInitialized();
    for (const string of [0, 1]) {
      audio.playPitchSlide({ source: note('E', 2), target: note('G', 2), string,
        startTime: 1, duration: 0.5, glideDuration: 0.15, velocity: 0.7 });
    }
    expect(sources).toHaveLength(2);
    expect(sources[0].playbackRate).not.toBe(sources[1].playbackRate);
    audio.ngOnDestroy();
    expect(sources.every(source => source.dispose.mock.calls.length > 0)).toBe(true);
  });
});
