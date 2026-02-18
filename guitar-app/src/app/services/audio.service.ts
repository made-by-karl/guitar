import { Injectable, OnDestroy } from '@angular/core';
import * as Tone from 'tone';

@Injectable({
  providedIn: 'root'
})
export class AudioService implements OnDestroy {
  private context: Tone.BaseContext | null = null;
  private startPromise: Promise<void> | null = null;
  private handlersInstalled = false;

  private readonly samplers = new Map<string, Tone.Sampler>();
  private readonly samplerInitPromises = new Map<string, Promise<void>>();

  constructor() {
    this.installAutoResumeHandlers();
  }

  ngOnDestroy(): void {
    this.disposeAllSamplers();
  }

  private installAutoResumeHandlers(): void {
    if (this.handlersInstalled) return;
    this.handlersInstalled = true;

    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        await this.resumeIfSuspended();
      }
    });

    const resumeOnInteraction = async () => {
      await this.resumeIfSuspended();
    };

    document.addEventListener('touchstart', resumeOnInteraction, { once: false, passive: true });
    document.addEventListener('touchend', resumeOnInteraction, { once: false, passive: true });
    document.addEventListener('click', resumeOnInteraction, { once: false, passive: true });
  }

  /**
   * Ensures Tone.js is started and a context exists.
   * Safe to call repeatedly.
   */
  async ensureStarted(): Promise<void> {
    if (this.context) {
      await this.resumeIfSuspended();
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      await Tone.start();
      this.context = Tone.getContext();
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Ensures a sampler exists for the given key and that its buffers are loaded.
   * Safe to call repeatedly; concurrent calls are deduplicated per key.
   */
  async ensureSamplerInitialized(
    key: string,
    options: Partial<Tone.SamplerOptions> & { urls: Record<string, string>; onerror?: (error: any) => void }
  ): Promise<Tone.Sampler> {
    await this.ensureStarted();

    const existing = this.samplers.get(key);
    if (existing) {
      const inFlight = this.samplerInitPromises.get(key);
      if (inFlight) {
        await inFlight;
      }
      return existing;
    }

    const inFlight = this.samplerInitPromises.get(key);
    if (inFlight) {
      await inFlight;
      const sampler = this.samplers.get(key);
      if (!sampler) {
        throw new Error(`Sampler '${key}' was not created`);
      }
      return sampler;
    }

    const userOnload = options.onload;
    const userOnerror = options.onerror;

    let settled = false;
    let resolveInit!: () => void;
    let rejectInit!: (error: any) => void;

    const initPromise = new Promise<void>((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });

    const safeResolve = () => {
      if (settled) return;
      settled = true;
      resolveInit();
    };

    const safeReject = (error: any) => {
      if (settled) return;
      settled = true;
      rejectInit(error);
    };

    this.samplerInitPromises.set(key, initPromise);

    try {
      const sampler = new Tone.Sampler({
        ...options,
        onload: () => {
          try {
            userOnload?.();
          } finally {
            safeResolve();
          }
        },
        onerror: (error: any) => {
          try {
            userOnerror?.(error);
          } finally {
            safeReject(error);
          }
        }
      }).toDestination();

      // Store immediately so other callers can reuse while loading.
      this.samplers.set(key, sampler);

      await initPromise;

      return sampler;
    } catch (error) {
      safeReject(error);
      // If initialization fails, drop any partially-created sampler.
      this.disposeSampler(key);
      throw error;
    } finally {
      this.samplerInitPromises.delete(key);
    }
  }

  disposeSampler(key: string): void {
    const sampler = this.samplers.get(key);
    if (sampler) {
      try {
        sampler.dispose();
      } catch {
        // ignore
      }
    }

    this.samplers.delete(key);
    this.samplerInitPromises.delete(key);
  }

  disposeAllSamplers(): void {
    for (const key of this.samplers.keys()) {
      this.disposeSampler(key);
    }
  }

  getSampler(key: string): Tone.Sampler | null {
    return this.samplers.get(key) ?? null;
  }

  /**
   * Attempts to resume audio if a context exists and is suspended.
   */
  async resumeIfSuspended(): Promise<void> {
    if (!this.context) return;

    try {
      if (this.context.state === 'suspended') {
        await Tone.start();
      }
    } catch (error) {
      console.error('Failed to resume audio context:', error);
    }
  }

  getContext(): Tone.BaseContext | null {
    return this.context;
  }

  getTransport(): ReturnType<typeof Tone.getTransport> {
    return Tone.getTransport();
  }

  now(): number {
    return Tone.now();
  }
}
