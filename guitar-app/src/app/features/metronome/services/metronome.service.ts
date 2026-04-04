import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioService } from '@/app/core/services/audio.service';
import { TransportRepeatPlaybackScheduler } from '@/app/core/services/playback-scheduler.service';
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

@Injectable({
  providedIn: 'root'
})
export class MetronomeService implements OnDestroy {
  private tickIndex = -1;
  private readonly scheduler: TransportRepeatPlaybackScheduler;

  private readonly stateSubject = new BehaviorSubject<MetronomeState>({
    running: false,
    config: { bpm: 80, timeSignature: '4/4', subdivision: '8th' },
    labels: buildMetronomeLabels('4/4', '8th'),
    activeIndex: 0,
    tickAudioTime: 0,
    tickDurationSeconds: 0.5
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(private audioService: AudioService) {
    this.scheduler = new TransportRepeatPlaybackScheduler(audioService);
  }

  ngOnDestroy(): void {
    this.stop();
    this.scheduler.destroy();
    this.audioService.disposeSampler('metronome');
  }

  getSnapshot(): MetronomeState {
    return this.stateSubject.getValue();
  }

  async start(config: MetronomeConfig): Promise<void> {
    await this.ensureInitialized();
    this.applyConfig(config, true);
  }

  async updateConfig(config: MetronomeConfig): Promise<void> {
    const state = this.stateSubject.getValue();
    if (state.running) {
      await this.ensureInitialized();
    }
    this.applyConfig(config, state.running);
  }

  stop(): void {
    this.tickIndex = -1;
    this.scheduler.stop();

    const previous = this.stateSubject.getValue();
    if (previous.running) {
      this.stateSubject.next({
        ...previous,
        running: false
      });
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.audioService.ensureStarted();

    await this.audioService.ensureSamplerInitialized('metronome', {
      urls: {
        // Normal beats
        C3: '/samples/metronome/snare-drum__025_mezzo-forte_with-snares.mp3',
        // Accented beats
        'C#3': '/samples/metronome/snare-drum__025_fortissimo_with-snares.mp3',
        // Sub-beats
        D3: '/samples/metronome/djembe__05_forte_undamped.mp3'
      },
      release: 0.6,
      attack: 0.001,
      volume: 0
    });
  }

  private onTick(time: number): void {
    const state = this.stateSubject.getValue();
    if (!state.running) return;

    const sampler = this.audioService.getSampler('metronome');
    if (!sampler) return;

    // Tone's scheduler can occasionally call back late (main-thread stalls), which may
    // result in `time` being slightly in the past. Some instruments behave poorly when
    // asked to schedule events in the past, so clamp to "now".
    const now = this.audioService.now();
    const safeTime = Number.isFinite(time) ? Math.max(time, now + 0.001) : now + 0.001;

    const labels = state.labels;
    this.tickIndex = (this.tickIndex + 1) % labels.length;
    const label = labels[this.tickIndex];

    const isMainBeat = isMainBeatLabel(label);
    const accentedBeats = getAccentedBeats(state.config.timeSignature);
    const beatNumber = isMainBeat ? Number(label) : NaN;
    const isAccentedBeat = Number.isFinite(beatNumber) && accentedBeats.includes(beatNumber);

    try {
      if (isMainBeat) {
        const note = isAccentedBeat ? 'C#3' : 'C3';
        sampler.triggerAttackRelease(note, 0.2, safeTime, isAccentedBeat ? 1.0 : 0.85);
      } else {
        sampler.triggerAttackRelease('D3', 0.15, safeTime, 0.8);
      }
    } catch (error) {
      // Don’t let an occasional sampler error stop the transport callback chain.
      console.error('Metronome tick failed:', error);
      return;
    }

    this.stateSubject.next({
      ...state,
      activeIndex: this.tickIndex,
      tickAudioTime: safeTime
    });
  }

  private sanitizeBpm(bpm: number): number {
    if (!Number.isFinite(bpm)) return 80;
    return Math.min(260, Math.max(20, Math.round(bpm)));
  }

  private applyConfig(config: MetronomeConfig, startTransport: boolean): void {
    const bpm = this.sanitizeBpm(config.bpm);
    const timeSignature = parseTimeSignature(config.timeSignature);
    const subdivision = normalizeSubdivision(timeSignature, config.subdivision);
    const parts = getTimeSignatureParts(timeSignature);
    const labels = buildMetronomeLabels(timeSignature, subdivision);
    const tickDurationSeconds = this.computeTickDurationSeconds(bpm, parts.bottom, subdivision);
    const previous = this.stateSubject.getValue();

    this.tickIndex = -1;

    this.stateSubject.next({
      running: startTransport,
      config: { bpm, timeSignature, subdivision },
      labels,
      activeIndex: 0,
      tickAudioTime: this.audioService.now(),
      tickDurationSeconds
    });

    if (!startTransport) {
      if (previous.running) {
        this.scheduler.stop();
      }
      return;
    }

    const transport = this.audioService.getTransport();
    transport.bpm.value = bpm;
    transport.timeSignature = [parts.top, parts.bottom];
    this.scheduler.replaceSchedule(() => [
      transport.scheduleRepeat((time) => {
        this.onTick(time);
      }, this.getRepeatInterval(parts.bottom, subdivision), '+0.05')
    ], true);
  }

  private getRepeatInterval(bottom: 4 | 8, subdivision: MetronomeSubdivision): string {
    if (bottom === 4) {
      if (subdivision === '16th') return '16n';
      if (subdivision === '8th') return '8n';
      return '4n';
    }

    return subdivision === '16th' ? '16n' : '8n';
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
}
