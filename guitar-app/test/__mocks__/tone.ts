// Mock for Tone.js library
export const __samplerInstances: Sampler[] = [];

export class Sampler {
  triggerAttackRelease = jest.fn();
  toDestination = jest.fn().mockReturnThis();
  dispose = jest.fn();
  
  constructor(...args: any[]) {
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
  start: jest.fn(),
  stop: jest.fn(),
  schedule: jest.fn(),
  scheduleRepeat: jest.fn().mockReturnValue(1),
  clear: jest.fn()
};

export const context = {
  state: 'running',
  resume: jest.fn()
};

export const getContext = jest.fn().mockReturnValue(context);
export const setContext = jest.fn();

export const getTransport = jest.fn().mockReturnValue(Transport);
