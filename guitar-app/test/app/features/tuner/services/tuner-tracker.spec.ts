import { DetectedPitch, DetectedPitchCandidate } from '@/app/features/tuner/services/tuner-detector';
import { TunerTracker } from '@/app/features/tuner/services/tuner-tracker';

describe('TunerTracker', () => {
  it('arbitrates startup away from a low E4 shadow when a stable upper candidate appears', () => {
    const tracker = new TunerTracker();

    const first = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.1,
      candidates: [
        createDetectedPitchCandidate(110.1, 0.67, 0.8, 4.1, 0.56)
      ]
    }));
    const second = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.2,
      candidates: [
        createDetectedPitchCandidate(110.2, 0.69, 0.82, 4.3, 0.57),
        createDetectedPitchCandidate(329.7, 0.63, 0.78, 4.5, 0.61)
      ]
    }));
    const third = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.0,
      candidates: [
        createDetectedPitchCandidate(110.0, 0.68, 0.81, 4.2, 0.56),
        createDetectedPitchCandidate(329.8, 0.64, 0.79, 4.8, 0.63)
      ]
    }));

    expect(first.pitchLocked).toBe(false);
    expect(second.pitchLocked).toBe(false);
    expect(second.acceptedFrequencyHz).toBeNull();
    expect(third.pitchLocked).toBe(true);
    expect(Math.abs(third.acceptedFrequencyHz! - 329.8)).toBeLessThan(1.5);
    expect(tracker.getAcceptedFrequencyHz()).not.toBeNull();
    expect(Math.abs(tracker.getAcceptedFrequencyHz()! - 329.8)).toBeLessThan(1.5);
  });

  it('delays a low E4 startup lock when upper evidence is intermittent and then promotes the stable upper candidate', () => {
    const tracker = new TunerTracker();

    trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.1,
      candidates: [
        createDetectedPitchCandidate(110.1, 0.67, 0.8, 4, 0.56)
      ]
    }));
    const contested = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.1,
      candidates: [
        createDetectedPitchCandidate(110.1, 0.68, 0.81, 4.1, 0.56),
        createDetectedPitchCandidate(329.6, 0.58, 0.72, 2.4, 0.57)
      ]
    }));
    const fallback = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.0,
      candidates: [
        createDetectedPitchCandidate(110.0, 0.69, 0.82, 4.2, 0.56)
      ]
    }));
    const recoveryA = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.2,
      candidates: [
        createDetectedPitchCandidate(110.2, 0.69, 0.82, 4.2, 0.57),
        createDetectedPitchCandidate(329.7, 0.61, 0.76, 3.3, 0.58)
      ]
    }));
    const recovered = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.1,
      candidates: [
        createDetectedPitchCandidate(110.1, 0.69, 0.82, 4.1, 0.56),
        createDetectedPitchCandidate(329.8, 0.62, 0.77, 3.6, 0.6)
      ]
    }));

    expect(contested.pitchLocked).toBe(false);
    expect(fallback.pitchLocked).toBe(false);
    expect(recoveryA.pitchLocked).toBe(false);
    expect(recovered.pitchLocked).toBe(true);
    expect(Math.abs(recovered.acceptedFrequencyHz! - 329.8)).toBeLessThan(1.5);
  });

  it('applies the same startup arbitration to an F4 third-subharmonic shadow', () => {
    const tracker = new TunerTracker();

    trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 116.4,
      candidates: [
        createDetectedPitchCandidate(116.4, 0.66, 0.79, 3.8, 0.55)
      ]
    }));
    const contested = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 116.2,
      candidates: [
        createDetectedPitchCandidate(116.2, 0.67, 0.8, 4, 0.55),
        createDetectedPitchCandidate(349.4, 0.62, 0.77, 4.2, 0.6)
      ]
    }));
    const resolved = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 116.3,
      candidates: [
        createDetectedPitchCandidate(116.3, 0.67, 0.8, 4, 0.55),
        createDetectedPitchCandidate(349.2, 0.64, 0.79, 4.5, 0.62)
      ]
    }));

    expect(contested.pitchLocked).toBe(false);
    expect(resolved.pitchLocked).toBe(true);
    expect(Math.abs(resolved.acceptedFrequencyHz! - 349.2)).toBeLessThan(1.5);
  });

  it('keeps fast startup acquisition for a real A2 when no viable upper partner exists', () => {
    const tracker = new TunerTracker();

    const first = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.0,
      candidates: [
        createDetectedPitchCandidate(110.0, 0.69, 0.82, 4.5, 0.58),
        createDetectedPitchCandidate(220.0, 0.41, 0.53, 0.3, 0.6)
      ]
    }));
    const second = trackSyntheticFrame(tracker, createDetectedPitchFrame({
      frequencyHz: 110.1,
      candidates: [
        createDetectedPitchCandidate(110.1, 0.7, 0.83, 4.6, 0.59),
        createDetectedPitchCandidate(220.2, 0.42, 0.54, 0.35, 0.61)
      ]
    }));

    expect(first.pitchLocked).toBe(false);
    expect(second.pitchLocked).toBe(true);
    expect(Math.abs(second.acceptedFrequencyHz! - 110.1)).toBeLessThan(1.2);
  });

  it('allows subharmonic correction when the streak average stays strong despite a weaker last frame', () => {
    const tracker = new TunerTracker();

    tracker.accumulatePendingCandidate(330.84, 0.6, 0.595, 0.831, 4.76, 0.264);
    tracker.accumulatePendingCandidate(330.79, 0.6, 0.582, 0.817, 4.44, 0.245);
    tracker.accumulatePendingCandidate(330.74, 0.6, 0.582, 0.818, 4.46, 0.228);
    tracker.accumulatePendingCandidate(330.86, 0.6, 0.541, 0.772, 3.48, 0.214);

    const quality = tracker.getPendingCandidateQualityAverages();

    expect(quality).not.toBeNull();
    expect(quality!.probability).toBeGreaterThanOrEqual(0.57);
    expect(quality!.periodicity).toBeGreaterThanOrEqual(0.78);
    expect(quality!.signalToNoiseEstimate).toBeGreaterThanOrEqual(3);
    expect(quality!.relativeInputLevel).toBeGreaterThanOrEqual(0.2);
    expect(tracker.hasStrongPendingSubharmonicCorrection()).toBe(true);
  });

  it('allows a very strong subharmonic correction after three stable frames', () => {
    const tracker = new TunerTracker();

    tracker.accumulatePendingCandidate(330.61, 0.6, 0.646, 0.871, 5.95, 0.472);
    tracker.accumulatePendingCandidate(330.58, 0.6, 0.626, 0.853, 5.37, 0.465);
    tracker.accumulatePendingCandidate(330.64, 0.6, 0.603, 0.83, 4.79, 0.456);

    const quality = tracker.getPendingCandidateQualityAverages();

    expect(quality).not.toBeNull();
    expect(quality!.probability).toBeGreaterThanOrEqual(0.62);
    expect(quality!.periodicity).toBeGreaterThanOrEqual(0.84);
    expect(quality!.signalToNoiseEstimate).toBeGreaterThanOrEqual(5);
    expect(quality!.relativeInputLevel).toBeGreaterThanOrEqual(0.3);
    expect(tracker.hasVeryStrongPendingSubharmonicCorrection(110)).toBe(true);
  });

  it('keeps a pending high correction alive through one brief fallback frame', () => {
    const tracker = new TunerTracker();
    tracker.setPendingCandidateForTest({
      frequencyHz: 331.2,
      frames: 3,
      graceFrames: 0
    });

    expect(tracker.retainPendingCorrectionGrace(110)).toBe(true);
    expect(tracker.getDebugSnapshot().pendingCandidateFrames).toBe(3);
    expect(tracker.retainPendingCorrectionGrace(110)).toBe(false);
  });

  it('treats a quiet high-confidence pitch as signal even below the current noise floor', () => {
    const tracker = new TunerTracker();

    expect(tracker.isPitchCandidatePresent(true, 331, 0.718, 0.881, 6.28)).toBe(true);
    expect(tracker.isSignalPresent(0.000064, 0.00008, 0.881, 0.718, 6.28, 0, true)).toBe(true);
    expect(tracker.isAudioPresent(0.000064, 0.00008, 0, true)).toBe(true);
    expect(tracker.getPitchCandidateMeterLevel(0.718, 6.28)).toBeGreaterThan(0.06);
  });

  it('admits a soft upper-string candidate as signal before the general quiet-signal thresholds', () => {
    const tracker = new TunerTracker();

    tracker.setUpperStringCandidateFrames(1);
    expect(tracker.isPitchCandidatePresent(true, 331, 0.596, 0.834, 4.98)).toBe(false);

    tracker.setUpperStringCandidateFrames(2);
    expect(tracker.isPitchCandidatePresent(true, 331, 0.596, 0.834, 4.98)).toBe(true);
    expect(tracker.isPitchCandidatePresent(true, 110, 0.596, 0.834, 4.98)).toBe(false);
  });

  function trackSyntheticFrame(
    tracker: TunerTracker,
    detected: DetectedPitch,
    options: {
      audioPresent?: boolean;
      signalPresent?: boolean;
      relativeInputLevel?: number;
      strongOnsetActive?: boolean;
    } = {}
  ) {
    const relativeInputLevel = options.relativeInputLevel ?? 0.2;
    const result = tracker.updateTrackingState(
      detected,
      options.audioPresent ?? true,
      options.signalPresent ?? true,
      relativeInputLevel,
      options.strongOnsetActive ?? false
    );
    tracker.finalizeFrame(result.pitchLocked, relativeInputLevel);
    return result;
  }

  function createDetectedPitchFrame(options: {
    frequencyHz: number | null;
    probability?: number;
    periodicity?: number;
    signalToNoiseEstimate?: number;
    hasPitch?: boolean;
    candidates?: DetectedPitchCandidate[];
  }): DetectedPitch {
    const probability = options.probability ?? 0.68;
    const periodicity = options.periodicity ?? 0.82;
    const signalToNoiseEstimate = options.signalToNoiseEstimate ?? 4.2;

    return {
      frequencyHz: options.frequencyHz,
      clarity: periodicity,
      probability,
      periodicity,
      rms: 0.012,
      signalToNoiseEstimate,
      hasPitch: options.hasPitch ?? options.frequencyHz !== null,
      candidates: options.candidates ?? []
    };
  }

  function createDetectedPitchCandidate(
    frequencyHz: number,
    probability: number,
    periodicity: number,
    signalToNoiseEstimate: number,
    rankingScore: number
  ): DetectedPitchCandidate {
    return {
      frequencyHz,
      probability,
      periodicity,
      signalToNoiseEstimate,
      rankingScore
    };
  }
});
