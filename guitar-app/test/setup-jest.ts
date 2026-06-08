import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

/* global mocks for jsdom */
const mock = () => {
  let storage: { [key: string]: string } = {};
  return {
    getItem: (key: string) => (key in storage ? storage[key] : null),
    setItem: (key: string, value: string) => (storage[key] = value || ''),
    removeItem: (key: string) => delete storage[key],
    clear: () => (storage = {})
  };
};

Object.defineProperty(window, 'localStorage', { value: mock() });
Object.defineProperty(window, 'sessionStorage', { value: mock() });
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ['-webkit-appearance']
});

Object.defineProperty(document.body.style, 'transform', {
  value: () => {
    return {
      enumerable: true,
      configurable: true
    };
  }
});

Object.defineProperty(URL, 'createObjectURL', {
  value: jest.fn(() => 'blob:mock-audio-url'),
  writable: true,
  configurable: true
});

Object.defineProperty(URL, 'revokeObjectURL', {
  value: jest.fn(),
  writable: true,
  configurable: true
});

class MockAudio {
  currentTime = 0;
  duration = 10;
  ended = false;
  loop = false;
  paused = true;
  preload = '';
  src = '';
  volume = 1;
  private readonly listeners = new Map<string, Array<() => void>>();

  play = jest.fn(async () => {
    this.paused = false;
  });

  pause = jest.fn(() => {
    this.paused = true;
  });

  load = jest.fn();

  addEventListener = jest.fn((event: string, listener: () => void) => {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  });

  removeAttribute = jest.fn((name: string) => {
    if (name === 'src') {
      this.src = '';
    }
  });
}

Object.defineProperty(window, 'Audio', {
  value: MockAudio,
  writable: true
});

Object.defineProperty(global, 'Audio', {
  value: MockAudio,
  writable: true
});
