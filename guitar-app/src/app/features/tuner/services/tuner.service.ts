import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';
import { TunerAudioSession } from '@/app/features/tuner/services/tuner-audio-session';
import {
  appendDebugFrame,
  buildDebugExportFilename,
  buildDebugExportPayload as createDebugExportPayload,
  normalizeDebugDescription,
  TunerDebugFrameLog
} from '@/app/features/tuner/services/tuner-debug-log';
import { detectPitchFromSamples, DetectedPitch } from '@/app/features/tuner/services/tuner-detector';
import {
  buildInactiveState,
  INITIAL_TUNER_STATE,
  projectActiveTunerState
} from '@/app/features/tuner/services/tuner-state-projection';
import { TunerTracker } from '@/app/features/tuner/services/tuner-tracker';
import { PitchTrackingState, TunerSessionStatus, TunerState } from '@/app/features/tuner/services/tuner.types';

export type { PitchTrackingState, TunerSessionStatus, TunerState } from '@/app/features/tuner/services/tuner.types';

const ANALYSER_FFT_SIZE = 4096;

@Injectable({
  providedIn: 'root'
})
export class TunerService implements OnDestroy {
  private analysisFrameId: number | null = null;
  private readonly tracker = new TunerTracker();
  private readonly audioSession = new TunerAudioSession(() => this.handleMicrophoneInterruption());
  private debugEnabled = false;
  private debugFrameIndex = 0;
  private debugSessionStartMs = 0;
  private debugFrames: TunerDebugFrameLog[] = [];

  private readonly stateSubject = new BehaviorSubject<TunerState>({
    ...INITIAL_TUNER_STATE,
    supported: this.audioSession.isSupported()
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(private readonly debugSettings: DebugSettingsService) {}

  ngOnDestroy(): void {
    this.stop();
  }

  getSnapshot(): TunerState {
    return this.stateSubject.getValue();
  }

  isDebugEnabled(): boolean {
    return this.debugSettings.isDebugEnabled('tuner');
  }

  hasDebugFrames(): boolean {
    return this.debugFrames.length > 0;
  }

  downloadDebugData(description: string | null = null): boolean {
    const normalizedDescription = normalizeDebugDescription(description);
    const payload = this.buildDebugExportPayload(normalizedDescription);
    if (!payload || typeof document === 'undefined' || typeof URL === 'undefined') {
      return false;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = objectUrl;
    anchor.download = buildDebugExportFilename(timestamp, normalizedDescription);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    return true;
  }

  async start(): Promise<void> {
    if (this.getSnapshot().running) {
      return;
    }

    if (!this.audioSession.isSupported()) {
      this.patchState({
        supported: false,
        permission: 'denied',
        sessionStatus: 'idle',
        interruptionMessage: null,
        errorMessage: 'Microphone tuning is not supported in this browser.'
      });
      return;
    }

    this.patchState({
      supported: true,
      permission: 'prompt',
      sessionStatus: 'idle',
      interruptionMessage: null,
      errorMessage: null
    });

    try {
      await this.audioSession.startSession(ANALYSER_FFT_SIZE);
      this.tracker.reset();
      this.debugFrames = [];
      this.debugEnabled = this.debugSettings.isDebugEnabled('tuner');
      this.debugFrameIndex = 0;
      this.debugSessionStartMs = this.getNowMs();

      this.patchState({
        permission: 'granted',
        running: true,
        sessionStatus: 'running',
        inputLevel: 0,
        displayInputLevel: 0,
        noiseFloor: this.tracker.getNoiseFloor(),
        signalPresent: false,
        pitchLocked: false,
        lockStrength: 0,
        trackingState: 'idle',
        interruptionMessage: null,
        errorMessage: null
      });

      this.scheduleAnalysisFrame();
    } catch (error) {
      this.handleStartError(error);
      this.audioSession.stopSession();
    }
  }

  stop(): void {
    if (!this.getSnapshot().running && !this.audioSession.hasActiveSession()) {
      return;
    }

    this.cancelAnalysisFrame();
    this.audioSession.stopSession();
    this.tracker.reset();

    const previous = this.getSnapshot();
    this.stateSubject.next({
      ...buildInactiveState(previous, this.tracker.getNoiseFloor()),
      sessionStatus: 'stopped',
      interruptionMessage: null,
      errorMessage: null
    });
  }

  private scheduleAnalysisFrame(): void {
    this.analysisFrameId = requestAnimationFrame(() => {
      this.analysisFrameId = null;
      this.analyseCurrentFrame();
      if (this.getSnapshot().running) {
        this.scheduleAnalysisFrame();
      }
    });
  }

  private analyseCurrentFrame(): void {
    if (this.audioSession.isInactive()) {
      this.handleMicrophoneInterruption();
      return;
    }

    const sampleBuffer = this.audioSession.readFrame();
    const sampleRate = this.audioSession.sampleRate;
    if (!sampleBuffer || sampleRate === null) {
      return;
    }

    this.debugEnabled = this.debugSettings.isDebugEnabled('tuner');
    if (this.debugEnabled && this.debugSessionStartMs === 0) {
      this.debugSessionStartMs = this.getNowMs();
    }

    const detected = detectPitchFromSamples(sampleBuffer, sampleRate, {
      minHz: 70,
      maxHz: 700,
      debug: this.debugEnabled
    });

    if (!detected) {
      return;
    }

    const previous = this.getSnapshot();
    const frameAssessment = this.tracker.assessFrame(detected, previous.displayInputLevel);
    const tracking = this.updateTrackingState(
      detected,
      frameAssessment.audioPresent,
      frameAssessment.signalPresent,
      frameAssessment.relativeInputLevel,
      frameAssessment.strongOnsetActive
    );
    const nextState = projectActiveTunerState(previous, detected, tracking, {
      noiseFloor: frameAssessment.noiseFloor,
      displayInputLevel: frameAssessment.displayInputLevel,
      signalPresent: frameAssessment.signalPresent
    });

    this.stateSubject.next(nextState);
    this.logDebugFrame(detected, nextState, frameAssessment);
    this.tracker.finalizeFrame(tracking.pitchLocked, frameAssessment.relativeInputLevel);
  }

  private updateTrackingState(
    detected: DetectedPitch,
    audioPresent: boolean,
    signalPresent: boolean,
    relativeInputLevel: number,
    strongOnsetActive: boolean
  ) {
    return this.tracker.updateTrackingState(
      detected,
      audioPresent,
      signalPresent,
      relativeInputLevel,
      strongOnsetActive
    );
  }

  private handleStartError(error: unknown): void {
    const name = typeof error === 'object' && error && 'name' in error ? String((error as { name?: string }).name) : '';
    const denied = name === 'NotAllowedError' || name === 'SecurityError';
    this.tracker.reset();

    this.patchState({
      running: false,
      sessionStatus: 'idle',
      permission: denied ? 'denied' : 'idle',
      interruptionMessage: null,
      errorMessage: denied
        ? 'Microphone permission was denied.'
        : 'Could not start microphone input for tuning.'
    });
  }

  private handleMicrophoneInterruption(): void {
    if (!this.getSnapshot().running && !this.audioSession.hasActiveSession()) {
      return;
    }

    this.cancelAnalysisFrame();
    this.audioSession.stopSession();
    this.tracker.reset();

    const previous = this.getSnapshot();
    this.stateSubject.next({
      ...buildInactiveState(previous, this.tracker.getNoiseFloor()),
      sessionStatus: 'interrupted',
      interruptionMessage: 'Microphone became inactive. Tap Start to reconnect.',
      errorMessage: null
    });
  }

  private cancelAnalysisFrame(): void {
    if (this.analysisFrameId !== null) {
      cancelAnimationFrame(this.analysisFrameId);
      this.analysisFrameId = null;
    }
  }

  private patchState(patch: Partial<TunerState>): void {
    this.stateSubject.next({
      ...this.getSnapshot(),
      ...patch
    });
  }

  private logDebugFrame(
    detected: DetectedPitch,
    state: TunerState,
    frameAssessment: {
      audioPresent: boolean;
      strongOnsetDetected: boolean;
      strongOnsetActive: boolean;
      relativeInputLevel: number;
    }
  ): void {
    if (!this.debugEnabled) {
      return;
    }

    appendDebugFrame(this.debugFrames, {
      frame: this.debugFrameIndex++,
      elapsedMs: this.getNowMs() - this.debugSessionStartMs,
      trackingState: state.trackingState,
      pitchLocked: state.pitchLocked,
      signalPresent: state.signalPresent,
      audioPresent: frameAssessment.audioPresent,
      strongOnsetDetected: frameAssessment.strongOnsetDetected,
      strongOnsetActive: frameAssessment.strongOnsetActive,
      rawFrequencyHz: state.rawFrequencyHz,
      acceptedFrequencyHz: state.frequencyHz,
      displayFrequencyHz: state.displayFrequencyHz,
      pitchProbability: state.pitchProbability,
      noiseFloor: state.noiseFloor,
      displayInputLevel: state.displayInputLevel,
      inputLevel: frameAssessment.relativeInputLevel,
      lockStrength: state.lockStrength,
      detected,
      tracker: this.tracker.getDebugSnapshot()
    });
  }

  private buildDebugExportPayload(description: string | null) {
    return createDebugExportPayload({
      frames: this.debugFrames,
      description,
      sampleRate: this.audioSession.sampleRate,
      fftSize: this.audioSession.fftSize
    });
  }

  private getNowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
