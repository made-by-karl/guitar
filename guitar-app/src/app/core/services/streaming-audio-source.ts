import { STREAM_MIME } from '@/app/core/services/streaming-audio-encoder.service';

export interface EncodedAudioWindow { bytes: Uint8Array; start: number; end: number; final: boolean; }
export interface StreamingSourceEvents { duration(seconds: number): void; error(error: unknown): void; }
export interface StreamingAudioSource {
  readonly kind: 'stream';
  readonly durationSeconds: number;
  attach(audio: HTMLAudioElement, signal: AbortSignal, startTime: number, events: StreamingSourceEvents): Promise<void>;
  request(time: number): void;
  dispose(): void;
  onPlaybackError?(): void;
}
export type MediaSourceConstructor = new() => MediaSource;

/** Event and operation must both finish: Playing can precede SourceBuffer.updateend. */
export function mediaOperation(target: EventTarget, event: string, signal: AbortSignal, action: () => void | Promise<void>, timeoutMs = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let observed = false, completed = false;
    const cleanup = () => {
      clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', fail); signal.removeEventListener('abort', abort);
    };
    const finish = () => { if (observed && completed) { cleanup(); resolve(); } };
    const done = () => { observed = true; finish(); };
    const fail = (error?: unknown) => { cleanup(); reject(error instanceof Error ? error : new Error('Streaming media could not be prepared. Retry playback.')); };
    const abort = () => fail(new DOMException('Playback canceled', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Streaming media timed out. Retry playback.')), timeoutMs);
    target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try { void Promise.resolve(action()).then(() => { completed = true; finish(); }, fail); } catch (error) { fail(error); }
  });
}

const rangeAt = (ranges: TimeRanges, time: number): number | undefined => {
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= time + 0.000001 && ranges.end(index) > time + 0.000001) return ranges.end(index);
  }
  return undefined;
};

export class IncrementalAudioSource implements StreamingAudioSource {
  readonly kind = 'stream' as const;
  onPlaybackError?: () => void;
  private audio?: HTMLAudioElement;
  private media?: MediaSource;
  private buffer?: SourceBuffer;
  private url?: string;
  private readonly lifetime = new AbortController();
  private work?: AbortController;
  private workStart?: number;
  private events?: StreamingSourceEvents;
  private version = 0;
  private target = 0;
  private busy = false;
  private timer?: ReturnType<typeof setTimeout>;
  private failed = false;
  private demand = true;
  private completeDuration?: number;
  private removeAbort?: () => void;
  private readonly listeners: (() => void)[] = [];

  constructor(
    public durationSeconds: number,
    private readonly Source: MediaSourceConstructor,
    private readonly windowSeconds: number,
    private readonly getWindow: (start: number, signal: AbortSignal, priority: number) => Promise<EncodedAudioWindow>
  ) {}

  async attach(audio: HTMLAudioElement, signal: AbortSignal, startTime: number, events: StreamingSourceEvents): Promise<void> {
    this.audio = audio; this.events = events; this.target = startTime; this.busy = true;
    signal.addEventListener('abort', this.dispose, { once: true });
    this.removeAbort = () => signal.removeEventListener('abort', this.dispose);
    const first = await this.getWindow(Math.floor(startTime / this.windowSeconds) * this.windowSeconds, this.lifetime.signal, 1);
    if (this.lifetime.signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
    const media = this.media = new this.Source();
    // ManagedMediaSource requires an AirPlay alternative or explicit opt-out.
    audio.disableRemotePlayback = true;
    this.url = URL.createObjectURL(media);
    await mediaOperation(media, 'sourceopen', this.lifetime.signal, () => { audio.src = this.url!; });
    this.buffer = media.addSourceBuffer(STREAM_MIME);
    this.listen(media, 'startstreaming', () => { this.demand = true; this.wake(); });
    this.listen(media, 'endstreaming', () => { this.demand = false; });
    this.listen(this.buffer, 'bufferedchange', () => this.wake());
    for (const event of ['timeupdate', 'play']) this.listen(audio, event, () => this.wake());
    this.listen(audio, 'seeking', () => this.request(audio.currentTime));
    await this.append(first);
    media.duration = this.durationSeconds;
    if (this.lifetime.signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
    audio.currentTime = Math.min(startTime, this.durationSeconds);
    // Managed bufferedchange can fire before the initial append completes.
    this.busy = false;
    // Let the transport expose Ready and call play before speculative preparation.
    this.timer = setTimeout(() => this.wake(), 0);
  }

  request(time: number): void {
    const target = Math.max(0, Math.min(time, this.durationSeconds));
    this.target = target;
    if (this.buffer && rangeAt(this.buffer.buffered, this.target) === undefined &&
      (this.workStart !== this.windowStart(target) || this.work?.signal.aborted)) {
      this.version++; this.work?.abort();
    }
    this.wake();
  }

  dispose = (): void => {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(); this.work?.abort(); this.removeAbort?.();
    if (this.timer !== undefined) clearTimeout(this.timer);
    for (const remove of this.listeners.splice(0)) remove();
    this.audio?.pause();
    if (this.buffer?.updating) { try { this.buffer.abort(); } catch { /* Detached media. */ } }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined; this.buffer = undefined; this.media = undefined; this.audio = undefined;
  };

  private listen(target: EventTarget, event: string, callback: () => void): void {
    target.addEventListener(event, callback); this.listeners.push(() => target.removeEventListener(event, callback));
  }
  private wake(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.busy || this.failed || this.lifetime.signal.aborted || !this.audio || !this.buffer) return;
    this.busy = true;
    void this.pump().catch(error => {
      if (!this.lifetime.signal.aborted) { this.failed = true; this.events?.error(error); }
    }).finally(() => {
      this.busy = false;
      if (!this.lifetime.signal.aborted && !this.failed && this.audio && !this.audio.paused && !this.audio.ended) {
        this.timer = setTimeout(() => this.wake(), 250);
      }
    });
  }
  private async pump(): Promise<void> {
    const audio = this.audio!, buffer = this.buffer!, media = this.media!;
    while (!this.lifetime.signal.aborted) {
      const position = Math.max(0, Math.min(audio.currentTime, this.durationSeconds));
      const end = rangeAt(buffer.buffered, position);
      const finalBuffered = buffer.buffered.length > 0 && buffer.buffered.end(buffer.buffered.length - 1) >= this.durationSeconds - 0.0001;
      // At the exact end there is no containing half-open TimeRange. In particular,
      // shrinking a release estimate can clamp a seek straight onto that endpoint.
      // Do not reopen an ended source by repeatedly appending its cached last window.
      if (this.completeDuration !== undefined && finalBuffered &&
        (audio.ended || position >= this.durationSeconds - 0.0001 || (end !== undefined && end >= this.durationSeconds - 0.0001))) {
        if (media.readyState === 'open' && !buffer.updating) media.endOfStream();
        return;
      }
      // Paused seeks prepare the target but never start playback or fill an entire song.
      if (end !== undefined && (audio.paused || end - position >= 24 || (!this.demand && end - position >= 4))) return;
      const start = this.windowStart((end ?? position) + 0.00001);
      this.workStart = start;
      const version = this.version;
      const work = this.work = new AbortController();
      const cancel = () => work.abort(); this.lifetime.signal.addEventListener('abort', cancel, { once: true });
      try {
        const fragment = await this.getWindow(start, work.signal, end === undefined || end - position < 8 ? 1 : 2);
        if (work.signal.aborted || version !== this.version) continue;
        await this.append(fragment);
        await this.prune(audio.currentTime);
      } catch (error) {
        if (this.lifetime.signal.aborted) return;
        if (work.signal.aborted && version !== this.version) continue;
        throw error;
      } finally { this.lifetime.signal.removeEventListener('abort', cancel); }
    }
  }
  private windowStart(position: number): number {
    return Math.max(0, Math.min(Math.floor(position / this.windowSeconds) * this.windowSeconds,
      (Math.ceil(this.durationSeconds / this.windowSeconds) - 1) * this.windowSeconds));
  }
  private async append(fragment: EncodedAudioWindow): Promise<void> {
    const buffer = this.buffer!, media = this.media!;
    const append = () => mediaOperation(buffer, 'updateend', this.lifetime.signal, () => {
      buffer.timestampOffset = fragment.start;
      buffer.appendBuffer(fragment.bytes.slice().buffer);
    });
    try { await append(); }
    catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
      await this.prune(this.audio?.currentTime ?? this.target, true);
      await append(); // One bounded retry; failure exposes an explicit complete-file retry.
    }
    if (fragment.final) {
      this.completeDuration = this.durationSeconds = fragment.end;
      // A playing seek can target the initial release estimate beyond the final
      // audible sample. Clamp before shrinking duration so WebKit does not pause
      // the element at an unbuffered old endpoint. Paused seeks stay paused.
      if (this.audio && this.audio.currentTime >= fragment.end) {
        this.audio.currentTime = Math.max(fragment.start, fragment.end - 1 / 44100);
      }
      if (media.readyState === 'open') media.duration = fragment.end;
      this.events?.duration(fragment.end);
    }
  }
  private async prune(position: number, aggressive = false): Promise<void> {
    const buffer = this.buffer!;
    const behind = Math.max(0, position - (aggressive ? 2 : 8));
    if (behind > 0 && buffer.buffered.length && buffer.buffered.start(0) < behind) {
      await mediaOperation(buffer, 'updateend', this.lifetime.signal, () => buffer.remove(0, behind));
    }
    const ahead = position + (aggressive ? 8 : 32);
    if (buffer.buffered.length && buffer.buffered.end(buffer.buffered.length - 1) > ahead) {
      await mediaOperation(buffer, 'updateend', this.lifetime.signal, () => buffer.remove(ahead, Infinity));
    }
  }
}
