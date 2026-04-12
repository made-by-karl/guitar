import { TestBed } from '@angular/core/testing';
import { ConsoleLogStoreService } from '@/app/core/services/console-log-store.service';

describe('ConsoleLogStoreService', () => {
  let service: ConsoleLogStoreService;
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
  const originalConsole: Partial<Record<(typeof methods)[number], typeof console.log>> = {};
  const mockedConsole: Partial<Record<(typeof methods)[number], jest.Mock>> = {};

  beforeEach(() => {
    for (const method of methods) {
      originalConsole[method] = window.console[method];
      const mock = jest.fn();
      mockedConsole[method] = mock;
      Object.defineProperty(window.console, method, {
        configurable: true,
        writable: true,
        value: mock
      });
    }

    TestBed.configureTestingModule({});
    service = TestBed.inject(ConsoleLogStoreService);
    service.installConsoleCapture();
    service.clear();
  });

  afterEach(() => {
    service.clear();
    for (const method of methods) {
      mockedConsole[method]?.mockClear();
      const original = originalConsole[method];
      if (original) {
        Object.defineProperty(window.console, method, {
          configurable: true,
          writable: true,
          value: original
        });
      }
    }
  });

  it('captures console entries and still calls the original console method', () => {
    console.error('test-error', { code: 123 });

    const entries = service.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
    expect(entries[0].messageText).toContain('test-error');
    expect(entries[0].rawArgs).toEqual(['test-error', { code: 123 }]);
    expect(mockedConsole.error).toHaveBeenCalledWith('test-error', { code: 123 });
  });

  it('keeps only the latest 2000 entries', () => {
    for (let i = 0; i < 2005; i += 1) {
      console.log('entry', i);
    }

    const entries = service.entries();
    expect(entries).toHaveLength(2000);
    expect(entries[0].messageText).toContain('entry 5');
    expect(entries[entries.length - 1].messageText).toContain('entry 2004');
  });

  it('exports logs as json', () => {
    console.info('hello', { feature: 'logs' });

    const exported = JSON.parse(service.exportJson());
    expect(exported).toHaveLength(1);
    expect(exported[0].level).toBe('info');
    expect(exported[0].messageText).toContain('hello');
    expect(exported[0].args[1]).toEqual({ feature: 'logs' });
  });

  it('clears all entries', () => {
    console.warn('will be removed');
    service.clear();
    expect(service.entries()).toHaveLength(0);
  });
});
