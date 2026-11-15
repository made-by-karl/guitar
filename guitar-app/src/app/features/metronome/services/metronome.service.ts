import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';
import { RenderedAudioService, RenderedAudio } from '@/app/core/services/rendered-audio.service';
import { buildMetronomeLabels, isMainBeatLabel, MetronomeSubdivision, normalizeSubdivision } from './metronome-labels';
import { getAccentedBeats, getTimeSignatureParts, parseTimeSignature, TimeSignature } from '@/app/core/music/rhythm/time-signature.model';

export interface MetronomeConfig { bpm: number; timeSignature: TimeSignature; subdivision: MetronomeSubdivision; }
export interface MetronomeState {
  running: boolean; config: MetronomeConfig; labels: string[]; activeIndex: number;
  tickAudioTime: number; tickDurationSeconds: number; preparing?: boolean; error?: string;
}
interface Loop {
  config: MetronomeConfig; labels: string[]; tickDurationSeconds: number;
}
const CHANNEL = 'metronome';

@Injectable({ providedIn: 'root' })
export class MetronomeService implements OnDestroy {
  private generation = 0;
  private abort?: AbortController;
  private boundary?: ReturnType<typeof setTimeout>;
  private pending?: Loop;
  private startRequested = false;
  private readonly progress: Subscription;
  private readonly stateSubject = new BehaviorSubject<MetronomeState>({
    running: false, config: { bpm: 80, timeSignature: '4/4', subdivision: '8th' },
    labels: buildMetronomeLabels('4/4', '8th'), activeIndex: -1, tickAudioTime: 0, tickDurationSeconds: 0.375
  });
  readonly state$ = this.stateSubject.asObservable();

  constructor(private rendered: RenderedAudioService, private media: HtmlAudioPlaybackService) {
    this.progress = media.progress$(CHANNEL).subscribe(progress => this.onProgress(progress));
  }
  getSnapshot(): MetronomeState { return this.stateSubject.value; }
  currentTime(): number { return this.media.getCurrentTime(CHANNEL); }
  async start(config: MetronomeConfig, autoStart = true): Promise<void> {
    this.cancelPending();
    this.startRequested = autoStart;
    const loop = this.normalize(config);
    this.pending = loop;
    this.stateSubject.next({ ...this.getSnapshot(), preparing: true, error: undefined });
    await this.media.play(CHANNEL, signal => this.renderLoop(loop, signal), {
      label: 'Metronome', loop: true, ...(autoStart ? {} : { autoStart: false })
    });
  }
  async updateConfig(config: MetronomeConfig): Promise<void> {
    const loop = this.normalize(config), previous = this.getSnapshot();
    if (!previous.running) {
      if (this.media.getSnapshot(CHANNEL).status !== 'idle') { await this.start(config, this.startRequested); return; }
      this.cancelPending();
      this.stateSubject.next({ ...previous, ...loop, activeIndex: -1, preparing: false, error: undefined });
      return;
    }
    this.cancelPending();
    const generation = this.generation;
    this.abort = new AbortController();
    this.stateSubject.next({ ...previous, preparing: true, error: undefined });
    try {
      const audio = await this.renderLoop(loop, this.abort.signal);
      if (generation !== this.generation || !this.getSnapshot().running) return;
      // Keep the old loop playing throughout preparation. Switch at its next tick,
      // retaining the beat index for tempo-only changes; other changes start at 1.
      const now = this.currentTime(), tick = previous.tickDurationSeconds;
      const nextTick = Math.floor(now / tick) + 1;
      const sameMeter = previous.config.timeSignature === loop.config.timeSignature && previous.config.subdivision === loop.config.subdivision;
      const startTime = sameMeter ? (nextTick % loop.labels.length) * loop.tickDurationSeconds : 0;
      this.boundary = setTimeout(() => {
        if (generation !== this.generation || !this.getSnapshot().running) return;
        this.pending = loop;
        this.startRequested = true;
        void this.media.play(CHANNEL, async () => audio, { label: 'Metronome', loop: true, startTime });
      }, Math.max(0, (nextTick * tick - now) * 1000));
    } catch (error) {
      if (generation !== this.generation) return;
      this.stateSubject.next({ ...this.getSnapshot(), preparing: false,
        error: error instanceof Error ? error.message : 'The change could not be prepared. The previous beat is still playing.' });
    }
  }
  stop(): void { this.cancelPending(); this.pending = undefined; this.media.stop(CHANNEL); }
  ngOnDestroy(): void { this.stop(); this.progress.unsubscribe(); this.media.release(CHANNEL); this.stateSubject.complete(); }
  private cancelPending(): void { this.generation++; this.abort?.abort(); clearTimeout(this.boundary); this.boundary = undefined; }
  private onProgress(progress: HtmlAudioProgress): void {
    const previous = this.getSnapshot();
    if (progress.status === 'idle') { this.cancelPending(); this.startRequested = false; }
    if (['playing', 'paused', 'ready', 'error'].includes(progress.status)) this.startRequested = false;
    if ((progress.status === 'playing' || progress.status === 'ready') && this.pending) {
      this.stateSubject.next({ ...previous, ...this.pending, preparing: false, error: undefined, running: progress.status === 'playing' });
      if (progress.status === 'playing') this.pending = undefined;
    }
    const state = this.getSnapshot();
    const running = progress.status === 'playing';
    const position = progress.currentTime;
    const activeIndex = running ? Math.floor(position / state.tickDurationSeconds) % state.labels.length : -1;
    const tickAudioTime = Math.floor(position / state.tickDurationSeconds) * state.tickDurationSeconds;
    const preparing = progress.status === 'preparing' || progress.status === 'starting' || (running && !!state.preparing);
    if (running !== state.running || activeIndex !== state.activeIndex || tickAudioTime !== state.tickAudioTime || preparing !== !!state.preparing) {
      this.stateSubject.next({ ...state, running, activeIndex, tickAudioTime, preparing, error: progress.error });
    }
  }
  private normalize(config: MetronomeConfig): Loop {
    const bpm = Number.isFinite(config.bpm) ? Math.min(260, Math.max(20, Math.round(config.bpm))) : 80;
    const timeSignature = parseTimeSignature(config.timeSignature), subdivision = normalizeSubdivision(timeSignature, config.subdivision);
    const { bottom } = getTimeSignatureParts(timeSignature);
    const tickDurationSeconds = (60 / bpm) / (subdivision === '16th' ? 4 : bottom === 8 || subdivision === '8th' ? 2 : 1);
    return { config: { bpm, timeSignature, subdivision }, labels: buildMetronomeLabels(timeSignature, subdivision), tickDurationSeconds };
  }
  private renderLoop(loop: Loop, signal: AbortSignal): Promise<RenderedAudio> {
    const measureDuration = loop.labels.length * loop.tickDurationSeconds;
    // One pre-roll measure supplies the preceding tick's decay at the loop's start.
    // Crop it after rendering: all four retained measures then meet at the same phase.
    const preRoll = Math.max(1, Math.ceil(1 / measureDuration));
    return this.rendered.render(`metronome:${JSON.stringify(loop.config)}`, measureDuration * (preRoll + 4), async (context, resources) => {
      const sampler = await this.rendered.sampler(context, resources, {
        C3: '/samples/metronome/snare-drum__025_mezzo-forte_with-snares.mp3',
        'C#3': '/samples/metronome/snare-drum__025_fortissimo_with-snares.mp3',
        D3: '/samples/metronome/djembe__05_forte_undamped.mp3'
      }, 0.6);
      const accented = getAccentedBeats(loop.config.timeSignature);
      for (let measure = 0; measure < preRoll + 4; measure++) loop.labels.forEach((label, index) => {
        const main = isMainBeatLabel(label), accent = main && accented.includes(Number(label));
        sampler.triggerAttackRelease(main ? accent ? 'C#3' : 'C3' : 'D3', main ? 0.2 : 0.15,
          (measure * loop.labels.length + index) * loop.tickDurationSeconds, main ? accent ? 1 : 0.85 : 0.8);
      });
    }, signal, measureDuration * preRoll);
  }
}
