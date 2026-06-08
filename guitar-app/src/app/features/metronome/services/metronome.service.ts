import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as Tone from 'tone';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';
import {
  buildMetronomeLabels,
  isMainBeatLabel,
  MetronomeSubdivision,
  normalizeSubdivision
} from '@/app/features/metronome/services/metronome-labels';
import { getAccentedBeats, getTimeSignatureParts, parseTimeSignature, TimeSignature } from '@/app/core/music/rhythm/time-signature.model';

export interface MetronomeConfig {
  bpm: number;
  timeSignature: TimeSignature;
  subdivision: MetronomeSubdivision;
}

export interface MetronomeState {
  running: boolean;
  config: MetronomeConfig;
  labels: string[];
  activeIndex: number;
  tickAudioTime: number;
  tickDurationSeconds: number;
}

interface RenderedMetronomeLoop {
  url: string;
  blob: Blob;
  durationSeconds: number;
  labels: string[];
  tickDurationSeconds: number;
}

const METRONOME_CHANNEL = 'metronome';
const METRONOME_LOOP_MEASURES = 4;
const METRONOME_CONFIG_FADE_MS = 120;

@Injectable({
  providedIn: 'root'
})
export class MetronomeService implements OnDestroy {
  private activeLoop: RenderedMetronomeLoop | null = null;
  private progressSubscription: Subscription | null = null;
  private configUpdateGeneration = 0;

  private readonly stateSubject = new BehaviorSubject<MetronomeState>({
    running: false,
    config: { bpm: 80, timeSignature: '4/4', subdivision: '8th' },
    labels: buildMetronomeLabels('4/4', '8th'),
    activeIndex: -1,
    tickAudioTime: 0,
    tickDurationSeconds: 0.5
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private htmlAudioPlaybackService: HtmlAudioPlaybackService,
    private wavEncoder: WavEncoderService
  ) {}

  ngOnDestroy(): void {
    this.stop();
    this.revokeLoop(this.activeLoop);
  }

  getSnapshot(): MetronomeState {
    return this.stateSubject.getValue();
  }

  async start(config: MetronomeConfig): Promise<void> {
    this.configUpdateGeneration++;
    const normalized = this.normalizeConfig(config);
    const loop = await this.renderLoop(normalized.config, normalized.labels, normalized.tickDurationSeconds);
    this.revokeLoop(this.activeLoop);
    this.activeLoop = loop;
    this.subscribeProgress();

    this.stateSubject.next({
      running: true,
      config: normalized.config,
      labels: normalized.labels,
      activeIndex: -1,
      tickAudioTime: 0,
      tickDurationSeconds: normalized.tickDurationSeconds
    });

    await this.htmlAudioPlaybackService.play(METRONOME_CHANNEL, loop.url, { loop: true, ownedUrl: true });
  }

  async updateConfig(config: MetronomeConfig): Promise<void> {
    const state = this.stateSubject.getValue();
    const normalized = this.normalizeConfig(config);

    this.stateSubject.next({
      running: state.running,
      config: normalized.config,
      labels: normalized.labels,
      activeIndex: -1,
      tickAudioTime: 0,
      tickDurationSeconds: normalized.tickDurationSeconds
    });

    if (!state.running) {
      return;
    }

    const generation = ++this.configUpdateGeneration;
    const previousLoop = this.activeLoop;
    this.activeLoop = null;

    const [loop] = await Promise.all([
      this.renderLoop(normalized.config, normalized.labels, normalized.tickDurationSeconds),
      this.htmlAudioPlaybackService.fadeOutAndStop(METRONOME_CHANNEL, METRONOME_CONFIG_FADE_MS)
    ]);

    this.revokeLoop(previousLoop);

    const latestState = this.stateSubject.getValue();
    if (generation !== this.configUpdateGeneration || !latestState.running) {
      this.revokeLoop(loop);
      return;
    }

    this.activeLoop = loop;
    await this.htmlAudioPlaybackService.play(METRONOME_CHANNEL, loop.url, { loop: true, ownedUrl: true });
  }

  stop(): void {
    this.configUpdateGeneration++;
    this.progressSubscription?.unsubscribe();
    this.progressSubscription = null;
    this.htmlAudioPlaybackService.stop(METRONOME_CHANNEL);

    const previous = this.stateSubject.getValue();
    if (previous.running) {
      this.stateSubject.next({
        ...previous,
        running: false,
        activeIndex: -1,
        tickAudioTime: 0
      });
    }
  }

  private sanitizeBpm(bpm: number): number {
    if (!Number.isFinite(bpm)) return 80;
    return Math.min(260, Math.max(20, Math.round(bpm)));
  }

  private normalizeConfig(config: MetronomeConfig): { config: MetronomeConfig; labels: string[]; tickDurationSeconds: number } {
    const bpm = this.sanitizeBpm(config.bpm);
    const timeSignature = parseTimeSignature(config.timeSignature);
    const subdivision = normalizeSubdivision(timeSignature, config.subdivision);
    const parts = getTimeSignatureParts(timeSignature);
    const labels = buildMetronomeLabels(timeSignature, subdivision);
    const tickDurationSeconds = this.computeTickDurationSeconds(bpm, parts.bottom, subdivision);
    return {
      config: { bpm, timeSignature, subdivision },
      labels,
      tickDurationSeconds
    };
  }

  private computeTickDurationSeconds(bpm: number, bottom: 4 | 8, subdivision: MetronomeSubdivision): number {
    const quarter = 60 / bpm;
    if (bottom === 4) {
      if (subdivision === '16th') return quarter / 4;
      if (subdivision === '8th') return quarter / 2;
      return quarter;
    }

    const eighth = quarter / 2;
    return subdivision === '16th' ? eighth / 2 : eighth;
  }

  private async renderLoop(
    config: MetronomeConfig,
    labels: string[],
    tickDurationSeconds: number
  ): Promise<RenderedMetronomeLoop> {
    const loopDurationSeconds = labels.length * tickDurationSeconds * METRONOME_LOOP_MEASURES;
    const toneBuffer = await Tone.Offline(async () => {
      const sampler = await this.createMetronomeSampler();
      const accentedBeats = getAccentedBeats(config.timeSignature);

      for (let measure = 0; measure < METRONOME_LOOP_MEASURES; measure++) {
        for (let index = 0; index < labels.length; index++) {
          const label = labels[index];
          const time = ((measure * labels.length) + index) * tickDurationSeconds;
          const isMainBeat = isMainBeatLabel(label);
          const beatNumber = isMainBeat ? Number(label) : NaN;
          const isAccentedBeat = Number.isFinite(beatNumber) && accentedBeats.includes(beatNumber);

          if (isMainBeat) {
            sampler.triggerAttackRelease(isAccentedBeat ? 'C#3' : 'C3', 0.2, time, isAccentedBeat ? 1.0 : 0.85);
          } else {
            sampler.triggerAttackRelease('D3', 0.15, time, 0.8);
          }
        }
      }
    }, loopDurationSeconds);

    const audioBuffer = toneBuffer.get();
    if (!audioBuffer) {
      throw new Error('Tone offline rendering did not produce a metronome AudioBuffer');
    }

    const blob = this.wavEncoder.encode(audioBuffer);
    return {
      blob,
      url: URL.createObjectURL(blob),
      durationSeconds: loopDurationSeconds,
      labels,
      tickDurationSeconds
    };
  }

  private async createMetronomeSampler(): Promise<Tone.Sampler> {
    let settled = false;
    let resolveReady!: () => void;
    let rejectReady!: (error: any) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const sampler = new Tone.Sampler({
      urls: {
        C3: '/samples/metronome/snare-drum__025_mezzo-forte_with-snares.mp3',
        'C#3': '/samples/metronome/snare-drum__025_fortissimo_with-snares.mp3',
        D3: '/samples/metronome/djembe__05_forte_undamped.mp3'
      },
      release: 0.6,
      attack: 0.001,
      volume: 0,
      onload: () => {
        if (!settled) {
          settled = true;
          resolveReady();
        }
      },
      onerror: (error: any) => {
        if (!settled) {
          settled = true;
          rejectReady(error);
        }
      }
    }).toDestination();

    await ready;
    return sampler;
  }

  private subscribeProgress(): void {
    this.progressSubscription?.unsubscribe();
    this.progressSubscription = this.htmlAudioPlaybackService.progress$(METRONOME_CHANNEL)
      .subscribe(progress => {
        void this.handleProgress(progress);
      });
  }

  private async handleProgress(progress: HtmlAudioProgress): Promise<void> {
    const loop = this.activeLoop;
    const state = this.stateSubject.getValue();
    if (!loop || !state.running) {
      return;
    }

    const loopPosition = loop.durationSeconds > 0
      ? progress.currentTime % loop.durationSeconds
      : progress.currentTime;
    const activeIndex = Math.floor(loopPosition / loop.tickDurationSeconds) % loop.labels.length;
    const tickAudioTime = activeIndex * loop.tickDurationSeconds;

    if (activeIndex !== state.activeIndex || tickAudioTime !== state.tickAudioTime) {
      this.stateSubject.next({
        ...state,
        activeIndex,
        tickAudioTime
      });
    }
  }

  private revokeLoop(loop: RenderedMetronomeLoop | null): void {
    if (loop) {
      URL.revokeObjectURL(loop.url);
    }
  }
}
