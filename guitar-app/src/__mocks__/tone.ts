// Mock for Tone.js library
export class Sampler {
  triggerAttackRelease = jest.fn();
  toDestination = jest.fn().mockReturnThis();
  dispose = jest.fn();
  
  constructor() {
    return this;
  }
}

export const start = jest.fn();
export const now = jest.fn().mockReturnValue(0);

export const Transport = {
  bpm: { value: 120 },
  start: jest.fn(),
  stop: jest.fn(),
  schedule: jest.fn(),
  clear: jest.fn()
};

export const context = {
  state: 'running',
  resume: jest.fn()
};

export const getContext = jest.fn().mockReturnValue(context);
export const setContext = jest.fn();
