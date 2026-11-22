import { Injectable, OnDestroy } from '@angular/core';
import type { PlaybackPlan } from '@/app/core/services/playback.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { MIDI_SAMPLE_SET_VERSION } from '@/app/core/services/midi-renderer';
import { RenderedAudioService, RENDER_SAMPLE_RATE } from '@/app/core/services/rendered-audio.service';
import { StreamingAudioEncoderService, STREAM_MIME, STREAM_CODEC_REVISION } from '@/app/core/services/streaming-audio-encoder.service';
import { EncodedAudioWindow, IncrementalAudioSource, MediaSourceConstructor, mediaOperation, StreamingAudioSource } from '@/app/core/services/streaming-audio-source';

export const STREAM_THRESHOLD_SECONDS = 15;
export const STREAM_WINDOW_SECONDS = 4;
export const STREAM_FRAGMENT_CACHE_BYTES = 32 * 1024 * 1024;

interface PendingFragment { signals: Set<AbortSignal>; abort: AbortController; promise: Promise<EncodedAudioWindow>; }

@Injectable({ providedIn: 'root' })
export class StreamingAudioService implements OnDestroy {
  private compatibility?: Promise<MediaSourceConstructor | undefined>;
  private readonly cache = new Map<string, EncodedAudioWindow>();
  private readonly pending = new Map<string, PendingFragment>();
  private readonly sources = new Set<StreamingAudioSource>();
  private readonly lifetime = new AbortController();
  private bytes = 0;
  private disabled = false;
  private probeFailure?: string;

  constructor(private readonly rendered: RenderedAudioService, private readonly encoder: StreamingAudioEncoderService) {}

  async prepare(plan: PlaybackPlan, signal: AbortSignal): Promise<StreamingAudioSource | undefined> {
    if (this.disabled || signal.aborted) return undefined;
    const scoreDuration = plan.totalDuration;
    const serialized = JSON.stringify(plan.instructions);
    const instructions = JSON.parse(serialized) as MidiInstruction[];
    const duration = Math.max(scoreDuration, ...instructions.map(i => this.rendered.instructionEnd(i)));
    if (duration <= STREAM_THRESHOLD_SECONDS || !Number.isFinite(duration) || duration > 603) return undefined;
    const Source = await (this.compatibility ??= this.probe());
    if (signal.aborted || this.lifetime.signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
    if (!Source) return undefined;
    const identity = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
      JSON.stringify({ instructions, scoreDuration, sampleRevision: MIDI_SAMPLE_SET_VERSION,
        codec: STREAM_CODEC_REVISION, sampleRate: RENDER_SAMPLE_RATE, windowSeconds: STREAM_WINDOW_SECONDS })
    )))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const gain = await this.rendered.streamingGain(instructions, signal);
    if (signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
    const source = new IncrementalAudioSource(duration, Source, STREAM_WINDOW_SECONDS, (start, abort, priority) => {
      const startFrame = Math.round(start * RENDER_SAMPLE_RATE);
      const endFrame = Math.min(Math.ceil(duration * RENDER_SAMPLE_RATE), startFrame + STREAM_WINDOW_SECONDS * RENDER_SAMPLE_RATE);
      return this.fragment(`${identity}:${gain}:${startFrame}:${endFrame}`, abort, async workSignal => {
        const window = await this.rendered.renderWindow(instructions, scoreDuration, startFrame, endFrame, workSignal, gain, priority,
          endFrame === Math.ceil(duration * RENDER_SAMPLE_RATE));
        let bytes: Uint8Array;
        try { bytes = await this.encoder.encode(window.pcm, workSignal); }
        catch (error) { if (workSignal.aborted) throw error; throw new Error(`Streaming encode: ${error instanceof Error ? error.message : String(error)}`); }
        return { bytes, start: window.startFrame / RENDER_SAMPLE_RATE, end: window.endFrame / RENDER_SAMPLE_RATE, final: window.final };
      });
    });
    source.onPlaybackError = () => { this.disabled = true; };
    const dispose = source.dispose;
    source.dispose = () => { dispose(); this.sources.delete(source); };
    const attach = source.attach.bind(source);
    source.attach = async (audio, abort, startTime, events) => {
      try { await attach(audio, abort, startTime, { ...events, error: error => { this.disabled = true; this.probeFailure = error instanceof Error ? error.stack : String(error); events.error(error); } }); }
      catch (error) { if (!abort.aborted) { this.disabled = true; this.probeFailure = error instanceof Error ? error.stack : String(error); } throw error; }
    };
    this.sources.add(source);
    return source;
  }

  private fragment(key: string, signal: AbortSignal, create: (signal: AbortSignal) => Promise<EncodedAudioWindow>): Promise<EncodedAudioWindow> {
    if (signal.aborted || this.lifetime.signal.aborted) return Promise.reject(new DOMException('Playback canceled', 'AbortError'));
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return Promise.resolve(cached); }
    let pending = this.pending.get(key);
    if (pending?.abort.signal.aborted) { this.pending.delete(key); pending = undefined; }
    if (!pending) {
      if (this.pending.size >= 8) return Promise.reject(new Error('Audio preparation is busy. Retry playback.'));
      const abort = new AbortController(), signals = new Set<AbortSignal>();
      const promise = Promise.resolve().then(() => create(abort.signal)).then(fragment => {
        if (abort.signal.aborted || this.lifetime.signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
        const size = fragment.bytes.byteLength;
        if (size <= STREAM_FRAGMENT_CACHE_BYTES) {
          while (this.bytes + size > STREAM_FRAGMENT_CACHE_BYTES) {
            const oldest = this.cache.entries().next().value;
            if (!oldest) break;
            this.cache.delete(oldest[0]); this.bytes -= oldest[1].bytes.byteLength;
          }
          this.cache.set(key, fragment); this.bytes += size;
        }
        return fragment;
      }).finally(() => { if (this.pending.get(key)?.promise === promise) this.pending.delete(key); });
      pending = { signals, abort, promise }; this.pending.set(key, pending);
    }
    const job = pending;
    job.signals.add(signal);
    return new Promise<EncodedAudioWindow>((resolve, reject) => {
      const canceled = () => {
        if ([...job.signals].every(s => s.aborted)) job.abort.abort();
        reject(new DOMException('Playback canceled', 'AbortError'));
      };
      signal.addEventListener('abort', canceled, { once: true });
      void job.promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', canceled));
    });
  }

  private async probe(): Promise<MediaSourceConstructor | undefined> {
    if (typeof window === 'undefined' || !window.isSecureContext) return undefined;
    const api = window as typeof window & { ManagedMediaSource?: typeof MediaSource };
    const candidates = [api.ManagedMediaSource, typeof MediaSource === 'undefined' ? undefined : MediaSource].filter((Source): Source is typeof MediaSource => !!Source && Source.isTypeSupported(STREAM_MIME));
    if (!candidates.length) return undefined;
    try {
      const pcm = new AudioBuffer({ numberOfChannels: 1, length: 35280, sampleRate: RENDER_SAMPLE_RATE });
      // A muted, disposable compatibility probe; it never claims Media Session or
      // unlocks the actual transport, which still obeys user-gesture restrictions.
      const bytes = await this.encoder.encode(pcm, this.lifetime.signal);
      for (const Source of candidates) {
        const audio = document.createElement('audio');
        let url: string | undefined;
        audio.muted = true; audio.disableRemotePlayback = true;
        try {
          const media = new Source();
          url = URL.createObjectURL(media);
          await mediaOperation(media, 'sourceopen', this.lifetime.signal, () => { audio.src = url!; }, 3000);
          const buffer = media.addSourceBuffer(STREAM_MIME);
          await mediaOperation(buffer, 'updateend', this.lifetime.signal, () => buffer.appendBuffer(bytes.slice().buffer), 3000);
          media.endOfStream();
          await mediaOperation(audio, 'playing', this.lifetime.signal, () => audio.play(), 3000);
          await mediaOperation(audio, 'timeupdate', this.lifetime.signal, () => undefined, 3000);
          if (audio.currentTime <= 0 || !buffer.buffered.length) throw new Error('Media clock did not advance.');
          await mediaOperation(audio, 'seeked', this.lifetime.signal, () => { audio.currentTime = 0.5; }, 3000);
          if (Math.abs(audio.currentTime - 0.5) > 0.05) throw new Error('Streaming seek was not accepted.');
          return Source;
        } catch (error) { this.probeFailure = error instanceof Error ? error.message : String(error); }
        finally { audio.pause(); audio.removeAttribute('src'); audio.load(); if (url) URL.revokeObjectURL(url); }
      }
    } catch (error) { this.probeFailure = error instanceof Error ? error.message : String(error); }
    return undefined;
  }

  ngOnDestroy(): void {
    this.lifetime.abort();
    for (const source of this.sources) source.dispose();
    for (const job of this.pending.values()) job.abort.abort();
    this.cache.clear(); this.bytes = 0;
  }
}
