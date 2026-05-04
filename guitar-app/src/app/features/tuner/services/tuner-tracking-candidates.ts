import { frequencyToMidiFloat } from '@/app/features/tuner/services/tuner-note-math';

const MIN_FREQUENCY_HZ = 1;
const DEFAULT_MIN_FREQUENCY_HZ = 70;
const DEFAULT_MAX_FREQUENCY_HZ = 700;

export function buildTrackingPitchCandidates(
  detectedFrequencyHz: number,
  options: { minHz?: number; maxHz?: number } = {}
): number[] {
  if (!Number.isFinite(detectedFrequencyHz) || detectedFrequencyHz <= 0) {
    return [];
  }

  const minHz = Math.max(MIN_FREQUENCY_HZ, options.minHz ?? DEFAULT_MIN_FREQUENCY_HZ);
  const maxHz = Math.max(minHz + 1, options.maxHz ?? DEFAULT_MAX_FREQUENCY_HZ);
  const candidates = [detectedFrequencyHz / 2, detectedFrequencyHz, detectedFrequencyHz * 2];
  const uniqueCandidates: number[] = [];

  for (const candidate of candidates) {
    if (candidate < minHz || candidate > maxHz) {
      continue;
    }

    if (uniqueCandidates.some(existing => Math.abs(existing - candidate) < 0.01)) {
      continue;
    }

    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

export function scoreTrackingPitchCandidate(
  candidateFrequencyHz: number,
  referenceFrequencyHz: number,
  probability: number,
  periodicity: number
): number {
  if (
    !Number.isFinite(candidateFrequencyHz) ||
    candidateFrequencyHz <= 0 ||
    !Number.isFinite(referenceFrequencyHz) ||
    referenceFrequencyHz <= 0
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const semitoneDistance = Math.abs(
    frequencyToMidiFloat(candidateFrequencyHz) - frequencyToMidiFloat(referenceFrequencyHz)
  );
  const continuity = clamp01(1 - semitoneDistance / 1.6);
  const proximityPenalty = Math.min(2.5, semitoneDistance) * 0.18;

  return probability * 0.45 + periodicity * 0.35 + continuity * 0.35 - proximityPenalty;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
