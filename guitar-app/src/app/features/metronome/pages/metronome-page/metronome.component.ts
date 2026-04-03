import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MetronomeService } from '@/app/features/metronome/services/metronome.service';
import { AudioService } from '@/app/core/services/audio.service';
import { TIME_SIGNATURES, TimeSignature, timeSignatureLabel } from '@/app/core/music/rhythm/time-signature.model';
import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';
import {
  MetronomeSubdivision,
  getAllowedSubdivisions,
  normalizeSubdivision
} from '@/app/features/metronome/services/metronome-labels';

@Component({
  selector: 'app-metronome',
  standalone: true,
  imports: [CommonModule, FormsModule, BpmSelectorComponent],
  templateUrl: './metronome.component.html',
  styleUrls: ['./metronome.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetronomeComponent implements OnInit, OnDestroy {
  bpm = 80;
  timeSignature: TimeSignature = '4/4';
  subdivision: MetronomeSubdivision = '8th';

  readonly timeSignatureOptions: readonly TimeSignature[] = TIME_SIGNATURES;

  labels: string[] = [];
  scales: number[] = [];
  activeIndex = 0;
  running = false;

  private tickAudioTime = 0;
  private tickDurationSeconds = 0.5;

  private subscription?: Subscription;
  private rafId: number | null = null;

  constructor(
    private metronomeService: MetronomeService,
    private audioService: AudioService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscription = this.metronomeService.state$.subscribe(state => {
      this.running = state.running;
      this.labels = state.labels;
      this.activeIndex = state.activeIndex;
      this.tickAudioTime = state.tickAudioTime;
      this.tickDurationSeconds = state.tickDurationSeconds;

      if (!this.scales || this.scales.length !== this.labels.length) {
        this.scales = new Array(this.labels.length).fill(1);
      }

      this.cdr.markForCheck();
    });

    this.startAnimationLoop();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.metronomeService.stop();
  }

  async start(): Promise<void> {
    await this.metronomeService.start({
      bpm: this.bpm,
      timeSignature: this.timeSignature,
      subdivision: this.subdivision
    });
  }

  stop(): void {
    this.metronomeService.stop();
  }

  async onTimeSignatureChange(): Promise<void> {
    this.subdivision = normalizeSubdivision(this.timeSignature, this.subdivision);
    await this.syncConfig();
  }

  async onQuarterEighthSubdivisionChange(enabled: boolean): Promise<void> {
    if (enabled) {
      this.subdivision = this.subdivision === '16th' ? '16th' : '8th';
    } else {
      this.subdivision = 'none';
    }
    await this.syncConfig();
  }

  async onSixteenthSubdivisionChange(enabled: boolean): Promise<void> {
    if (enabled) {
      this.subdivision = '16th';
    } else if (getAllowedSubdivisions(this.timeSignature).includes('8th')) {
      this.subdivision = '8th';
    } else {
      this.subdivision = 'none';
    }
    await this.syncConfig();
  }

  supportsEighthSubdivision(): boolean {
    return getAllowedSubdivisions(this.timeSignature).includes('8th');
  }

  supportsSixteenthSubdivision(): boolean {
    return getAllowedSubdivisions(this.timeSignature).includes('16th');
  }

  isEighthSubdivisionChecked(): boolean {
    return this.subdivision === '8th' || this.subdivision === '16th';
  }

  isSixteenthSubdivisionChecked(): boolean {
    return this.subdivision === '16th';
  }

  trackByIndex(index: number): number {
    return index;
  }

  timeSignatureOptionLabel(ts: TimeSignature): string {
    return timeSignatureLabel(ts);
  }

  private startAnimationLoop(): void {
    const frame = () => {
      this.updateScales();
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private updateScales(): void {
    if (!this.labels.length) return;

    const scales = new Array(this.labels.length).fill(1);

    if (this.running) {
      const now = this.audioService.now();
      const elapsed = now - this.tickAudioTime;
      const progress = this.tickDurationSeconds > 0 ? Math.min(1, Math.max(0, elapsed / this.tickDurationSeconds)) : 1;
      const scale = 1 + 0.6 * (1 - progress);
      scales[this.activeIndex] = scale;
    }

    // Avoid re-render work when nothing changes
    let changed = false;
    for (let i = 0; i < scales.length; i++) {
      if (this.scales[i] !== scales[i]) {
        changed = true;
        break;
      }
    }

    if (changed) {
      this.scales = scales;
      this.cdr.markForCheck();
    }
  }

  private async syncConfig(): Promise<void> {
    await this.metronomeService.updateConfig({
      bpm: this.bpm,
      timeSignature: this.timeSignature,
      subdivision: this.subdivision
    });
  }
}
