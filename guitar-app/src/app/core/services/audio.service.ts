import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import * as Tone from 'tone';
import { Note, getNoteMidi, note } from '@/app/core/music/semitones';

export interface PitchSlideVoice {
  source: Note;
  target: Note;
  string: number;
  startTime: number;
  duration: number;
  glideDuration: number;
  velocity: number;
}

@Injectable({
  providedIn: 'root'
})
export class AudioService implements OnDestroy {
  private readonly slideAnchors = [note('E', 2), note('A', 2), note('D', 3), note('G', 3), note('B', 3), note('E', 4), note('E', 5)];
  private readonly slideBuffers = new Map<number, Tone.ToneAudioBuffer>();
  private readonly slideSources = new Set<Tone.ToneBufferSource>();
  private slideInitPromise: Promise<void> | null = null;
  private disposed = false;
  private context: Tone.BaseContext | null = null;
  private startPromise: Promise<void> | null = null;
  private handlersInstalled = false;
  private readonly resumedSubject = new Subject<void>();

  private readonly samplers = new Map<string, Tone.Sampler>();
  private readonly samplerInitPromises = new Map<string, Promise<void>>();

  readonly resumed$: Observable<void> = this.resumedSubject.asObservable();

  constructor() {
    this.installAutoResumeHandlers();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    for (const source of this.slideSources) source.dispose();
    this.slideSources.clear();
    for (const buffer of this.slideBuffers.values()) buffer.dispose();
    this.slideBuffers.clear();
    this.disposeAllSamplers();
    this.resumedSubject.complete();
  }

  private installAutoResumeHandlers(): void {
    if (this.handlersInstalled) return;
    this.handlersInstalled = true;

    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const attemptResume = async () => {
      await this.resumeIfSuspended();
    };

    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        await attemptResume();
      }
    });

    window.addEventListener('pageshow', attemptResume);
    window.addEventListener('focus', attemptResume);

    document.addEventListener('pointerdown', attemptResume, { once: false, passive: true });
    document.addEventListener('touchstart', attemptResume, { once: false, passive: true });
    document.addEventListener('touchend', attemptResume, { once: false, passive: true });
    document.addEventListener('click', attemptResume, { once: false, passive: true });
    document.addEventListener('keydown', attemptResume, { once: false, passive: true });
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

  async ensureSlideBuffersInitialized(): Promise<void> {
    await this.ensureStarted();
    if (this.slideBuffers.size === this.slideAnchors.length) return;
    if (!this.slideInitPromise) {
      this.slideInitPromise = Promise.all(this.slideAnchors.map(async (anchor, string) => {
        if (this.slideBuffers.has(string)) return;
        const buffer = await Tone.ToneAudioBuffer.fromUrl(`/samples/notes/guitar_${anchor.semitone}${anchor.octave}.mp3`);
        if (this.disposed) buffer.dispose();
        else this.slideBuffers.set(string, buffer);
      })).then(() => undefined);
    }
    try {
      await this.slideInitPromise;
    } finally {
      this.slideInitPromise = null;
    }
  }

  /** One independent sample voice with a continuous, semitone-linear pitch glide. */
  playPitchSlide(voice: PitchSlideVoice): void {
    const highestPitch = Math.max(getNoteMidi(voice.source), getNoteMidi(voice.target));
    const anchorIndex = this.slideAnchors.reduce((closest, anchor, index) =>
      Math.abs(getNoteMidi(anchor) - highestPitch) < Math.abs(getNoteMidi(this.slideAnchors[closest]) - highestPitch) ? index : closest, 0);
    const buffer = this.slideBuffers.get(anchorIndex);
    const anchor = this.slideAnchors[anchorIndex];
    if (!buffer) return;
    const startRate = 2 ** ((getNoteMidi(voice.source) - getNoteMidi(anchor)) / 12);
    const targetRate = 2 ** ((getNoteMidi(voice.target) - getNoteMidi(anchor)) / 12);
    const source = new Tone.ToneBufferSource({
      url: buffer, playbackRate: startRate, fadeIn: 0.01, fadeOut: 0.04,
      onended: () => {
        this.slideSources.delete(source);
        source.dispose();
      }
    }).toDestination();
    this.slideSources.add(source);
    source.playbackRate.setValueAtTime(startRate, voice.startTime);
    source.playbackRate.exponentialRampToValueAtTime(targetRate, voice.startTime + voice.glideDuration);
    // Skip the recorded pluck transient; the preceding action already sounded it.
    source.start(voice.startTime, Math.min(0.03, buffer.duration / 10), undefined, Math.min(1, voice.velocity));
    source.stop(voice.startTime + voice.duration);
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
    const context = this.context;
    if (!context) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
        if (this.isRunningState(context.state)) {
          this.resumedSubject.next();
        }
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

  private isRunningState(state: AudioContextState): state is 'running' {
    return state === 'running';
  }
}
