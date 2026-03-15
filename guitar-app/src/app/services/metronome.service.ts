import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioService } from '@/app/services/audio.service';
import { buildMetronomeLabels, isMainBeatLabel } from '@/app/services/metronome-labels';
import { getAccentedBeats, getTimeSignatureParts, parseTimeSignature, TimeSignature } from '@/app/services/time-signature.model';

export interface MetronomeConfig {
  bpm: number;
  timeSignature: TimeSignature;
  subBeatsEnabled: boolean;
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
  private scheduledIds: number[] = [];
  private tickIndex = -1;

  private readonly stateSubject = new BehaviorSubject<MetronomeState>({
    running: false,
    config: { bpm: 80, timeSignature: '4/4', subBeatsEnabled: true },
    labels: buildMetronomeLabels('4/4', true),
    activeIndex: 0,
    tickAudioTime: 0,
    tickDurationSeconds: 0.5
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(private audioService: AudioService) {}

  ngOnDestroy(): void {
    this.stop();
    this.audioService.disposeSampler('metronome');
  }

  getSnapshot(): MetronomeState {
    return this.stateSubject.getValue();
  }

  async start(config: MetronomeConfig): Promise<void> {
    await this.ensureInitialized();

    // Clear only our own previously scheduled events
    this.stop();

    const bpm = this.sanitizeBpm(config.bpm);
    const timeSignature = parseTimeSignature(config.timeSignature);
    const subBeatsEnabled = !!config.subBeatsEnabled;

    const parts = getTimeSignatureParts(timeSignature);

    const labels = buildMetronomeLabels(timeSignature, subBeatsEnabled);
    const tickDurationSeconds = this.computeTickDurationSeconds(bpm, parts.bottom, subBeatsEnabled);

    const transport = this.audioService.getTransport();
    transport.bpm.value = bpm;
    transport.timeSignature = [parts.top, parts.bottom];
    if (transport.state !== 'started') {
      transport.start();
    }

    // Align the first tick slightly in the future to avoid immediate trigger.
    // Use a relative transport time string to avoid edge cases where `transport.seconds`
    // can jump when BPM changes (Tone converts between ticks/seconds using BPM).
    const startAtSeconds = '+0.05';
    const interval = this.getRepeatInterval(parts.bottom, subBeatsEnabled);

    this.tickIndex = -1;

    this.stateSubject.next({
      running: true,
      config: { bpm, timeSignature, subBeatsEnabled },
      labels,
      activeIndex: 0,
      tickAudioTime: this.audioService.now(),
      tickDurationSeconds
    });

    const id = transport.scheduleRepeat((time) => {
      this.onTick(time);
    }, interval, startAtSeconds);

    this.scheduledIds.push(id);
  }

  stop(): void {
    const transport = this.audioService.getTransport();
    for (const id of this.scheduledIds) {
      transport.clear(id);
    }
    this.scheduledIds = [];
    this.tickIndex = -1;

    // The metronome is currently the only Transport user in this app.
    // Stopping it avoids leaving the Transport running silently.
    try {
      transport.stop();
    } catch {
      // ignore
    }

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

  private getRepeatInterval(bottom: 4 | 8, subBeatsEnabled: boolean): string {
    if (bottom === 4) {
      return subBeatsEnabled ? '8n' : '4n';
    }
    // bottom === 8
    return subBeatsEnabled ? '16n' : '8n';
  }

  private computeTickDurationSeconds(bpm: number, bottom: 4 | 8, subBeatsEnabled: boolean): number {
    const quarter = 60 / bpm;
    if (bottom === 4) {
      return subBeatsEnabled ? quarter / 2 : quarter;
    }
    // bottom === 8 => beat is eighth
    const eighth = quarter / 2;
    return subBeatsEnabled ? eighth / 2 : eighth;
  }
}
