import { computed, Injectable, Signal, signal, WritableSignal } from '@angular/core';

const DEBUG_MODULES_STORAGE_KEY = 'debug-modules';

export type DebugModuleKey = 'tuner';

@Injectable({
  providedIn: 'root'
})
export class DebugSettingsService {
  readonly enabledDebugModules: WritableSignal<DebugModuleKey[]> = signal(this.readStoredDebugModules());
  readonly tunerDebugEnabled: Signal<boolean> = computed(() => this.isDebugEnabled('tuner'));

  setTunerDebugEnabled(enabled: boolean): void {
    this.setDebugEnabled('tuner', enabled);
  }

  isDebugEnabled(moduleKey: DebugModuleKey): boolean {
    return this.enabledDebugModules().includes(moduleKey);
  }

  setDebugEnabled(moduleKey: DebugModuleKey, enabled: boolean): void {
    const nextModules = new Set(this.enabledDebugModules());

    if (enabled) {
      nextModules.add(moduleKey);
    } else {
      nextModules.delete(moduleKey);
    }

    const nextValue = Array.from(nextModules).sort();
    this.enabledDebugModules.set(nextValue);

    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DEBUG_MODULES_STORAGE_KEY, JSON.stringify(nextValue));
    } catch {
      // Ignore storage failures and keep the in-memory setting for the session.
    }
  }

  private readStoredDebugModules(): DebugModuleKey[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const storedValue = window.localStorage.getItem(DEBUG_MODULES_STORAGE_KEY);
      if (!storedValue) {
        return [];
      }

      const parsedValue = JSON.parse(storedValue);
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue.filter((entry): entry is DebugModuleKey => entry === 'tuner');
    } catch {
      return [];
    }
  }
}
