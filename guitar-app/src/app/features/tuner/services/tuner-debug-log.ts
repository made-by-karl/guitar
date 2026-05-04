import { DetectedPitch } from '@/app/features/tuner/services/tuner-detector';
import { PitchTrackingState } from '@/app/features/tuner/services/tuner.types';

const MAX_DEBUG_FRAMES = 1500;

export interface TunerDetectorDebugPayload {
  minLag: number;
  maxLag: number;
  threshold: number | null;
  thresholdLag: number | null;
  selectedLag: number;
  refinedLag: number | null;
  selectedFrequencyHz: number | null;
  globalMinimumLag: number;
  globalMinimumFrequencyHz: number | null;
  thresholdMatched: boolean;
  selectionSource: 'threshold' | 'earliest-comparable-minimum' | 'global-minimum' | 'candidate-ranking';
  earliestComparableLag: number | null;
  topLocalMinima: Array<{
    lag: number;
    frequencyHz: number | null;
    cmndfValue: number | null;
    refinedLag: number | null;
    periodicity: number | null;
    signalToNoiseEstimate: number | null;
    probability: number | null;
    thresholdMatched: boolean | null;
    spectrumScore: number | null;
    rankingScore: number | null;
    source: 'local-minimum' | 'spectral-peak' | 'fallback' | null;
  }>;
  topRankedCandidates: Array<{
    lag: number;
    frequencyHz: number | null;
    cmndfValue: number | null;
    refinedLag: number | null;
    periodicity: number | null;
    signalToNoiseEstimate: number | null;
    probability: number | null;
    thresholdMatched: boolean | null;
    spectrumScore: number | null;
    rankingScore: number | null;
    source: 'local-minimum' | 'spectral-peak' | 'fallback' | null;
  }>;
}

export interface TunerDebugFrameLog {
  type: 'tuner-frame';
  frame: number;
  elapsedMs: number | null;
  trackingState: PitchTrackingState;
  pitchLocked: boolean;
  signalPresent: boolean;
  audioPresent: boolean;
  strongOnsetDetected: boolean;
  strongOnsetActive: boolean;
  rawFrequencyHz: number | null;
  acceptedFrequencyHz: number | null;
  displayFrequencyHz: number | null;
  pitchProbability: number | null;
  periodicity: number | null;
  rms: number | null;
  noiseFloor: number | null;
  signalToNoiseEstimate: number | null;
  displayInputLevel: number | null;
  inputLevel: number | null;
  lockStrength: number | null;
  pendingCandidateHz: number | null;
  pendingCandidateFrames: number;
  pendingCandidateAverageProbability: number | null;
  pendingCandidateAveragePeriodicity: number | null;
  pendingCandidateAverageSnr: number | null;
  pendingCandidateAverageLevel: number | null;
  earlyCorrectionFramesRemaining: number;
  onsetFramesRemaining: number;
  lowConfidenceFrames: number;
  detector: TunerDetectorDebugPayload | null;
}

export interface TunerDebugTrackerSnapshot {
  pendingCandidateHz: number | null;
  pendingCandidateFrames: number;
  pendingCandidateAverageProbability: number | null;
  pendingCandidateAveragePeriodicity: number | null;
  pendingCandidateAverageSnr: number | null;
  pendingCandidateAverageLevel: number | null;
  earlyCorrectionFramesRemaining: number;
  onsetFramesRemaining: number;
  lowConfidenceFrames: number;
}

export interface TunerDebugExportPayload {
  capturedAt: string;
  description: string | null;
  sampleRate: number | null;
  fftSize: number | null;
  frameCount: number;
  frames: TunerDebugFrameLog[];
}

export function appendDebugFrame(
  frames: TunerDebugFrameLog[],
  input: {
    frame: number;
    elapsedMs: number;
    trackingState: PitchTrackingState;
    pitchLocked: boolean;
    signalPresent: boolean;
    audioPresent: boolean;
    strongOnsetDetected: boolean;
    strongOnsetActive: boolean;
    rawFrequencyHz: number | null;
    acceptedFrequencyHz: number | null;
    displayFrequencyHz: number | null;
    pitchProbability: number;
    noiseFloor: number;
    displayInputLevel: number;
    inputLevel: number;
    lockStrength: number;
    detected: DetectedPitch;
    tracker: TunerDebugTrackerSnapshot;
  }
): void {
  frames.push({
    type: 'tuner-frame',
    frame: input.frame,
    elapsedMs: roundDebugValue(input.elapsedMs, 1),
    trackingState: input.trackingState,
    pitchLocked: input.pitchLocked,
    signalPresent: input.signalPresent,
    audioPresent: input.audioPresent,
    strongOnsetDetected: input.strongOnsetDetected,
    strongOnsetActive: input.strongOnsetActive,
    rawFrequencyHz: roundDebugValue(input.rawFrequencyHz),
    acceptedFrequencyHz: roundDebugValue(input.acceptedFrequencyHz),
    displayFrequencyHz: roundDebugValue(input.displayFrequencyHz),
    pitchProbability: roundDebugValue(input.pitchProbability, 3),
    periodicity: roundDebugValue(input.detected.periodicity, 3),
    rms: roundDebugValue(input.detected.rms, 6),
    noiseFloor: roundDebugValue(input.noiseFloor, 6),
    signalToNoiseEstimate: roundDebugValue(input.detected.signalToNoiseEstimate, 2),
    displayInputLevel: roundDebugValue(input.displayInputLevel, 3),
    inputLevel: roundDebugValue(input.inputLevel, 3),
    lockStrength: roundDebugValue(input.lockStrength, 3),
    pendingCandidateHz: roundDebugValue(input.tracker.pendingCandidateHz),
    pendingCandidateFrames: input.tracker.pendingCandidateFrames,
    pendingCandidateAverageProbability: roundDebugValue(input.tracker.pendingCandidateAverageProbability, 3),
    pendingCandidateAveragePeriodicity: roundDebugValue(input.tracker.pendingCandidateAveragePeriodicity, 3),
    pendingCandidateAverageSnr: roundDebugValue(input.tracker.pendingCandidateAverageSnr, 2),
    pendingCandidateAverageLevel: roundDebugValue(input.tracker.pendingCandidateAverageLevel, 3),
    earlyCorrectionFramesRemaining: input.tracker.earlyCorrectionFramesRemaining,
    onsetFramesRemaining: input.tracker.onsetFramesRemaining,
    lowConfidenceFrames: input.tracker.lowConfidenceFrames,
    detector: buildDetectorDebugPayload(input.detected)
  });

  if (frames.length > MAX_DEBUG_FRAMES) {
    frames.shift();
  }
}

export function buildDebugExportPayload(input: {
  frames: TunerDebugFrameLog[];
  description: string | null;
  sampleRate: number | null;
  fftSize: number | null;
}): TunerDebugExportPayload | null {
  if (input.frames.length === 0) {
    return null;
  }

  return {
    capturedAt: new Date().toISOString(),
    description: input.description,
    sampleRate: input.sampleRate,
    fftSize: input.fftSize,
    frameCount: input.frames.length,
    frames: input.frames.slice()
  };
}

export function buildDebugExportFilename(timestamp: string, description: string | null): string {
  const label = slugifyDebugDescription(description);
  return label === null
    ? `tuner-debug-${timestamp}.json`
    : `tuner-debug-${timestamp}-${label}.json`;
}

export function normalizeDebugDescription(description: string | null): string | null {
  if (description === null) {
    return null;
  }

  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function roundDebugValue(value: number | null, digits: number = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function buildDetectorDebugPayload(detected: DetectedPitch): TunerDetectorDebugPayload | null {
  const debug = detected.debug;
  if (!debug) {
    return null;
  }

  return {
    minLag: debug.minLag,
    maxLag: debug.maxLag,
    threshold: roundDebugValue(debug.threshold, 3),
    thresholdLag: debug.thresholdLag,
    selectedLag: debug.selectedLag,
    refinedLag: roundDebugValue(debug.refinedLag, 3),
    selectedFrequencyHz: roundDebugValue(debug.selectedFrequencyHz),
    globalMinimumLag: debug.globalMinimumLag,
    globalMinimumFrequencyHz: roundDebugValue(debug.globalMinimumFrequencyHz),
    thresholdMatched: debug.thresholdMatched,
    selectionSource: debug.selectionSource,
    earliestComparableLag: debug.earliestComparableLag,
    topLocalMinima: debug.topLocalMinima.map(minimum => ({
      lag: minimum.lag,
      frequencyHz: roundDebugValue(minimum.frequencyHz),
      cmndfValue: roundDebugValue(minimum.cmndfValue, 4),
      refinedLag: roundDebugValue(minimum.refinedLag ?? null, 3),
      periodicity: roundDebugValue(minimum.periodicity ?? null, 3),
      signalToNoiseEstimate: roundDebugValue(minimum.signalToNoiseEstimate ?? null, 2),
      probability: roundDebugValue(minimum.probability ?? null, 3),
      thresholdMatched: minimum.thresholdMatched ?? null,
      spectrumScore: roundDebugValue(minimum.spectrumScore ?? null, 4),
      rankingScore: roundDebugValue(minimum.rankingScore ?? null, 4),
      source: minimum.source ?? null
    })),
    topRankedCandidates: debug.topRankedCandidates.map(candidate => ({
      lag: candidate.lag,
      frequencyHz: roundDebugValue(candidate.frequencyHz),
      cmndfValue: roundDebugValue(candidate.cmndfValue, 4),
      refinedLag: roundDebugValue(candidate.refinedLag ?? null, 3),
      periodicity: roundDebugValue(candidate.periodicity ?? null, 3),
      signalToNoiseEstimate: roundDebugValue(candidate.signalToNoiseEstimate ?? null, 2),
      probability: roundDebugValue(candidate.probability ?? null, 3),
      thresholdMatched: candidate.thresholdMatched ?? null,
      spectrumScore: roundDebugValue(candidate.spectrumScore ?? null, 4),
      rankingScore: roundDebugValue(candidate.rankingScore ?? null, 4),
      source: candidate.source ?? null
    }))
  };
}

function slugifyDebugDescription(description: string | null): string | null {
  if (description === null) {
    return null;
  }

  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : null;
}
