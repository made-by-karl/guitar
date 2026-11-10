// Mock for Tone.js library
export const __samplerInstances: Sampler[] = [];

export class Sampler {
  triggerAttackRelease = jest.fn();
  toDestination = jest.fn().mockReturnThis();
  dispose = jest.fn();
  
  options: any;
  constructor(...args: any[]) {
    this.options = args.length === 1 ? args[0] : args[1];
    __samplerInstances.push(this);

    // Tone.Sampler can be constructed in a few different ways:
    // - new Sampler(options)
    // - new Sampler(samples, options)
    // This mock supports the common pattern of passing an `onload` callback in options.
    const maybeOptions = args.length === 1 ? args[0] : args[1];
    if (maybeOptions && typeof maybeOptions.onload === 'function') {
      // Defer to the next tick to better match async loading.
      setTimeout(() => maybeOptions.onload(), 0);
    }
    return this;
  }
}

export const start = jest.fn();
export const now = jest.fn().mockReturnValue(0);

export const loaded = jest.fn().mockResolvedValue(undefined);

export const Transport = {
  bpm: { value: 120 },
  timeSignature: [4, 4],
  seconds: 0,
  state: 'stopped',
  start: jest.fn(() => {
    Transport.state = 'started';
  }),
  pause: jest.fn(() => {
    Transport.state = 'paused';
  }),
  stop: jest.fn(() => {
    Transport.state = 'stopped';
  }),
  schedule: jest.fn(),
  scheduleRepeat: jest.fn().mockReturnValue(1),
  clear: jest.fn()
};

export const context = {
  state: 'running',
  resume: jest.fn(async () => {
    context.state = 'running';
  })
};

export const getContext = jest.fn().mockReturnValue(context);
export const setContext = jest.fn();

export const getTransport = jest.fn().mockReturnValue(Transport);

export const __bufferSources: ToneBufferSource[] = [];

export class ToneAudioBuffer {
  get = jest.fn(() => fakeAudioBuffer(1, 24000, 24000));
  duration = 4;
  dispose = jest.fn();
  static fromUrl = jest.fn(async (_url: string) => new ToneAudioBuffer());
}

export class ToneBufferSource {
  playbackRate = {
    setValueAtTime: jest.fn().mockReturnThis(),
    exponentialRampToValueAtTime: jest.fn().mockReturnThis()
  };
  start = jest.fn().mockReturnThis();
  stop = jest.fn().mockReturnThis();
  dispose = jest.fn();
  toDestination = jest.fn().mockReturnThis();
  constructor(public options: { playbackRate: number; onended: () => void }) {
    __bufferSources.push(this);
  }
}

function fakeAudioBuffer(channels: number, length: number, sampleRate: number) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate,
    getChannelData: (channel: number) => data[channel],
    copyToChannel: (source: Float32Array, channel: number) => data[channel].set(source) };
}
export const __offlineContexts: OfflineContext[] = [];
export class OfflineContext {
  render = jest.fn(async () => new ToneAudioBuffer());
  close = jest.fn(async () => undefined);
  dispose = jest.fn();
  createBuffer = jest.fn(fakeAudioBuffer);
  constructor(public channels: number, public duration: number, public sampleRate: number) { __offlineContexts.push(this); }
}
