import { signal, WritableSignal } from '@angular/core';
import { DebugModuleKey, DebugSettingsService } from '@/app/core/services/debug-settings.service';
import { TunerService } from '@/app/features/tuner/services/tuner.service';

describe('TunerService', () => {
  const originalAudioContext = window.AudioContext;
  const originalMediaDevices = navigator.mediaDevices;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const sampleRate = 48_000;
  const frameLength = 4096;
  let debugSettings: {
    tunerDebugEnabled: WritableSignal<boolean>;
    setTunerDebugEnabled: jest.Mock;
    isDebugEnabled: jest.Mock<boolean, [string]>;
    enabledDebugModules: WritableSignal<DebugModuleKey[]>;
    setDebugEnabled: jest.Mock;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    debugSettings = {
      tunerDebugEnabled: signal(false),
      setTunerDebugEnabled: jest.fn(),
      isDebugEnabled: jest.fn((moduleKey: string) => moduleKey === 'tuner' && debugSettings.tunerDebugEnabled()),
      enabledDebugModules: signal([]),
      setDebugEnabled: jest.fn()
    };
  });

  afterEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudioContext
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices
    });
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.localStorage.removeItem('debug-modules');
  });

  it('reports unsupported browsers cleanly', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: undefined
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined
    });

    const service = createService();
    await service.start();

    expect(service.getSnapshot().supported).toBe(false);
    expect(service.getSnapshot().running).toBe(false);
    expect(service.getSnapshot().sessionStatus).toBe('idle');
    expect(service.getSnapshot().errorMessage).toContain('not supported');
  });

  it('marks permission denial distinctly', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: jest.fn()
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue({ name: 'NotAllowedError' })
      }
    });

    const service = createService();
    await service.start();

    expect(service.getSnapshot().permission).toBe('denied');
    expect(service.getSnapshot().running).toBe(false);
    expect(service.getSnapshot().sessionStatus).toBe('idle');
    expect(service.getSnapshot().errorMessage).toBe('Microphone permission was denied.');
  });

  it('starts and stops the microphone lifecycle cleanly', async () => {
    let animationFrameCallback: FrameRequestCallback | undefined;
    const mediaSession = createMockMediaSession();
    const disconnect = jest.fn();
    const connect = jest.fn();
    const resume = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    let phase = 0;
    const analyser = {
      fftSize: frameLength,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((buffer: Float32Array) => {
        const samples = createSignal(440, {
          phaseOffset: phase,
          amplitude: 0.28
        });
        buffer.set(samples);
        phase += buffer.length;
      })
    };
    const sourceNode = {
      connect,
      disconnect
    };
    const audioContext = {
      sampleRate,
      resume,
      close,
      createAnalyser: jest.fn(() => analyser),
      createMediaStreamSource: jest.fn(() => sourceNode)
    };
    const getUserMedia = jest.fn().mockResolvedValue(mediaSession.stream);

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: jest.fn(() => audioContext)
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      animationFrameCallback = callback;
      return 42;
    });
    window.cancelAnimationFrame = jest.fn();

    const service = createService();
    await service.start();
    animationFrameCallback?.(performance.now());
    animationFrameCallback?.(performance.now());

    expect(getUserMedia).toHaveBeenCalled();
    expect(resume).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(analyser);
    expect(service.getSnapshot().running).toBe(true);
    expect(service.getSnapshot().permission).toBe('granted');
    expect(service.getSnapshot().sessionStatus).toBe('running');
    expect(service.getSnapshot().displayInputLevel).toBeGreaterThan(0.08);

    service.stop();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(disconnect).toHaveBeenCalled();
    expect(mediaSession.stopTrack).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(service.getSnapshot().running).toBe(false);
    expect(service.getSnapshot().sessionStatus).toBe('stopped');
    expect(service.getSnapshot().displayInputLevel).toBe(0);
    expect(service.getSnapshot().pitchLocked).toBe(false);
  });

  it('transitions to an interrupted state when the microphone session goes inactive', async () => {
    let animationFrameCallback: FrameRequestCallback | undefined;
    const mediaSession = createMockMediaSession();
    const disconnect = jest.fn();
    const connect = jest.fn();
    const resume = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const analyser = {
      fftSize: frameLength,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((buffer: Float32Array) => {
        buffer.set(createSignal(440, { amplitude: 0.24 }));
      })
    };
    const sourceNode = {
      connect,
      disconnect
    };
    const audioContext = {
      sampleRate,
      resume,
      close,
      createAnalyser: jest.fn(() => analyser),
      createMediaStreamSource: jest.fn(() => sourceNode)
    };

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: jest.fn(() => audioContext)
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mediaSession.stream)
      }
    });

    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      animationFrameCallback = callback;
      return 99;
    });
    window.cancelAnimationFrame = jest.fn();

    const service = createService();
    await service.start();
    animationFrameCallback?.(performance.now());

    mediaSession.track.dispatchEvent(new Event('mute'));

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(99);
    expect(disconnect).toHaveBeenCalled();
    expect(mediaSession.stopTrack).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(service.getSnapshot().running).toBe(false);
    expect(service.getSnapshot().sessionStatus).toBe('interrupted');
    expect(service.getSnapshot().interruptionMessage).toBe('Microphone became inactive. Tap Start to reconnect.');
    expect(service.getSnapshot().errorMessage).toBeNull();
  });

  it('shows signal before pitch lock while acquiring a note', () => {
    const service = createService();
    const analyseNext = attachAnalysisHarness(service, [createSignal(110, { amplitude: 0.2 })]);

    const state = analyseNext();

    expect(state.signalPresent).toBe(true);
    expect(state.pitchLocked).toBe(false);
    expect(state.trackingState).toBe('acquiring');
    expect(Math.abs(state.rawFrequencyHz! - 110)).toBeLessThan(1.2);
    expect(state.displayInputLevel).toBeGreaterThan(0.05);
  });

  it('stores structured debug frames in memory when tuner debug is enabled', () => {
    debugSettings.tunerDebugEnabled.set(true);
    const service = createService();
    const analyseNext = attachAnalysisHarness(service, [createSignal(329.63, { amplitude: 0.22 })]);

    analyseNext();

    expect(service.hasDebugFrames()).toBe(true);
    const frames = (service as any).debugFrames as Array<{
      type: string;
      rawFrequencyHz: number | null;
      detector: {
        topLocalMinima: Array<{ lag: number; probability: number | null }>;
        topRankedCandidates: Array<{ lag: number; probability: number | null }>;
      } | null;
    }>;
    const frame = frames.at(-1)!;

    expect(frame.type).toBe('tuner-frame');
    expect(frame.rawFrequencyHz).not.toBeNull();
    expect(frame.detector).not.toBeNull();
    expect(frame.detector!.topLocalMinima.length).toBeGreaterThan(0);
    expect(frame.detector!.topLocalMinima[0].probability).not.toBeNull();
    expect(frame.detector!.topRankedCandidates.length).toBeGreaterThan(0);
    expect(frame.detector!.topRankedCandidates[0].probability).not.toBeNull();
  });

  it('downloads the captured debug log as json', () => {
    debugSettings.tunerDebugEnabled.set(true);
    const objectUrl = 'blob:debug-log';
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn()
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn()
    });
    const createObjectUrl = jest.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
    const revokeObjectUrl = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const appendSpy = jest.spyOn(document.body, 'appendChild');
    const removeSpy = jest.spyOn(document.body, 'removeChild');
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const service = createService();
    const analyseNext = attachAnalysisHarness(service, [createSignal(329.63, { amplitude: 0.22 })]);

    analyseNext();

    expect(service.downloadDebugData('Soft E4 sample')).toBe(true);
    expect(createObjectUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);

    const payload = service['buildDebugExportPayload']('Soft E4 sample') as { description: string | null };
    expect(payload.description).toBe('Soft E4 sample');
    expect((appendSpy.mock.calls[0][0] as HTMLAnchorElement).download).toContain('soft-e4-sample');
  });

  it('locks after stable pluck frames and holds through decay', () => {
    const service = createService();
    const analyseNext = attachAnalysisHarness(service, [
      createSignal(146.83, { amplitude: 0.22 }),
      createSignal(146.83, { amplitude: 0.22 }),
      createSignal(146.83, { amplitude: 0.18 }),
      new Float32Array(frameLength)
    ]);

    analyseNext();
    analyseNext();
    const locked = analyseNext();
    const decaying = analyseNext();

    expect(locked.pitchLocked).toBe(true);
    expect(locked.trackingState).toBe('locked');
    expect(Math.abs(locked.frequencyHz! - 146.83)).toBeLessThan(1);

    expect(decaying.pitchLocked).toBe(true);
    expect(decaying.trackingState).toBe('decaying');
    expect(Math.abs(decaying.frequencyHz! - locked.frequencyHz!)).toBeLessThan(0.2);
  });

  function attachAnalysisHarness(service: TunerService, frames: Float32Array[]): () => ReturnType<TunerService['getSnapshot']> {
    let frameIndex = 0;

    service['audioSession'].setTestSession({
      audioContext: { sampleRate } as AudioContext,
      analyser: {
        fftSize: frameLength,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData: (buffer: Float32Array) => {
          const nextFrame = frames[Math.min(frameIndex, frames.length - 1)];
          buffer.set(nextFrame);
          frameIndex += 1;
        }
      } as AnalyserNode,
      sampleBuffer: new Float32Array(frameLength)
    });
    service['tracker'].reset();
    service['patchState']({
      supported: true,
      permission: 'granted',
      running: true,
      sessionStatus: 'running',
      interruptionMessage: null,
      errorMessage: null
    });

    return () => {
      service['analyseCurrentFrame']();
      return service.getSnapshot();
    };
  }

  function createService(): TunerService {
    return new TunerService(debugSettings as unknown as DebugSettingsService);
  }

  function createMockMediaSession(): {
    stream: MediaStream;
    track: MediaStreamTrack;
    stopTrack: jest.Mock;
  } {
    const stopTrack = jest.fn();
    const track = new EventTarget() as MediaStreamTrack & EventTarget;
    Object.defineProperties(track, {
      stop: {
        configurable: true,
        value: stopTrack
      },
      muted: {
        configurable: true,
        writable: true,
        value: false
      },
      readyState: {
        configurable: true,
        writable: true,
        value: 'live'
      }
    });

    const stream = new EventTarget() as MediaStream & EventTarget;
    Object.defineProperties(stream, {
      active: {
        configurable: true,
        writable: true,
        value: true
      },
      getTracks: {
        configurable: true,
        value: () => [track]
      },
      getAudioTracks: {
        configurable: true,
        value: () => [track]
      }
    });

    return { stream, track, stopTrack };
  }

  function createSignal(
    frequencyHz: number,
    options: {
      amplitude?: number;
      harmonicAmplitudes?: number[];
      phaseOffset?: number;
    } = {}
  ): Float32Array {
    const amplitude = options.amplitude ?? 0.28;
    const harmonicAmplitudes = options.harmonicAmplitudes ?? [1];
    const phaseOffset = options.phaseOffset ?? 0;
    const samples = new Float32Array(frameLength);

    for (let index = 0; index < frameLength; index++) {
      let value = 0;

      for (let harmonicIndex = 0; harmonicIndex < harmonicAmplitudes.length; harmonicIndex++) {
        const harmonicAmplitude = harmonicAmplitudes[harmonicIndex];
        const harmonicNumber = harmonicIndex + 1;
        value += harmonicAmplitude * Math.sin((2 * Math.PI * frequencyHz * harmonicNumber * (index + phaseOffset)) / sampleRate);
      }

      samples[index] = value * amplitude;
    }

    return samples;
  }
});
