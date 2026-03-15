import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MetronomeService } from '@/app/services/metronome.service';
import { AudioService } from '@/app/services/audio.service';
import { TIME_SIGNATURES, TimeSignature, timeSignatureLabel } from '@/app/services/time-signature.model';
import { BpmSelectorComponent } from '@/app/components/bpm-selector/bpm-selector.component';

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
  subBeatsEnabled = true;

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
      subBeatsEnabled: this.subBeatsEnabled
    });
  }

  stop(): void {
    this.metronomeService.stop();
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
}
