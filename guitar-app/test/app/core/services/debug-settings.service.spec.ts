import { TestBed } from '@angular/core/testing';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';

describe('DebugSettingsService', () => {
  const storageKey = 'debug-modules';

  beforeEach(() => {
    window.localStorage.removeItem(storageKey);
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    window.localStorage.removeItem(storageKey);
  });

  it('stores enabled debug modules in one persisted array', () => {
    const service = TestBed.inject(DebugSettingsService);

    service.setTunerDebugEnabled(true);

    expect(service.tunerDebugEnabled()).toBe(true);
    expect(service.isDebugEnabled('tuner')).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBe(JSON.stringify(['tuner']));
  });

  it('restores enabled modules from storage on creation', () => {
    window.localStorage.setItem(storageKey, JSON.stringify(['tuner']));

    const service = TestBed.inject(DebugSettingsService);

    expect(service.tunerDebugEnabled()).toBe(true);
    expect(service.enabledDebugModules()).toEqual(['tuner']);
  });

  it('ignores invalid stored payloads', () => {
    window.localStorage.setItem(storageKey, JSON.stringify(['tuner', 'unknown-module']));

    const service = TestBed.inject(DebugSettingsService);

    expect(service.enabledDebugModules()).toEqual(['tuner']);
  });

  it('removes modules from the shared array when disabled', () => {
    window.localStorage.setItem(storageKey, JSON.stringify(['tuner']));
    const service = TestBed.inject(DebugSettingsService);

    service.setTunerDebugEnabled(false);

    expect(service.tunerDebugEnabled()).toBe(false);
    expect(service.enabledDebugModules()).toEqual([]);
    expect(window.localStorage.getItem(storageKey)).toBe(JSON.stringify([]));
  });
});
