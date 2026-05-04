import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';
import { ModalService } from '@/app/core/services/modal.service';
import { TunerService, TunerState } from '@/app/features/tuner/services/tuner.service';
import {
  DetectedPitchCandidate,
} from '@/app/features/tuner/services/tuner-detector';
import {
  buildVisibleSemitoneMarkers,
  VisibleSemitoneMarker
} from '@/app/features/tuner/services/tuner-display';
import {
  formatNoteLabel,
  frequencyToMidiFloat,
  midiToNote
} from '@/app/features/tuner/services/tuner-note-math';
import { DebugExportDialogComponent } from '@/app/features/tuner/ui/debug-export-dialog/debug-export-dialog.component';

@Component({
  selector: 'app-tuner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tuner.component.html',
  styleUrl: './tuner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TunerComponent implements OnInit, OnDestroy {
  state: TunerState;
  markers: VisibleSemitoneMarker[] = [];
  readonly debugEnabled: Signal<boolean>;

  private subscription?: Subscription;
  private readonly semitoneStepPx = 118;
  private readonly closeToleranceCents = 10;
  private readonly inTuneToleranceCents = 5;
  private trackMidiFloat: number | null = null;

  constructor(
    private tunerService: TunerService,
    private debugSettings: DebugSettingsService,
    private modalService: ModalService,
    private cdr: ChangeDetectorRef
  ) {
    this.state = this.tunerService.getSnapshot();
    this.debugEnabled = this.debugSettings.tunerDebugEnabled;
  }

  ngOnInit(): void {
    this.subscription = this.tunerService.state$.subscribe(state => {
      this.state = state;
      this.trackMidiFloat = this.resolveTrackMidiFloat(state);
      this.markers = this.trackMidiFloat === null
        ? []
        : buildVisibleSemitoneMarkers(this.trackMidiFloat);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.tunerService.stop();
  }

  async start(): Promise<void> {
    await this.tunerService.start();
  }

  async toggle(): Promise<void> {
    if (this.state.running) {
      this.stop();
      return;
    }

    await this.start();
  }

  stop(): void {
    this.tunerService.stop();
  }

  canDownloadDebugData(): boolean {
    return this.debugEnabled() && this.tunerService.hasDebugFrames();
  }

  async downloadDebugData(): Promise<void> {
    const modalRef = this.modalService.show(DebugExportDialogComponent, {
      width: 'min(32rem, calc(100vw - 2rem))',
      closeOnBackdropClick: false
    });
    const description = await modalRef.afterClosed();
    if (description === undefined) {
      return;
    }

    this.tunerService.downloadDebugData(description);
  }

  trackByMidi(_: number, marker: VisibleSemitoneMarker): number {
    return marker.midi;
  }

  primaryReadout(): string {
    const detectedFrequencyHz = this.detectedFrequencyHz();
    if (detectedFrequencyHz !== null) {
      return `${detectedFrequencyHz.toFixed(1)} Hz`;
    }

    if (!this.state.supported) {
      return 'Unavailable';
    }

    if (this.state.sessionStatus === 'interrupted') {
      return 'Mic inactive';
    }

    if (this.state.errorMessage) {
      return 'Start failed';
    }

    if (this.state.sessionStatus === 'stopped') {
      return 'Stopped';
    }

    if (this.state.running) {
      return 'Listening…';
    }

    return 'Ready';
  }

  secondaryReadout(): string {
    if (this.state.pitchLocked && this.state.nearestNote) {
      const cents = this.centsDisplay();
      return cents === null
        ? formatNoteLabel(this.state.nearestNote)
        : `${formatNoteLabel(this.state.nearestNote)} · ${cents}`;
    }

    const approachingNote = this.approachingNoteLabel();
    if (approachingNote) {
      return `${approachingNote} · locking`;
    }

    if (this.state.interruptionMessage) {
      return this.state.interruptionMessage;
    }

    if (this.state.errorMessage) {
      return this.state.errorMessage;
    }

    return this.state.running ? 'Play a single note' : 'Tap Start';
  }

  toggleButtonLabel(): string {
    return this.state.running ? 'Stop' : 'Start';
  }

  telemetryLabel(): string {
    return `Lock ${Math.round(this.state.lockStrength * 100)}% · Detector ${Math.round(this.state.pitchProbability * 100)}%`;
  }

  showTunerSummary(): boolean {
    return this.detectedFrequencyHz() !== null;
  }

  tunerCardLabel(): string {
    if (!this.state.supported || this.state.errorMessage) {
      return 'Tuner Error';
    }

    if (this.state.sessionStatus === 'interrupted') {
      return 'Tuner Interrupted';
    }

    if (this.state.inTune && this.state.pitchLocked) {
      return 'Tuner In Tune';
    }

    if (this.state.pitchLocked) {
      return 'Tuner Locked';
    }

    if (this.state.signalPresent || this.state.running) {
      return 'Tuner Listening';
    }

    if (this.state.sessionStatus === 'stopped') {
      return 'Tuner Stopped';
    }

    return 'Tuner Ready';
  }

  micCardLabel(): string {
    if (!this.state.supported || this.state.errorMessage) {
      return 'Mic Error';
    }

    if (this.state.sessionStatus === 'interrupted') {
      return 'Mic Inactive';
    }

    if (this.state.signalPresent) {
      return 'Mic Live';
    }

    if (this.state.running) {
      return 'Mic Open';
    }

    if (this.state.sessionStatus === 'stopped') {
      return 'Mic Stopped';
    }

    return 'Mic Ready';
  }

  showMarkers(): boolean {
    return this.trackMidiFloat !== null && this.detectedFrequencyHz() !== null;
  }

  showTolerance(): boolean {
    return this.showMarkers();
  }

  detectedFrequencyHz(): number | null {
    if (this.state.displayFrequencyHz !== null) {
      return this.state.displayFrequencyHz;
    }

    if (this.state.rawFrequencyHz !== null && this.state.signalPresent) {
      return this.state.rawFrequencyHz;
    }

    return null;
  }

  centsDisplay(): string | null {
    if (this.state.centsOff === null) {
      return null;
    }

    const roundedCents = Math.round(this.state.centsOff);
    return roundedCents === 0
      ? 'in tune'
      : `${roundedCents > 0 ? '+' : ''}${roundedCents} cents`;
  }

  trackTone(): string {
    if (!this.state.supported || this.state.errorMessage) {
      return 'error';
    }

    if (this.state.sessionStatus === 'interrupted') {
      return 'interrupted';
    }

    if (this.state.inTune && this.state.pitchLocked) {
      return 'matched';
    }

    if (this.state.pitchLocked) {
      return 'locked';
    }

    if (this.state.signalPresent) {
      return 'signal';
    }

    return 'idle';
  }

  meterFillScale(): string {
    const scale = 0.06 + this.state.displayInputLevel * 0.94;
    return `scaleX(${scale})`;
  }

  markerLeft(marker: VisibleSemitoneMarker): string {
    return `calc(50% + ${marker.offsetSemitones * this.semitoneStepPx}px)`;
  }

  markerTransform(marker: VisibleSemitoneMarker): string {
    const distance = Math.abs(marker.offsetSemitones);
    const clampedDistance = Math.min(distance, 1.6);
    const translateY = `${clampedDistance * 10}px`;
    const scale = `${1 - clampedDistance * 0.12}`;

    return `translate(-50%, ${translateY}) scale(${scale})`;
  }

  markerOpacity(marker: VisibleSemitoneMarker): string {
    const distance = Math.abs(marker.offsetSemitones);
    const clampedDistance = Math.min(distance, 1.6);
    return `${1 - clampedDistance * 0.3}`;
  }

  markerActive(marker: VisibleSemitoneMarker): boolean {
    return this.trackMidiFloat !== null && Math.round(this.trackMidiFloat) === marker.midi;
  }

  toleranceLeft(): string {
    if (this.trackMidiFloat === null) {
      return '50%';
    }

    const nearestMidi = Math.round(this.trackMidiFloat);
    const offsetSemitones = nearestMidi - this.trackMidiFloat;
    return `calc(50% + ${offsetSemitones * this.semitoneStepPx}px)`;
  }

  toleranceWidth(cents: number): string {
    const toleranceWidthPx = this.semitoneStepPx * ((cents * 2) / 100);
    return `${toleranceWidthPx}px`;
  }

  closeToleranceWidth(): string {
    return this.toleranceWidth(this.closeToleranceCents);
  }

  inTuneToleranceWidth(): string {
    return this.toleranceWidth(this.inTuneToleranceCents);
  }

  candidateProbability(candidate: DetectedPitchCandidate): string {
    return `${Math.round(candidate.probability * 100)}%`;
  }

  trackByCandidate(_: number, candidate: DetectedPitchCandidate): number {
    return Math.round(candidate.frequencyHz * 10);
  }

  private resolveTrackMidiFloat(state: TunerState): number | null {
    if (state.displayMidiFloat !== null) {
      return state.displayMidiFloat;
    }

    if (state.rawFrequencyHz !== null && state.rawFrequencyHz > 0) {
      return frequencyToMidiFloat(state.rawFrequencyHz);
    }

    return null;
  }

  private approachingNoteLabel(): string | null {
    if (this.trackMidiFloat === null || !this.state.signalPresent) {
      return null;
    }

    return formatNoteLabel(midiToNote(Math.round(this.trackMidiFloat)));
  }
}
