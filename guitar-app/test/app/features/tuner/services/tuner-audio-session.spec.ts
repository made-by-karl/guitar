import { TunerAudioSession } from '@/app/features/tuner/services/tuner-audio-session';

describe('TunerAudioSession partial acquisition', () => {
  const originalContext = window.AudioContext;
  const originalDevices = navigator.mediaDevices;
  afterEach(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: originalContext });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalDevices });
  });

  it.each(['reject', 'stop'] as const)('releases stream and context when resume is %s', async outcome => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const stop = jest.fn();
    const close = jest.fn().mockResolvedValue(undefined);
    const createAnalyser = jest.fn();
    const resume = jest.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: jest.fn(() => ({ resume, close, createAnalyser })) });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const session = new TunerAudioSession(jest.fn());
    const pending = session.startSession(4096);
    await Promise.resolve();
    if (outcome === 'stop') {
      session.stopSession();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      resolve();
      await pending;
    } else {
      reject(new Error('resume failed'));
      await expect(pending).rejects.toThrow('resume failed');
    }
    expect(stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(createAnalyser).not.toHaveBeenCalled();
    expect(session.hasActiveSession()).toBe(false);
  });
});
