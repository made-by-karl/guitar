import { DetectedPitch, DetectedPitchCandidate } from '@/app/features/tuner/services/tuner-detector';
import { TunerDebugTrackerSnapshot } from '@/app/features/tuner/services/tuner-debug-log';
import { frequencyToMidiFloat } from '@/app/features/tuner/services/tuner-note-math';
import {
  buildTrackingPitchCandidates,
  scoreTrackingPitchCandidate
} from '@/app/features/tuner/services/tuner-tracking-candidates';
import { PitchTrackingState } from '@/app/features/tuner/services/tuner.types';

const DETECTION_MIN_HZ = 70;
const DETECTION_MAX_HZ = 700;
const INITIAL_NOISE_FLOOR = 0.0012;
const MIN_NOISE_FLOOR = 0.00008;
const LOCK_HOLD_FRAMES = 9;
const CLEAR_LOCK_FRAMES = 10;
const ACQUIRE_FRAMES = 2;
const STRONG_ONSET_ACQUIRE_FRAMES = 2;
const JUMP_CONFIRM_FRAMES = 3;
const EARLY_CORRECTION_JUMP_CONFIRM_FRAMES = 2;
const STRONG_ONSET_JUMP_CONFIRM_FRAMES = 2;
const HARMONIC_JUMP_CONFIRM_FRAMES = 3;
const STRONG_ONSET_HARMONIC_JUMP_CONFIRM_FRAMES = 2;
const STRONG_SUBHARMONIC_CORRECTION_CONFIRM_FRAMES = 3;
const SUBHARMONIC_CORRECTION_CONFIRM_FRAMES = 4;
const SUBHARMONIC_SHADOW_CONFIRM_FRAMES = 5;
const PENDING_CORRECTION_GRACE_FRAMES = 1;
const LOW_CONFIDENCE_DECAY_FRAMES = 2;
const EARLY_CORRECTION_WINDOW_FRAMES = 4;
const COMPATIBLE_SEMITONE_TOLERANCE = 0.5;
const ACQUISITION_SEMITONE_TOLERANCE = 0.6;
const STRONG_ONSET_WINDOW_FRAMES = 3;
const STRONG_ONSET_LEVEL = 0.1;
const STRONG_ONSET_RISE = 0.035;
const NEW_LOCK_MIN_PROBABILITY = 0.6;
const NEW_LOCK_MIN_PERIODICITY = 0.72;
const NEW_LOCK_MIN_SNR = 0;
const SOFT_UPPER_STRING_ACQUIRE_MIN_PROBABILITY = 0.58;
const SOFT_UPPER_STRING_ACQUIRE_MIN_PERIODICITY = 0.8;
const SOFT_UPPER_STRING_ACQUIRE_MIN_SNR = 4.5;
const HELD_LOCK_MIN_PROBABILITY = 0.52;
const HELD_LOCK_MIN_PERIODICITY = 0.62;
const HELD_LOCK_MIN_SNR = -8;
const SUBHARMONIC_CORRECTION_MIN_PROBABILITY = 0.57;
const SUBHARMONIC_CORRECTION_MIN_PERIODICITY = 0.78;
const SUBHARMONIC_CORRECTION_MIN_SNR = 3;
const SUBHARMONIC_CORRECTION_MIN_LEVEL = 0.2;
const PENDING_SUBHARMONIC_FRAME_MIN_PROBABILITY = 0.48;
const PENDING_SUBHARMONIC_FRAME_MIN_PERIODICITY = 0.68;
const PENDING_SUBHARMONIC_FRAME_MIN_SNR = 2.5;
const STRONG_SUBHARMONIC_CORRECTION_MIN_PROBABILITY = 0.62;
const STRONG_SUBHARMONIC_CORRECTION_MIN_PERIODICITY = 0.84;
const STRONG_SUBHARMONIC_CORRECTION_MIN_SNR = 5;
const STRONG_SUBHARMONIC_CORRECTION_MIN_LEVEL = 0.3;
const SUBHARMONIC_SHADOW_MIN_PROBABILITY = 0.72;
const SUBHARMONIC_SHADOW_MIN_PERIODICITY = 0.84;
const SUBHARMONIC_SHADOW_MIN_SNR = 5.5;
const SUBHARMONIC_SHADOW_MIN_LEVEL = 0.12;
const SOFT_UPPER_STRING_MIN_HZ = 250;
const SOFT_UPPER_STRING_STREAK_FRAMES = 2;
const STARTUP_SHADOW_MIN_HZ = 90;
const STARTUP_SHADOW_MAX_HZ = 135;
const STARTUP_CONTESTED_RATIO_TARGET = 3;
const STARTUP_CONTESTED_RATIO_TOLERANCE = 0.16;
const STARTUP_OCTAVE_RATIO_TARGET = 2;
const STARTUP_OCTAVE_RATIO_TOLERANCE = 0.12;
const STARTUP_HYPOTHESIS_GRACE_FRAMES = 1;
const STARTUP_UPPER_MIN_RANKING_SCORE = 0.52;
const STARTUP_UPPER_MIN_PROBABILITY = 0.5;
const STARTUP_UPPER_MIN_PERIODICITY = 0.68;
const STARTUP_UPPER_MIN_SNR = 1.5;
const STARTUP_UPPER_MIN_RANKING_LEAD = 0;
const STARTUP_OCTAVE_UPPER_MIN_RANKING_SCORE = 0.62;
const STARTUP_OCTAVE_UPPER_MIN_PROBABILITY = 0.34;
const STARTUP_OCTAVE_UPPER_MIN_PERIODICITY = 0.46;
const STARTUP_OCTAVE_UPPER_MIN_SNR = -0.5;
const STARTUP_OCTAVE_UPPER_MIN_RANKING_LEAD = 0.08;
const STARTUP_UPPER_CONFIRM_FRAMES = 2;
const STARTUP_CONTESTED_LOW_CONFIRM_FRAMES = 4;
const STARTUP_CONTESTED_STRONG_LOW_CONFIRM_FRAMES = 3;
const STARTUP_CONTESTED_LOW_MIN_PROBABILITY = 0.62;
const STARTUP_CONTESTED_LOW_MIN_PERIODICITY = 0.74;
const STARTUP_CONTESTED_LOW_MIN_SNR = 0.5;
const STARTUP_CONTESTED_LOW_MIN_RANKING_SCORE = 0.38;
const RELAXED_THIRD_SHADOW_CORRECTION_MIN_PROBABILITY = 0.6;
const RELAXED_THIRD_SHADOW_CORRECTION_MIN_PERIODICITY = 0.83;
const RELAXED_THIRD_SHADOW_CORRECTION_MIN_SNR = 5;
const RELAXED_THIRD_SHADOW_CORRECTION_MIN_LEVEL = 0.075;

interface TrackingQualitySnapshot {
  probability: number;
  periodicity: number;
}

interface StartupPitchHypothesis {
  frequencyHz: number | null;
  framesSeen: number;
  consecutiveFrames: number;
  graceFrames: number;
  probabilitySum: number;
  periodicitySum: number;
  signalToNoiseEstimateSum: number;
  rankingScoreSum: number;
  relativeInputLevelSum: number;
}

interface LowBandShadowProfile {
  name: 'octave' | 'third';
  ratioTarget: number;
  ratioTolerance: number;
  startupMinRankingScore: number;
  startupMinProbability: number;
  startupMinPeriodicity: number;
  startupMinSnr: number;
  startupMinRankingLead: number;
}

const LOW_BAND_SHADOW_PROFILES: LowBandShadowProfile[] = [
  {
    name: 'third',
    ratioTarget: STARTUP_CONTESTED_RATIO_TARGET,
    ratioTolerance: STARTUP_CONTESTED_RATIO_TOLERANCE,
    startupMinRankingScore: STARTUP_UPPER_MIN_RANKING_SCORE,
    startupMinProbability: STARTUP_UPPER_MIN_PROBABILITY,
    startupMinPeriodicity: STARTUP_UPPER_MIN_PERIODICITY,
    startupMinSnr: STARTUP_UPPER_MIN_SNR,
    startupMinRankingLead: STARTUP_UPPER_MIN_RANKING_LEAD
  },
  {
    name: 'octave',
    ratioTarget: STARTUP_OCTAVE_RATIO_TARGET,
    ratioTolerance: STARTUP_OCTAVE_RATIO_TOLERANCE,
    startupMinRankingScore: STARTUP_OCTAVE_UPPER_MIN_RANKING_SCORE,
    startupMinProbability: STARTUP_OCTAVE_UPPER_MIN_PROBABILITY,
    startupMinPeriodicity: STARTUP_OCTAVE_UPPER_MIN_PERIODICITY,
    startupMinSnr: STARTUP_OCTAVE_UPPER_MIN_SNR,
    startupMinRankingLead: STARTUP_OCTAVE_UPPER_MIN_RANKING_LEAD
  }
];

export interface TunerTrackerFrameAssessment {
  noiseFloor: number;
  relativeInputLevel: number;
  audioPresent: boolean;
  signalPresent: boolean;
  strongOnsetDetected: boolean;
  strongOnsetActive: boolean;
  displayInputLevel: number;
}

export interface TunerTrackerResult {
  acceptedFrequencyHz: number | null;
  pitchLocked: boolean;
  state: PitchTrackingState;
  lockStrength: number;
}

export class TunerTracker {
  private trackingState: PitchTrackingState = 'idle';
  private noiseFloor = INITIAL_NOISE_FLOOR;
  private acceptedFrequencyHz: number | null = null;
  private pendingCandidateHz: number | null = null;
  private pendingCandidateFrames = 0;
  private pendingCandidateGraceFrames = 0;
  private pendingCandidateProbabilitySum = 0;
  private pendingCandidatePeriodicitySum = 0;
  private pendingCandidateSnrSum = 0;
  private pendingCandidateLevelSum = 0;
  private decayFramesRemaining = 0;
  private lowConfidenceFrames = 0;
  private earlyCorrectionFramesRemaining = 0;
  private onsetFramesRemaining = 0;
  private recentInputLevel = 0;
  private recentPitchCandidates: number[] = [];
  private startupLowHypothesis: StartupPitchHypothesis = this.createEmptyStartupHypothesis();
  private startupUpperHypothesis: StartupPitchHypothesis = this.createEmptyStartupHypothesis();
  private upperStringCandidateFrames = 0;

  reset(): void {
    this.trackingState = 'idle';
    this.noiseFloor = INITIAL_NOISE_FLOOR;
    this.acceptedFrequencyHz = null;
    this.pendingCandidateHz = null;
    this.pendingCandidateFrames = 0;
    this.pendingCandidateGraceFrames = 0;
    this.pendingCandidateProbabilitySum = 0;
    this.pendingCandidatePeriodicitySum = 0;
    this.pendingCandidateSnrSum = 0;
    this.pendingCandidateLevelSum = 0;
    this.decayFramesRemaining = 0;
    this.lowConfidenceFrames = 0;
    this.earlyCorrectionFramesRemaining = 0;
    this.onsetFramesRemaining = 0;
    this.recentInputLevel = 0;
    this.recentPitchCandidates = [];
    this.upperStringCandidateFrames = 0;
    this.clearStartupHypotheses();
  }

  assessFrame(detected: DetectedPitch, previousDisplayInputLevel: number): TunerTrackerFrameAssessment {
    const baselineNoiseFloor = this.noiseFloor;
    const relativeInputLevel = getRelativeSignalLevel(detected.rms, baselineNoiseFloor);

    this.updateUpperStringCandidateFrames(detected);

    const pitchCandidatePresent = this.isPitchCandidatePresent(
      detected.hasPitch,
      detected.frequencyHz,
      detected.probability,
      detected.periodicity,
      detected.signalToNoiseEstimate
    );
    const audioPresent = this.isAudioPresent(detected.rms, baselineNoiseFloor, relativeInputLevel, pitchCandidatePresent);
    const signalPresent = this.isSignalPresent(
      detected.rms,
      baselineNoiseFloor,
      detected.periodicity,
      detected.probability,
      detected.signalToNoiseEstimate,
      relativeInputLevel,
      pitchCandidatePresent
    );
    const strongOnsetDetected = this.detectStrongOnset(
      relativeInputLevel,
      detected.probability,
      detected.periodicity,
      signalPresent
    );
    this.updateOnsetWindow(strongOnsetDetected);
    this.noiseFloor = this.updateNoiseFloor(detected.rms, audioPresent);

    const meterTargetLevel = pitchCandidatePresent
      ? Math.max(relativeInputLevel, this.getPitchCandidateMeterLevel(detected.probability, detected.signalToNoiseEstimate))
      : relativeInputLevel;
    const displayInputLevel = this.smoothValue(
      previousDisplayInputLevel,
      meterTargetLevel,
      audioPresent ? 0.36 : 0.14
    );

    return {
      noiseFloor: this.noiseFloor,
      relativeInputLevel,
      audioPresent,
      signalPresent,
      strongOnsetDetected,
      strongOnsetActive: this.onsetFramesRemaining > 0,
      displayInputLevel
    };
  }

  updateTrackingState(
    detected: DetectedPitch,
    audioPresent: boolean,
    signalPresent: boolean,
    relativeInputLevel: number,
    strongOnsetActive: boolean
  ): TunerTrackerResult {
    const hasAcceptedPitch = this.acceptedFrequencyHz !== null;
    const recentlyLocked = hasAcceptedPitch && this.earlyCorrectionFramesRemaining > 0;
    const rawCandidateHz = detected.hasPitch && detected.frequencyHz !== null
      ? detected.frequencyHz
      : null;
    const continuityCandidateHz = rawCandidateHz === null
      ? null
      : this.selectTrackingCandidate(rawCandidateHz, detected.probability, detected.periodicity);
    const rawCandidateDiffersFromAccepted = hasAcceptedPitch &&
      rawCandidateHz !== null &&
      !this.isCompatiblePitch(rawCandidateHz, this.acceptedFrequencyHz!, COMPATIBLE_SEMITONE_TOLERANCE);
    const candidateMatchesAccepted = hasAcceptedPitch &&
      continuityCandidateHz !== null &&
      this.isCompatiblePitch(continuityCandidateHz, this.acceptedFrequencyHz!, COMPATIBLE_SEMITONE_TOLERANCE);
    const shouldTreatAsSwitchCandidate = rawCandidateDiffersFromAccepted &&
      signalPresent &&
      detected.probability >= 0.48 &&
      detected.periodicity >= 0.6;
    const candidateForTracking = rawCandidateHz === null
      ? null
      : shouldTreatAsSwitchCandidate
        ? rawCandidateHz
        : candidateMatchesAccepted && continuityCandidateHz !== null
          ? continuityCandidateHz
          : rawCandidateHz;
    const runtimeCorrectionCandidate = hasAcceptedPitch
      ? this.findRuntimeSubharmonicCorrectionCandidate(this.acceptedFrequencyHz!, detected.candidates)
      : null;
    const switchCandidateHz = runtimeCorrectionCandidate?.frequencyHz ?? candidateForTracking;
    const switchCandidateQuality: TrackingQualitySnapshot = runtimeCorrectionCandidate === null
      ? {
        probability: detected.probability,
        periodicity: detected.periodicity
      }
      : {
        probability: runtimeCorrectionCandidate.probability,
        periodicity: runtimeCorrectionCandidate.periodicity
      };
    const switchCandidateSignalToNoiseEstimate = runtimeCorrectionCandidate?.signalToNoiseEstimate ?? detected.signalToNoiseEstimate;
    const jumpSemitoneDistance = hasAcceptedPitch && switchCandidateHz !== null
      ? this.getSemitoneDistance(switchCandidateHz, this.acceptedFrequencyHz!)
      : 0;
    const softUpperStringAcquireFrameStrongEnough = !hasAcceptedPitch &&
      candidateForTracking !== null &&
      signalPresent &&
      this.upperStringCandidateFrames >= SOFT_UPPER_STRING_STREAK_FRAMES &&
      candidateForTracking >= 300 &&
      detected.probability >= SOFT_UPPER_STRING_ACQUIRE_MIN_PROBABILITY &&
      detected.periodicity >= SOFT_UPPER_STRING_ACQUIRE_MIN_PERIODICITY &&
      detected.signalToNoiseEstimate >= SOFT_UPPER_STRING_ACQUIRE_MIN_SNR;
    const pitchFrameStrongEnough = candidateForTracking !== null &&
      signalPresent &&
      detected.probability >= (hasAcceptedPitch ? HELD_LOCK_MIN_PROBABILITY : NEW_LOCK_MIN_PROBABILITY) &&
      detected.periodicity >= (hasAcceptedPitch ? HELD_LOCK_MIN_PERIODICITY : NEW_LOCK_MIN_PERIODICITY) &&
      detected.signalToNoiseEstimate >= (hasAcceptedPitch ? HELD_LOCK_MIN_SNR : NEW_LOCK_MIN_SNR);
    const pendingSubharmonicCorrectionFrameStrongEnough = hasAcceptedPitch &&
      switchCandidateHz !== null &&
      signalPresent &&
      this.isSubharmonicCorrectionCandidate(switchCandidateHz, this.acceptedFrequencyHz!, jumpSemitoneDistance) &&
      this.pendingCandidateHz !== null &&
      this.isCompatiblePitch(switchCandidateHz, this.pendingCandidateHz, ACQUISITION_SEMITONE_TOLERANCE) &&
      switchCandidateQuality.probability >= PENDING_SUBHARMONIC_FRAME_MIN_PROBABILITY &&
      switchCandidateQuality.periodicity >= PENDING_SUBHARMONIC_FRAME_MIN_PERIODICITY &&
      switchCandidateSignalToNoiseEstimate >= PENDING_SUBHARMONIC_FRAME_MIN_SNR;
    const trackingFrameStrongEnough = pitchFrameStrongEnough ||
      softUpperStringAcquireFrameStrongEnough ||
      pendingSubharmonicCorrectionFrameStrongEnough;
    const maintainableAcceptedPitch = hasAcceptedPitch &&
      runtimeCorrectionCandidate === null &&
      !shouldTreatAsSwitchCandidate &&
      candidateMatchesAccepted &&
      candidateForTracking !== null &&
      audioPresent &&
      detected.probability >= 0.48 &&
      detected.periodicity >= 0.6;

    if (candidateForTracking !== null) {
      this.pushRecentPitchCandidate(candidateForTracking);
    }

    if (maintainableAcceptedPitch && candidateForTracking !== null) {
      this.clearStartupHypotheses();
      this.decayFramesRemaining = LOCK_HOLD_FRAMES;
      this.clearPendingCandidate();
      this.lowConfidenceFrames = pitchFrameStrongEnough ? 0 : this.lowConfidenceFrames + 1;
      this.acceptedFrequencyHz = this.smoothFrequency(
        this.acceptedFrequencyHz!,
        candidateForTracking,
        pitchFrameStrongEnough ? 0.22 : 0.08
      );
      this.trackingState = this.lowConfidenceFrames >= LOW_CONFIDENCE_DECAY_FRAMES ? 'decaying' : 'locked';

      return {
        acceptedFrequencyHz: this.acceptedFrequencyHz,
        pitchLocked: true,
        state: this.trackingState,
        lockStrength: this.computeLockStrength(
          detected.probability,
          detected.periodicity,
          relativeInputLevel,
          pitchFrameStrongEnough ? 1 : 0.68
        )
      };
    }

    if (switchCandidateHz !== null && trackingFrameStrongEnough) {
      if (!hasAcceptedPitch) {
        const startupOutcome = this.handleContestedStartupAcquisition(
          detected,
          signalPresent,
          relativeInputLevel,
          strongOnsetActive
        );

        if (startupOutcome !== null) {
          return startupOutcome;
        }
      }

      const stableFrames = this.accumulatePendingCandidate(
        switchCandidateHz,
        ACQUISITION_SEMITONE_TOLERANCE,
        switchCandidateQuality.probability,
        switchCandidateQuality.periodicity,
        switchCandidateSignalToNoiseEstimate,
        relativeInputLevel
      );

      if (!hasAcceptedPitch) {
        this.clearStartupHypotheses();
        const requiredFrames = strongOnsetActive ? STRONG_ONSET_ACQUIRE_FRAMES : ACQUIRE_FRAMES;
        const canLock = stableFrames >= requiredFrames;

        if (canLock) {
          return this.acceptNewPitch(
            switchCandidateHz,
            switchCandidateQuality,
            relativeInputLevel
          );
        }

        this.lowConfidenceFrames = 0;
        this.trackingState = 'acquiring';
        return {
          acceptedFrequencyHz: null,
          pitchLocked: false,
          state: this.trackingState,
          lockStrength: this.computeLockStrength(detected.probability, detected.periodicity, relativeInputLevel, 0.45)
        };
      }

      const harmonicJump = this.isHarmonicLikeJump(switchCandidateHz, this.acceptedFrequencyHz!);
      const fadingSignal = relativeInputLevel + 0.015 < this.recentInputLevel * 0.78;
      const earlyCorrectionEligible = recentlyLocked &&
        switchCandidateHz > this.acceptedFrequencyHz! &&
        jumpSemitoneDistance >= 15;
      const subharmonicCorrectionEligible = this.isSubharmonicCorrectionCandidate(
        switchCandidateHz,
        this.acceptedFrequencyHz!,
        jumpSemitoneDistance
      );
      const subharmonicShadowCandidate = this.isSubharmonicShadowCandidate(
        switchCandidateHz,
        this.acceptedFrequencyHz!,
        jumpSemitoneDistance
      );
      const requiredFrames = earlyCorrectionEligible
        ? EARLY_CORRECTION_JUMP_CONFIRM_FRAMES
        : subharmonicCorrectionEligible
          ? this.hasVeryStrongPendingSubharmonicCorrection(this.acceptedFrequencyHz!)
            ? STRONG_SUBHARMONIC_CORRECTION_CONFIRM_FRAMES
            : SUBHARMONIC_CORRECTION_CONFIRM_FRAMES
          : subharmonicShadowCandidate
            ? strongOnsetActive
              ? HARMONIC_JUMP_CONFIRM_FRAMES
              : SUBHARMONIC_SHADOW_CONFIRM_FRAMES
            : harmonicJump
              ? strongOnsetActive
                ? STRONG_ONSET_HARMONIC_JUMP_CONFIRM_FRAMES
                : HARMONIC_JUMP_CONFIRM_FRAMES
              : strongOnsetActive
                ? STRONG_ONSET_JUMP_CONFIRM_FRAMES
                : JUMP_CONFIRM_FRAMES;
      const switchAllowed = earlyCorrectionEligible
        ? !fadingSignal && switchCandidateQuality.probability >= 0.56 && relativeInputLevel >= 0.05
        : subharmonicCorrectionEligible
          ? this.hasStrongPendingSubharmonicCorrection()
          : subharmonicShadowCandidate
            ? strongOnsetActive
              ? switchCandidateQuality.probability >= 0.64 &&
                switchCandidateQuality.periodicity >= 0.78 &&
                relativeInputLevel >= 0.08
              : !fadingSignal &&
                switchCandidateQuality.probability >= SUBHARMONIC_SHADOW_MIN_PROBABILITY &&
                switchCandidateQuality.periodicity >= SUBHARMONIC_SHADOW_MIN_PERIODICITY &&
                switchCandidateSignalToNoiseEstimate >= SUBHARMONIC_SHADOW_MIN_SNR &&
                relativeInputLevel >= SUBHARMONIC_SHADOW_MIN_LEVEL
            : strongOnsetActive
              ? switchCandidateQuality.probability >= 0.58 && relativeInputLevel >= 0.08
              : !fadingSignal && switchCandidateQuality.probability >= 0.64 && relativeInputLevel >= 0.06;

      if (switchAllowed && stableFrames >= requiredFrames) {
        this.clearStartupHypotheses();
        return this.acceptNewPitch(
          switchCandidateHz,
          switchCandidateQuality,
          relativeInputLevel
        );
      }

      this.lowConfidenceFrames += 1;
      this.trackingState = strongOnsetActive ? 'locked' : 'decaying';

      return {
        acceptedFrequencyHz: this.acceptedFrequencyHz,
        pitchLocked: true,
        state: this.trackingState,
        lockStrength: this.computeLockStrength(detected.probability, detected.periodicity, relativeInputLevel, 0.58)
      };
    }

    const retainedPendingCorrection = hasAcceptedPitch &&
      candidateMatchesAccepted &&
      (signalPresent || audioPresent) &&
      this.retainPendingCorrectionGrace(this.acceptedFrequencyHz!);

    if (hasAcceptedPitch) {
      this.clearStartupHypotheses();
    }

    if (!retainedPendingCorrection) {
      this.clearPendingCandidate();
    }

    if (hasAcceptedPitch && (audioPresent || this.decayFramesRemaining > 0 || this.lowConfidenceFrames < CLEAR_LOCK_FRAMES)) {
      this.lowConfidenceFrames += 1;
      this.decayFramesRemaining = Math.max(0, this.decayFramesRemaining - (audioPresent ? 1 : 2));
      this.trackingState = 'decaying';

      if (this.lowConfidenceFrames < CLEAR_LOCK_FRAMES) {
        return {
          acceptedFrequencyHz: this.acceptedFrequencyHz,
          pitchLocked: true,
          state: this.trackingState,
          lockStrength: this.computeLockStrength(detected.probability, detected.periodicity, relativeInputLevel, 0.28)
        };
      }
    }

    if (signalPresent || audioPresent) {
      if (!retainedPendingCorrection) {
        this.clearPendingCandidate();
      }
      if (!hasAcceptedPitch) {
        this.clearStartupHypotheses();
      }
      this.trackingState = 'signal';

      return {
        acceptedFrequencyHz: null,
        pitchLocked: false,
        state: this.trackingState,
        lockStrength: this.computeLockStrength(
          detected.probability,
          detected.periodicity,
          relativeInputLevel,
          signalPresent ? 0.22 : 0.1
        )
      };
    }

    this.clearAcceptedPitch();
    this.trackingState = 'idle';

    return {
      acceptedFrequencyHz: null,
      pitchLocked: false,
      state: this.trackingState,
      lockStrength: 0
    };
  }

  finalizeFrame(pitchLocked: boolean, relativeInputLevel: number): void {
    this.advanceEarlyCorrectionWindow(pitchLocked);
    this.recentInputLevel = relativeInputLevel;
  }

  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  getAcceptedFrequencyHz(): number | null {
    return this.acceptedFrequencyHz;
  }

  getTrackingState(): PitchTrackingState {
    return this.trackingState;
  }

  getDebugSnapshot(): TunerDebugTrackerSnapshot {
    const quality = this.getPendingCandidateQualityAverages();

    return {
      pendingCandidateHz: this.pendingCandidateHz,
      pendingCandidateFrames: this.pendingCandidateFrames,
      pendingCandidateAverageProbability: quality?.probability ?? null,
      pendingCandidateAveragePeriodicity: quality?.periodicity ?? null,
      pendingCandidateAverageSnr: quality?.signalToNoiseEstimate ?? null,
      pendingCandidateAverageLevel: quality?.relativeInputLevel ?? null,
      earlyCorrectionFramesRemaining: this.earlyCorrectionFramesRemaining,
      onsetFramesRemaining: this.onsetFramesRemaining,
      lowConfidenceFrames: this.lowConfidenceFrames
    };
  }

  getPendingCandidateQualityAverages(): {
    probability: number;
    periodicity: number;
    signalToNoiseEstimate: number;
    relativeInputLevel: number;
  } | null {
    if (this.pendingCandidateFrames === 0) {
      return null;
    }

    return {
      probability: this.pendingCandidateProbabilitySum / this.pendingCandidateFrames,
      periodicity: this.pendingCandidatePeriodicitySum / this.pendingCandidateFrames,
      signalToNoiseEstimate: this.pendingCandidateSnrSum / this.pendingCandidateFrames,
      relativeInputLevel: this.pendingCandidateLevelSum / this.pendingCandidateFrames
    };
  }

  accumulatePendingCandidate(
    candidateHz: number,
    semitoneTolerance: number,
    probability: number,
    periodicity: number,
    signalToNoiseEstimate: number,
    relativeInputLevel: number
  ): number {
    if (this.pendingCandidateHz !== null && this.isCompatiblePitch(candidateHz, this.pendingCandidateHz, semitoneTolerance)) {
      this.pendingCandidateHz = this.smoothFrequency(this.pendingCandidateHz, candidateHz, 0.42);
      this.pendingCandidateFrames += 1;
      this.pendingCandidateGraceFrames = 0;
      this.pendingCandidateProbabilitySum += probability;
      this.pendingCandidatePeriodicitySum += periodicity;
      this.pendingCandidateSnrSum += signalToNoiseEstimate;
      this.pendingCandidateLevelSum += relativeInputLevel;
      return this.pendingCandidateFrames;
    }

    this.pendingCandidateHz = candidateHz;
    this.pendingCandidateFrames = 1;
    this.pendingCandidateGraceFrames = 0;
    this.pendingCandidateProbabilitySum = probability;
    this.pendingCandidatePeriodicitySum = periodicity;
    this.pendingCandidateSnrSum = signalToNoiseEstimate;
    this.pendingCandidateLevelSum = relativeInputLevel;
    return this.pendingCandidateFrames;
  }

  hasStrongPendingSubharmonicCorrection(): boolean {
    const quality = this.getPendingCandidateQualityAverages();
    if (quality === null) {
      return false;
    }

    return quality.probability >= SUBHARMONIC_CORRECTION_MIN_PROBABILITY &&
      quality.periodicity >= SUBHARMONIC_CORRECTION_MIN_PERIODICITY &&
      quality.signalToNoiseEstimate >= SUBHARMONIC_CORRECTION_MIN_SNR &&
      quality.relativeInputLevel >= SUBHARMONIC_CORRECTION_MIN_LEVEL;
  }

  hasVeryStrongPendingSubharmonicCorrection(acceptedHz: number): boolean {
    const quality = this.getPendingCandidateQualityAverages();
    if (quality === null) {
      return false;
    }

    const genericVeryStrong = quality.probability >= STRONG_SUBHARMONIC_CORRECTION_MIN_PROBABILITY &&
      quality.periodicity >= STRONG_SUBHARMONIC_CORRECTION_MIN_PERIODICITY &&
      quality.signalToNoiseEstimate >= STRONG_SUBHARMONIC_CORRECTION_MIN_SNR &&
      quality.relativeInputLevel >= STRONG_SUBHARMONIC_CORRECTION_MIN_LEVEL;

    if (genericVeryStrong) {
      return true;
    }

    if (this.pendingCandidateHz === null || this.getLowBandShadowProfile(acceptedHz, this.pendingCandidateHz)?.name !== 'third') {
      return false;
    }

    return quality.probability >= RELAXED_THIRD_SHADOW_CORRECTION_MIN_PROBABILITY &&
      quality.periodicity >= RELAXED_THIRD_SHADOW_CORRECTION_MIN_PERIODICITY &&
      quality.signalToNoiseEstimate >= RELAXED_THIRD_SHADOW_CORRECTION_MIN_SNR &&
      quality.relativeInputLevel >= RELAXED_THIRD_SHADOW_CORRECTION_MIN_LEVEL;
  }

  retainPendingCorrectionGrace(acceptedHz: number): boolean {
    if (this.pendingCandidateHz === null || this.pendingCandidateFrames === 0) {
      return false;
    }

    const jumpSemitoneDistance = this.getSemitoneDistance(this.pendingCandidateHz, acceptedHz);
    if (!this.isSubharmonicCorrectionCandidate(this.pendingCandidateHz, acceptedHz, jumpSemitoneDistance)) {
      return false;
    }

    this.pendingCandidateGraceFrames += 1;
    return this.pendingCandidateGraceFrames <= PENDING_CORRECTION_GRACE_FRAMES;
  }

  isPitchCandidatePresent(
    hasPitch: boolean,
    frequencyHz: number | null,
    probability: number,
    periodicity: number,
    signalToNoiseEstimate: number
  ): boolean {
    if (!hasPitch || frequencyHz === null) {
      return false;
    }

    return (probability >= 0.62 && periodicity >= 0.82 && signalToNoiseEstimate >= 4) ||
      (this.upperStringCandidateFrames >= SOFT_UPPER_STRING_STREAK_FRAMES &&
        frequencyHz >= SOFT_UPPER_STRING_MIN_HZ &&
        probability >= 0.58 &&
        periodicity >= 0.8 &&
        signalToNoiseEstimate >= 4) ||
      (this.upperStringCandidateFrames >= SOFT_UPPER_STRING_STREAK_FRAMES &&
        frequencyHz >= 300 &&
        probability >= 0.56 &&
        periodicity >= 0.79 &&
        signalToNoiseEstimate >= 4.2) ||
      (probability >= 0.7 && periodicity >= 0.76 && signalToNoiseEstimate >= 2.5);
  }

  isSignalPresent(
    rms: number,
    noiseFloor: number,
    periodicity: number,
    probability: number,
    signalToNoiseEstimate: number,
    relativeInputLevel: number,
    pitchCandidatePresent: boolean
  ): boolean {
    const safeNoiseFloor = Math.max(noiseFloor, MIN_NOISE_FLOOR);
    const excessDb = 20 * Math.log10((Math.max(rms, safeNoiseFloor) + 1e-8) / (safeNoiseFloor + 1e-8));

    return relativeInputLevel >= 0.075 ||
      excessDb >= 3 ||
      (periodicity >= 0.82 && probability >= 0.56 && rms >= safeNoiseFloor * 1.2) ||
      pitchCandidatePresent ||
      (periodicity >= 0.86 && probability >= 0.64 && signalToNoiseEstimate >= 5.5);
  }

  isAudioPresent(rms: number, noiseFloor: number, relativeInputLevel: number, pitchCandidatePresent: boolean): boolean {
    const safeNoiseFloor = Math.max(noiseFloor, MIN_NOISE_FLOOR);
    const excessDb = 20 * Math.log10((Math.max(rms, safeNoiseFloor) + 1e-8) / (safeNoiseFloor + 1e-8));

    return relativeInputLevel >= 0.025 ||
      excessDb >= 1.2 ||
      rms >= safeNoiseFloor * 1.1 ||
      pitchCandidatePresent;
  }

  getPitchCandidateMeterLevel(probability: number, signalToNoiseEstimate: number): number {
    const probabilityWeight = Math.max(0, probability - 0.52) * 0.22;
    const snrWeight = Math.max(0, signalToNoiseEstimate - 2.5) * 0.01;
    return Math.min(0.18, 0.03 + probabilityWeight + snrWeight);
  }

  setUpperStringCandidateFrames(value: number): void {
    this.upperStringCandidateFrames = value;
  }

  setPendingCandidateForTest(value: { frequencyHz: number | null; frames: number; graceFrames?: number }): void {
    this.pendingCandidateHz = value.frequencyHz;
    this.pendingCandidateFrames = value.frames;
    this.pendingCandidateGraceFrames = value.graceFrames ?? this.pendingCandidateGraceFrames;
  }

  private selectTrackingCandidate(detectedFrequencyHz: number, probability: number, periodicity: number): number {
    if (this.acceptedFrequencyHz === null) {
      return detectedFrequencyHz;
    }

    const candidates = buildTrackingPitchCandidates(detectedFrequencyHz, {
      minHz: DETECTION_MIN_HZ,
      maxHz: DETECTION_MAX_HZ
    });

    let bestCandidate = detectedFrequencyHz;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = scoreTrackingPitchCandidate(candidate, this.acceptedFrequencyHz, probability, periodicity);
      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }

    return bestCandidate;
  }

  private updateUpperStringCandidateFrames(detected: DetectedPitch): void {
    const frequencyHz = detected.frequencyHz;
    const isUpperStringCandidate = detected.hasPitch &&
      frequencyHz !== null &&
      frequencyHz >= SOFT_UPPER_STRING_MIN_HZ &&
      detected.probability >= 0.54 &&
      detected.periodicity >= 0.76 &&
      detected.signalToNoiseEstimate >= 3.4;

    this.upperStringCandidateFrames = isUpperStringCandidate
      ? this.upperStringCandidateFrames + 1
      : 0;
  }

  private updateNoiseFloor(rms: number, audioPresent: boolean): number {
    const safeRms = Math.max(MIN_NOISE_FLOOR, rms);

    if (!audioPresent) {
      this.noiseFloor = this.smoothValue(this.noiseFloor, safeRms, 0.14);
      return this.noiseFloor;
    }

    const target = Math.min(this.noiseFloor, safeRms);
    this.noiseFloor = this.smoothValue(this.noiseFloor, target, safeRms < this.noiseFloor ? 0.08 : 0.015);
    return this.noiseFloor;
  }

  private handleContestedStartupAcquisition(
    detected: DetectedPitch,
    signalPresent: boolean,
    relativeInputLevel: number,
    strongOnsetActive: boolean
  ): TunerTrackerResult | null {
    const lowCandidate = this.findContestedStartupLowCandidate(detected);
    const startupContestWasActive = this.hasStartupHypothesis(this.startupLowHypothesis) ||
      this.hasStartupHypothesis(this.startupUpperHypothesis);

    if (lowCandidate === null) {
      if (startupContestWasActive) {
        this.clearStartupHypotheses();
      }
      return null;
    }

    const upperCandidate = this.findContestedStartupUpperCandidate(lowCandidate, detected.candidates);
    const shouldContest = upperCandidate !== null ||
      this.hasStartupHypothesis(this.startupUpperHypothesis) ||
      startupContestWasActive;

    if (!shouldContest) {
      if (startupContestWasActive) {
        this.clearStartupHypotheses();
      }
      return null;
    }

    this.clearPendingCandidate();
    this.updateStartupHypothesis(this.startupLowHypothesis, lowCandidate, relativeInputLevel);
    if (upperCandidate !== null) {
      this.updateStartupHypothesis(this.startupUpperHypothesis, upperCandidate, relativeInputLevel);
    } else {
      this.markStartupHypothesisMissed(this.startupUpperHypothesis);
    }

    if (this.canAcceptStartupUpperHypothesis()) {
      const upperQuality = this.getStartupHypothesisQuality(this.startupUpperHypothesis)!;
      return this.acceptNewPitch(
        this.startupUpperHypothesis.frequencyHz!,
        upperQuality,
        upperQuality.relativeInputLevel
      );
    }

    if (this.canAcceptStartupLowHypothesis(strongOnsetActive)) {
      const lowQuality = this.getStartupHypothesisQuality(this.startupLowHypothesis)!;
      return this.acceptNewPitch(
        this.startupLowHypothesis.frequencyHz!,
        lowQuality,
        lowQuality.relativeInputLevel
      );
    }

    this.lowConfidenceFrames = 0;
    this.trackingState = 'acquiring';
    const quality = this.getStartupHypothesisQuality(this.startupUpperHypothesis) ??
      this.getStartupHypothesisQuality(this.startupLowHypothesis);

    return {
      acceptedFrequencyHz: null,
      pitchLocked: false,
      state: this.trackingState,
      lockStrength: this.computeLockStrength(
        quality?.probability ?? detected.probability,
        quality?.periodicity ?? detected.periodicity,
        quality?.relativeInputLevel ?? relativeInputLevel,
        signalPresent ? 0.52 : 0.34
      )
    };
  }

  private findContestedStartupLowCandidate(detected: DetectedPitch): DetectedPitchCandidate | null {
    const rawFrequencyHz = detected.hasPitch ? detected.frequencyHz : null;
    if (rawFrequencyHz !== null && this.isContestedStartupLowShadowFrequency(rawFrequencyHz)) {
      return this.findClosestRuntimeCandidate(detected.candidates, rawFrequencyHz) ?? {
        frequencyHz: rawFrequencyHz,
        probability: detected.probability,
        periodicity: detected.periodicity,
        signalToNoiseEstimate: detected.signalToNoiseEstimate,
        rankingScore: 0
      };
    }

    if (!this.hasStartupHypothesis(this.startupLowHypothesis) || this.startupLowHypothesis.frequencyHz === null) {
      return null;
    }

    const retainedLowCandidate = this.findClosestRuntimeCandidate(
      detected.candidates,
      this.startupLowHypothesis.frequencyHz
    );

    return retainedLowCandidate !== null && this.isContestedStartupLowShadowFrequency(retainedLowCandidate.frequencyHz)
      ? retainedLowCandidate
      : null;
  }

  private findContestedStartupUpperCandidate(
    lowCandidate: DetectedPitchCandidate,
    candidates: DetectedPitchCandidate[]
  ): DetectedPitchCandidate | null {
    let bestCandidate: DetectedPitchCandidate | null = null;

    for (const candidate of candidates) {
      if (this.isCompatiblePitch(candidate.frequencyHz, lowCandidate.frequencyHz, ACQUISITION_SEMITONE_TOLERANCE)) {
        continue;
      }

      const shadowProfile = this.getLowBandShadowProfile(lowCandidate.frequencyHz, candidate.frequencyHz);
      if (shadowProfile === null) {
        continue;
      }

      if (
        candidate.rankingScore < shadowProfile.startupMinRankingScore ||
        candidate.probability < shadowProfile.startupMinProbability ||
        candidate.periodicity < shadowProfile.startupMinPeriodicity ||
        candidate.signalToNoiseEstimate < shadowProfile.startupMinSnr ||
        candidate.rankingScore < lowCandidate.rankingScore + shadowProfile.startupMinRankingLead
      ) {
        continue;
      }

      if (bestCandidate === null || candidate.rankingScore > bestCandidate.rankingScore) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  private findRuntimeSubharmonicCorrectionCandidate(
    acceptedFrequencyHz: number,
    candidates: DetectedPitchCandidate[]
  ): DetectedPitchCandidate | null {
    const acceptedCandidate = this.findClosestRuntimeCandidate(candidates, acceptedFrequencyHz) ?? {
      frequencyHz: acceptedFrequencyHz,
      probability: 0,
      periodicity: 0,
      signalToNoiseEstimate: 0,
      rankingScore: 0
    };

    return this.findContestedStartupUpperCandidate(acceptedCandidate, candidates);
  }

  private findClosestRuntimeCandidate(candidates: DetectedPitchCandidate[], targetHz: number): DetectedPitchCandidate | null {
    let bestCandidate: DetectedPitchCandidate | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const semitoneDistance = this.getSemitoneDistance(candidate.frequencyHz, targetHz);
      if (semitoneDistance > ACQUISITION_SEMITONE_TOLERANCE) {
        continue;
      }

      if (semitoneDistance < bestDistance) {
        bestCandidate = candidate;
        bestDistance = semitoneDistance;
      }
    }

    return bestCandidate;
  }

  private createEmptyStartupHypothesis(): StartupPitchHypothesis {
    return {
      frequencyHz: null,
      framesSeen: 0,
      consecutiveFrames: 0,
      graceFrames: 0,
      probabilitySum: 0,
      periodicitySum: 0,
      signalToNoiseEstimateSum: 0,
      rankingScoreSum: 0,
      relativeInputLevelSum: 0
    };
  }

  private hasStartupHypothesis(hypothesis: StartupPitchHypothesis): boolean {
    return hypothesis.frequencyHz !== null && hypothesis.framesSeen > 0;
  }

  private updateStartupHypothesis(
    hypothesis: StartupPitchHypothesis,
    candidate: DetectedPitchCandidate,
    relativeInputLevel: number
  ): void {
    if (
      hypothesis.frequencyHz !== null &&
      this.isCompatiblePitch(candidate.frequencyHz, hypothesis.frequencyHz, ACQUISITION_SEMITONE_TOLERANCE)
    ) {
      hypothesis.frequencyHz = this.smoothFrequency(hypothesis.frequencyHz, candidate.frequencyHz, 0.38);
      hypothesis.framesSeen += 1;
      hypothesis.consecutiveFrames += 1;
      hypothesis.graceFrames = 0;
      hypothesis.probabilitySum += candidate.probability;
      hypothesis.periodicitySum += candidate.periodicity;
      hypothesis.signalToNoiseEstimateSum += candidate.signalToNoiseEstimate;
      hypothesis.rankingScoreSum += candidate.rankingScore;
      hypothesis.relativeInputLevelSum += relativeInputLevel;
      return;
    }

    hypothesis.frequencyHz = candidate.frequencyHz;
    hypothesis.framesSeen = 1;
    hypothesis.consecutiveFrames = 1;
    hypothesis.graceFrames = 0;
    hypothesis.probabilitySum = candidate.probability;
    hypothesis.periodicitySum = candidate.periodicity;
    hypothesis.signalToNoiseEstimateSum = candidate.signalToNoiseEstimate;
    hypothesis.rankingScoreSum = candidate.rankingScore;
    hypothesis.relativeInputLevelSum = relativeInputLevel;
  }

  private markStartupHypothesisMissed(hypothesis: StartupPitchHypothesis): void {
    if (!this.hasStartupHypothesis(hypothesis)) {
      return;
    }

    hypothesis.consecutiveFrames = 0;
    hypothesis.graceFrames = Math.min(STARTUP_HYPOTHESIS_GRACE_FRAMES + 1, hypothesis.graceFrames + 1);
  }

  private getStartupHypothesisQuality(hypothesis: StartupPitchHypothesis): {
    probability: number;
    periodicity: number;
    signalToNoiseEstimate: number;
    rankingScore: number;
    relativeInputLevel: number;
  } | null {
    if (!this.hasStartupHypothesis(hypothesis)) {
      return null;
    }

    return {
      probability: hypothesis.probabilitySum / hypothesis.framesSeen,
      periodicity: hypothesis.periodicitySum / hypothesis.framesSeen,
      signalToNoiseEstimate: hypothesis.signalToNoiseEstimateSum / hypothesis.framesSeen,
      rankingScore: hypothesis.rankingScoreSum / hypothesis.framesSeen,
      relativeInputLevel: hypothesis.relativeInputLevelSum / hypothesis.framesSeen
    };
  }

  private canAcceptStartupUpperHypothesis(): boolean {
    if (
      !this.hasStartupHypothesis(this.startupUpperHypothesis) ||
      this.startupUpperHypothesis.consecutiveFrames < STARTUP_UPPER_CONFIRM_FRAMES
    ) {
      return false;
    }

    const quality = this.getStartupHypothesisQuality(this.startupUpperHypothesis);
    if (quality === null) {
      return false;
    }

    return quality.probability >= STARTUP_UPPER_MIN_PROBABILITY &&
      quality.periodicity >= STARTUP_UPPER_MIN_PERIODICITY &&
      quality.signalToNoiseEstimate >= STARTUP_UPPER_MIN_SNR &&
      quality.rankingScore >= STARTUP_UPPER_MIN_RANKING_SCORE;
  }

  private canAcceptStartupLowHypothesis(strongOnsetActive: boolean): boolean {
    const requiredFrames = strongOnsetActive
      ? STARTUP_CONTESTED_STRONG_LOW_CONFIRM_FRAMES
      : STARTUP_CONTESTED_LOW_CONFIRM_FRAMES;
    if (
      !this.hasStartupHypothesis(this.startupLowHypothesis) ||
      this.startupLowHypothesis.consecutiveFrames < requiredFrames
    ) {
      return false;
    }

    const quality = this.getStartupHypothesisQuality(this.startupLowHypothesis);
    if (quality === null) {
      return false;
    }

    return quality.probability >= STARTUP_CONTESTED_LOW_MIN_PROBABILITY &&
      quality.periodicity >= STARTUP_CONTESTED_LOW_MIN_PERIODICITY &&
      quality.signalToNoiseEstimate >= STARTUP_CONTESTED_LOW_MIN_SNR &&
      quality.rankingScore >= STARTUP_CONTESTED_LOW_MIN_RANKING_SCORE;
  }

  private clearStartupHypotheses(): void {
    this.startupLowHypothesis = this.createEmptyStartupHypothesis();
    this.startupUpperHypothesis = this.createEmptyStartupHypothesis();
  }

  private clearPendingCandidate(): void {
    this.pendingCandidateHz = null;
    this.pendingCandidateFrames = 0;
    this.pendingCandidateGraceFrames = 0;
    this.pendingCandidateProbabilitySum = 0;
    this.pendingCandidatePeriodicitySum = 0;
    this.pendingCandidateSnrSum = 0;
    this.pendingCandidateLevelSum = 0;
  }

  private clearAcceptedPitch(): void {
    this.acceptedFrequencyHz = null;
    this.decayFramesRemaining = 0;
    this.lowConfidenceFrames = 0;
    this.earlyCorrectionFramesRemaining = 0;
    this.recentPitchCandidates = [];
    this.clearStartupHypotheses();
  }

  private pushRecentPitchCandidate(candidateHz: number): void {
    this.recentPitchCandidates.push(candidateHz);

    if (this.recentPitchCandidates.length > 6) {
      this.recentPitchCandidates.shift();
    }
  }

  private getRecentCandidateMedian(referenceHz: number): number | null {
    const compatibleCandidates = this.recentPitchCandidates
      .filter(candidate => this.isCompatiblePitch(candidate, referenceHz, ACQUISITION_SEMITONE_TOLERANCE))
      .slice()
      .sort((left, right) => left - right);

    if (compatibleCandidates.length === 0) {
      return null;
    }

    return compatibleCandidates[Math.floor(compatibleCandidates.length / 2)];
  }

  private isCompatiblePitch(leftHz: number, rightHz: number, semitoneTolerance: number): boolean {
    return this.getSemitoneDistance(leftHz, rightHz) <= semitoneTolerance;
  }

  private getSemitoneDistance(leftHz: number, rightHz: number): number {
    const leftMidi = frequencyToMidiFloat(leftHz);
    const rightMidi = frequencyToMidiFloat(rightHz);
    return Math.abs(leftMidi - rightMidi);
  }

  private isHarmonicLikeJump(leftHz: number, rightHz: number): boolean {
    const semitoneDistance = this.getSemitoneDistance(leftHz, rightHz);
    return Math.abs(semitoneDistance - 12) <= 0.9 || Math.abs(semitoneDistance - 19) <= 0.9;
  }

  private isContestedStartupLowShadowFrequency(frequencyHz: number): boolean {
    return frequencyHz >= STARTUP_SHADOW_MIN_HZ && frequencyHz <= STARTUP_SHADOW_MAX_HZ;
  }

  private getLowBandShadowProfile(lowFrequencyHz: number, upperFrequencyHz: number): LowBandShadowProfile | null {
    if (!this.isContestedStartupLowShadowFrequency(lowFrequencyHz) || upperFrequencyHz <= lowFrequencyHz) {
      return null;
    }

    const ratio = upperFrequencyHz / lowFrequencyHz;
    for (const profile of LOW_BAND_SHADOW_PROFILES) {
      if (Number.isFinite(ratio) && Math.abs(ratio - profile.ratioTarget) <= profile.ratioTolerance) {
        return profile;
      }
    }

    return null;
  }

  private isSubharmonicCorrectionCandidate(
    candidateHz: number,
    acceptedHz: number,
    _jumpSemitoneDistance: number
  ): boolean {
    return this.getLowBandShadowProfile(acceptedHz, candidateHz) !== null;
  }

  private isSubharmonicShadowCandidate(
    candidateHz: number,
    acceptedHz: number,
    _jumpSemitoneDistance: number
  ): boolean {
    return this.getLowBandShadowProfile(candidateHz, acceptedHz) !== null;
  }

  private detectStrongOnset(
    relativeInputLevel: number,
    probability: number,
    periodicity: number,
    signalPresent: boolean
  ): boolean {
    if (!signalPresent || probability < 0.56 || periodicity < 0.7 || relativeInputLevel < STRONG_ONSET_LEVEL) {
      return false;
    }

    const levelRise = relativeInputLevel - this.recentInputLevel;
    if (levelRise >= STRONG_ONSET_RISE) {
      return true;
    }

    return this.recentInputLevel > 0 &&
      relativeInputLevel >= this.recentInputLevel * 1.45 &&
      levelRise >= 0.03;
  }

  private updateOnsetWindow(onsetDetected: boolean): void {
    if (onsetDetected) {
      this.onsetFramesRemaining = STRONG_ONSET_WINDOW_FRAMES;
      return;
    }

    this.onsetFramesRemaining = Math.max(0, this.onsetFramesRemaining - 1);
  }

  private acceptNewPitch(
    candidateFrequencyHz: number,
    quality: TrackingQualitySnapshot,
    relativeInputLevel: number
  ): TunerTrackerResult {
    const stabilizedCandidate = this.getRecentCandidateMedian(candidateFrequencyHz) ?? candidateFrequencyHz;

    this.acceptedFrequencyHz = stabilizedCandidate;
    this.decayFramesRemaining = LOCK_HOLD_FRAMES;
    this.lowConfidenceFrames = 0;
    this.earlyCorrectionFramesRemaining = EARLY_CORRECTION_WINDOW_FRAMES;
    this.clearPendingCandidate();
    this.clearStartupHypotheses();
    this.trackingState = 'locked';

    return {
      acceptedFrequencyHz: this.acceptedFrequencyHz,
      pitchLocked: true,
      state: this.trackingState,
      lockStrength: this.computeLockStrength(quality.probability, quality.periodicity, relativeInputLevel, 0.92)
    };
  }

  private smoothFrequency(currentHz: number, nextHz: number, factor: number): number {
    return currentHz + (nextHz - currentHz) * factor;
  }

  private advanceEarlyCorrectionWindow(pitchLocked: boolean): void {
    if (!pitchLocked) {
      this.earlyCorrectionFramesRemaining = 0;
      return;
    }

    this.earlyCorrectionFramesRemaining = Math.max(0, this.earlyCorrectionFramesRemaining - 1);
  }

  private computeLockStrength(probability: number, periodicity: number, inputLevel: number, continuity: number): number {
    return Math.max(0, Math.min(1, probability * 0.34 + periodicity * 0.28 + inputLevel * 0.18 + continuity * 0.2));
  }

  private smoothValue(current: number, next: number, factor: number): number {
    return current + (next - current) * factor;
  }
}

function getRelativeSignalLevel(rms: number, noiseFloor: number): number {
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }

  const safeNoiseFloor = Math.max(noiseFloor, 1e-5);
  const safeRms = Math.max(rms, safeNoiseFloor);
  const excessDb = 20 * Math.log10((safeRms + 1e-8) / (safeNoiseFloor + 1e-8));
  const normalized = clamp01((excessDb - 0.5) / 24);

  return Math.pow(normalized, 0.8);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
