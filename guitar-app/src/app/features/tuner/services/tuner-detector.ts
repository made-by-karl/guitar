import { frequencyToMidiFloat, midiToFrequency } from '@/app/features/tuner/services/tuner-note-math';

export interface DetectedPitch {
  frequencyHz: number | null;
  clarity: number;
  probability: number;
  periodicity: number;
  rms: number;
  signalToNoiseEstimate: number;
  hasPitch: boolean;
  candidates: DetectedPitchCandidate[];
  debug?: PitchDetectionDebug;
}

export interface DetectedPitchCandidate {
  frequencyHz: number;
  probability: number;
  periodicity: number;
  signalToNoiseEstimate: number;
  rankingScore: number;
}

export interface PitchDetectionLocalMinimum {
  lag: number;
  frequencyHz: number;
  cmndfValue: number;
  refinedLag?: number;
  periodicity?: number;
  signalToNoiseEstimate?: number;
  probability?: number;
  thresholdMatched?: boolean;
  spectrumScore?: number | null;
  rankingScore?: number | null;
  source?: 'local-minimum' | 'spectral-peak' | 'fallback';
}

export interface PitchDetectionDebug {
  minLag: number;
  maxLag: number;
  threshold: number;
  thresholdLag: number | null;
  selectedLag: number;
  refinedLag: number;
  globalMinimumLag: number;
  globalMinimumFrequencyHz: number;
  selectedFrequencyHz: number;
  thresholdMatched: boolean;
  selectionSource: 'threshold' | 'earliest-comparable-minimum' | 'global-minimum' | 'candidate-ranking';
  earliestComparableLag: number | null;
  topLocalMinima: PitchDetectionLocalMinimum[];
  topRankedCandidates: PitchDetectionLocalMinimum[];
}

const MIN_FREQUENCY_HZ = 1;
const DEFAULT_MIN_FREQUENCY_HZ = 70;
const DEFAULT_MAX_FREQUENCY_HZ = 700;
const DEFAULT_YIN_THRESHOLD = 0.12;
const HIGH_PASS_ALPHA = 0.995;
const EPSILON = 1e-8;
const MAX_LOCAL_MINIMA_CANDIDATES = 10;
const SPECTRAL_GRID_DIVISIONS_PER_SEMITONE = 4;
const MAX_SPECTRAL_PEAK_CANDIDATES = 8;
const MAX_RUNTIME_RANKED_CANDIDATES = 4;
const MAX_DEBUG_RANKED_CANDIDATES = 6;

interface HarmonicCandidate {
  lag: number;
  frequencyHz: number;
  cmndfValue: number;
  spectrumScore: number;
  source: 'local-minimum' | 'spectral-peak' | 'fallback';
}

interface SpectralPeakCandidate {
  frequencyHz: number;
  score: number;
}

export function calculateRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = samples[index];
    sumSquares += value * value;
  }

  return Math.sqrt(sumSquares / samples.length);
}

export function getSignalLevel(samples: Float32Array): number {
  return getRelativeSignalLevel(calculateRms(samples), 0.0025);
}

export function getRelativeSignalLevel(rms: number, noiseFloor: number): number {
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }

  const safeNoiseFloor = Math.max(noiseFloor, 1e-5);
  const safeRms = Math.max(rms, safeNoiseFloor);
  const excessDb = 20 * Math.log10((safeRms + EPSILON) / (safeNoiseFloor + EPSILON));
  const normalized = clamp01((excessDb - 0.5) / 24);

  return Math.pow(normalized, 0.8);
}

export function normalizePitchFrame(samples: Float32Array): Float32Array {
  if (samples.length === 0) {
    return new Float32Array(0);
  }

  let mean = 0;
  for (let index = 0; index < samples.length; index++) {
    mean += samples[index];
  }
  mean /= samples.length;

  const highPassed = new Float32Array(samples.length);
  let previousInput = 0;
  let previousOutput = 0;

  for (let index = 0; index < samples.length; index++) {
    const centered = samples[index] - mean;
    const filtered = HIGH_PASS_ALPHA * (previousOutput + centered - previousInput);
    highPassed[index] = filtered;
    previousInput = centered;
    previousOutput = filtered;
  }

  const smoothed = new Float32Array(samples.length);
  if (samples.length === 1) {
    smoothed[0] = highPassed[0];
    return smoothed;
  }

  smoothed[0] = highPassed[0];
  for (let index = 1; index < highPassed.length - 1; index++) {
    smoothed[index] = (highPassed[index - 1] + 2 * highPassed[index] + highPassed[index + 1]) * 0.25;
  }
  smoothed[highPassed.length - 1] = highPassed[highPassed.length - 1];

  return applyHannWindow(smoothed);
}

export function computeYinDifferenceFunction(samples: Float32Array, maxLag: number): Float32Array {
  const difference = new Float32Array(maxLag + 1);

  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;

    for (let index = 0; index < samples.length - lag; index++) {
      const delta = samples[index] - samples[index + lag];
      sum += delta * delta;
    }

    difference[lag] = sum;
  }

  return difference;
}

export function computeCumulativeMeanNormalizedDifference(
  difference: Float32Array,
  minLag: number,
  maxLag: number
): Float32Array {
  const cmndf = new Float32Array(difference.length);
  cmndf[0] = 1;

  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += difference[lag];
    cmndf[lag] = runningSum === 0 ? 1 : (difference[lag] * lag) / runningSum;
  }

  for (let lag = 1; lag < minLag; lag++) {
    cmndf[lag] = 1;
  }

  return cmndf;
}

export function findYinThresholdCrossing(
  cmndf: Float32Array,
  minLag: number,
  maxLag: number,
  threshold: number = DEFAULT_YIN_THRESHOLD
): number | null {
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmndf[lag] >= threshold) {
      continue;
    }

    let bestLag = lag;
    while (bestLag + 1 <= maxLag && cmndf[bestLag + 1] <= cmndf[bestLag]) {
      bestLag += 1;
    }

    return bestLag;
  }

  return null;
}

export function refineYinLag(cmndf: Float32Array, lag: number, minLag: number, maxLag: number): number {
  const previousIndex = Math.max(minLag, lag - 1);
  const nextIndex = Math.min(maxLag, lag + 1);
  const previousValue = cmndf[previousIndex];
  const currentValue = cmndf[lag];
  const nextValue = cmndf[nextIndex];
  const denominator = previousValue - 2 * currentValue + nextValue;

  if (Math.abs(denominator) < EPSILON) {
    return lag;
  }

  const correction = 0.5 * (previousValue - nextValue) / denominator;
  const refined = lag + correction;

  if (!Number.isFinite(refined)) {
    return lag;
  }

  return Math.max(minLag, Math.min(maxLag, refined));
}

export function detectPitchFromSamples(
  samples: Float32Array,
  sampleRate: number,
  options: { minHz?: number; maxHz?: number; yinThreshold?: number; debug?: boolean } = {}
): DetectedPitch | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 64) {
    return null;
  }

  const minHz = Math.max(MIN_FREQUENCY_HZ, options.minHz ?? DEFAULT_MIN_FREQUENCY_HZ);
  const maxHz = Math.max(minHz + 1, options.maxHz ?? DEFAULT_MAX_FREQUENCY_HZ);
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / minHz));
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));

  if (minLag >= maxLag) {
    return null;
  }

  const normalized = normalizePitchFrame(samples);
  const rms = calculateRms(normalized);
  const difference = computeYinDifferenceFunction(normalized, maxLag);
  const cmndf = computeCumulativeMeanNormalizedDifference(difference, minLag, maxLag);
  const threshold = options.yinThreshold ?? DEFAULT_YIN_THRESHOLD;
  const localMinima = collectTopLocalMinima(cmndf, minLag, maxLag, sampleRate, MAX_LOCAL_MINIMA_CANDIDATES);
  const lagSelection = findBestYinLag(cmndf, minLag, maxLag, threshold, normalized, sampleRate, minHz, maxHz, localMinima);

  if (lagSelection === null) {
    return createEmptyDetection(rms);
  }

  const bestLag = lagSelection.selectedLag;
  const refinedLag = refineYinLag(cmndf, bestLag, minLag, maxLag);
  const frequencyHz = sampleRate / refinedLag;
  const periodicity = clamp01(1 - cmndf[bestLag]);
  const signalToNoiseEstimate = estimateSignalToNoise(normalized, Math.round(refinedLag));
  const thresholdMatched = cmndf[bestLag] < threshold;
  const probability = computePitchProbability({
    periodicity,
    rms,
    signalToNoiseEstimate,
    thresholdMatched
  });
  const rankedCandidates = buildRankedPitchCandidates({
    cmndf,
    normalized,
    sampleRate,
    minHz,
    maxHz,
    minLag,
    maxLag,
    threshold,
    lagSelection,
    localMinima,
    rms,
    limit: MAX_DEBUG_RANKED_CANDIDATES
  });
  const hasPitch =
    Number.isFinite(frequencyHz) &&
    frequencyHz >= minHz &&
    frequencyHz <= maxHz &&
    periodicity >= 0.58 &&
    probability >= 0.46;

  return {
    frequencyHz: hasPitch ? frequencyHz : null,
    clarity: periodicity,
    probability,
    periodicity,
    rms,
    signalToNoiseEstimate,
    hasPitch,
    candidates: rankedCandidates
      .slice(0, MAX_RUNTIME_RANKED_CANDIDATES)
      .map(candidate => ({
        frequencyHz: candidate.frequencyHz,
        probability: candidate.probability ?? 0,
        periodicity: candidate.periodicity ?? 0,
        signalToNoiseEstimate: candidate.signalToNoiseEstimate ?? -24,
        rankingScore: candidate.rankingScore ?? Number.NEGATIVE_INFINITY
      })),
    debug: options.debug
      ? buildPitchDetectionDebug({
        cmndf,
        normalized,
        sampleRate,
        minLag,
        maxLag,
        minHz,
        maxHz,
        threshold,
        lagSelection,
        localMinima,
        selectedLag: bestLag,
        refinedLag,
        selectedFrequencyHz: frequencyHz,
        thresholdMatched,
        rms,
        rankedCandidates
      })
      : undefined
  };
}

function buildPitchDetectionDebug(input: {
  cmndf: Float32Array;
  normalized: Float32Array;
  sampleRate: number;
  minLag: number;
  maxLag: number;
  minHz: number;
  maxHz: number;
  threshold: number;
  lagSelection: {
    selectedLag: number;
    thresholdLag: number | null;
    globalMinimumLag: number;
    earliestComparableLag: number | null;
    selectionSource: 'threshold' | 'earliest-comparable-minimum' | 'global-minimum' | 'candidate-ranking';
  };
  localMinima: PitchDetectionLocalMinimum[];
  selectedLag: number;
  refinedLag: number;
  selectedFrequencyHz: number;
  thresholdMatched: boolean;
  rms: number;
  rankedCandidates: PitchDetectionLocalMinimum[];
}): PitchDetectionDebug {
  const rankedCandidateByLag = new Map(input.rankedCandidates.map(candidate => [candidate.lag, candidate]));
  const enrichedMinima = input.localMinima
    .slice(0, 5)
    .map(minimum => rankedCandidateByLag.get(minimum.lag) ?? buildDebugCandidateEntry(
      {
        lag: minimum.lag,
        frequencyHz: minimum.frequencyHz,
        cmndfValue: minimum.cmndfValue,
        spectrumScore: Number.NaN,
        source: 'local-minimum'
      },
      input.cmndf,
      input.normalized,
      input.sampleRate,
      input.minLag,
      input.maxLag,
      input.threshold,
      input.rms,
      null
    ));

  return {
    minLag: input.minLag,
    maxLag: input.maxLag,
    threshold: input.threshold,
    thresholdLag: input.lagSelection.thresholdLag,
    selectedLag: input.selectedLag,
    refinedLag: input.refinedLag,
    globalMinimumLag: input.lagSelection.globalMinimumLag,
    globalMinimumFrequencyHz: input.sampleRate / input.lagSelection.globalMinimumLag,
    selectedFrequencyHz: input.selectedFrequencyHz,
    thresholdMatched: input.thresholdMatched,
    selectionSource: input.lagSelection.selectionSource,
    earliestComparableLag: input.lagSelection.earliestComparableLag,
    topLocalMinima: enrichedMinima,
    topRankedCandidates: input.rankedCandidates
  };
}

function buildRankedPitchCandidates(input: {
  cmndf: Float32Array;
  normalized: Float32Array;
  sampleRate: number;
  minHz: number;
  maxHz: number;
  minLag: number;
  maxLag: number;
  threshold: number;
  lagSelection: {
    selectedLag: number;
    thresholdLag: number | null;
  };
  localMinima: PitchDetectionLocalMinimum[];
  rms: number;
  limit: number;
}): PitchDetectionLocalMinimum[] {
  const candidatePool = buildHarmonicCandidatePool(
    input.cmndf,
    input.normalized,
    input.sampleRate,
    input.minHz,
    input.maxHz,
    input.localMinima,
    input.lagSelection.selectedLag
  );
  const fallbackCandidate = candidatePool.find(candidate => candidate.lag === input.lagSelection.selectedLag) ?? null;
  if (fallbackCandidate === null) {
    return [];
  }

  const magnitudeCache = new Map<string, number>();
  for (const candidate of candidatePool) {
    candidate.spectrumScore = computeCandidateSpectrumScore(
      candidate.frequencyHz,
      input.normalized,
      input.sampleRate,
      input.minHz,
      input.maxHz,
      magnitudeCache
    );
  }

  const spectrumScores = candidatePool.map(candidate => candidate.spectrumScore);
  const spectrumMin = spectrumScores.length > 0 ? Math.min(...spectrumScores) : 0;
  const spectrumMax = spectrumScores.length > 0 ? Math.max(...spectrumScores) : 1;
  const spectrumRange = Math.max(EPSILON, spectrumMax - spectrumMin);

  return candidatePool
    .map(candidate => {
      const rankingScore = scoreLagCandidate(
        candidate,
        candidatePool,
        fallbackCandidate,
        input.lagSelection.thresholdLag,
        input.threshold,
        input.normalized,
        input.sampleRate,
        magnitudeCache,
        spectrumMin,
        spectrumRange
      );

      return buildDebugCandidateEntry(
        candidate,
        input.cmndf,
        input.normalized,
        input.sampleRate,
        input.minLag,
        input.maxLag,
        input.threshold,
        input.rms,
        rankingScore
      );
    })
    .sort((left, right) => (right.rankingScore ?? Number.NEGATIVE_INFINITY) - (left.rankingScore ?? Number.NEGATIVE_INFINITY))
    .slice(0, input.limit);
}

function applyHannWindow(samples: Float32Array): Float32Array {
  if (samples.length <= 1) {
    return samples.slice();
  }

  const windowed = new Float32Array(samples.length);
  const denominator = samples.length - 1;

  for (let index = 0; index < samples.length; index++) {
    const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / denominator);
    windowed[index] = samples[index] * weight;
  }

  return windowed;
}

function estimateSignalToNoise(samples: Float32Array, lag: number): number {
  if (lag <= 0 || lag >= samples.length - 1) {
    return -24;
  }

  let signalEnergy = 0;
  let residualEnergy = 0;

  for (let index = 0; index < samples.length - lag; index++) {
    const current = samples[index];
    const delayed = samples[index + lag];
    signalEnergy += current * current;

    const residual = current - delayed;
    residualEnergy += residual * residual;
  }

  const ratio = (signalEnergy + EPSILON) / (residualEnergy + EPSILON);
  return 10 * Math.log10(ratio);
}

function computePitchProbability(input: {
  periodicity: number;
  rms: number;
  signalToNoiseEstimate: number;
  thresholdMatched: boolean;
}): number {
  const periodicityWeight = clamp01(input.periodicity);
  const signalToNoiseWeight = clamp01((input.signalToNoiseEstimate + 3) / 18);
  const rmsWeight = clamp01((Math.log10(input.rms + 1e-5) + 4.1) / 2.2);
  const thresholdBonus = input.thresholdMatched ? 0.08 : 0;

  return clamp01(periodicityWeight * 0.56 + signalToNoiseWeight * 0.28 + rmsWeight * 0.08 + thresholdBonus);
}

function findBestYinLag(
  cmndf: Float32Array,
  minLag: number,
  maxLag: number,
  threshold: number,
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  localMinima: PitchDetectionLocalMinimum[]
): {
  selectedLag: number;
  thresholdLag: number | null;
  globalMinimumLag: number;
  earliestComparableLag: number | null;
  selectionSource: 'threshold' | 'earliest-comparable-minimum' | 'global-minimum' | 'candidate-ranking';
} | null {
  const globalMinimumLag = findMinimumLag(cmndf, minLag, maxLag);
  if (globalMinimumLag === null) {
    return null;
  }

  const thresholdLag = findYinThresholdCrossing(cmndf, minLag, maxLag, threshold);
  const bestValue = cmndf[globalMinimumLag];
  const earliestComparableLag = findEarliestComparableLocalMinimum(cmndf, minLag, maxLag, bestValue);
  const fallbackSelection = thresholdLag !== null
    ? {
      selectedLag: thresholdLag,
      thresholdLag,
      globalMinimumLag,
      earliestComparableLag: null,
      selectionSource: 'threshold' as const
    }
    : {
      selectedLag: earliestComparableLag ?? globalMinimumLag,
      thresholdLag: null,
      globalMinimumLag,
      earliestComparableLag,
      selectionSource: earliestComparableLag === null ? 'global-minimum' as const : 'earliest-comparable-minimum' as const
    };

  const rankedSelection = selectLagByCandidateRanking(
    samples,
    sampleRate,
    minHz,
    maxHz,
    cmndf,
    threshold,
    fallbackSelection,
    localMinima
  );

  if (rankedSelection !== null) {
    return {
      selectedLag: rankedSelection,
      thresholdLag,
      globalMinimumLag,
      earliestComparableLag,
      selectionSource: 'candidate-ranking'
    };
  }

  return {
    selectedLag: fallbackSelection.selectedLag,
    thresholdLag: fallbackSelection.thresholdLag,
    globalMinimumLag,
    earliestComparableLag: fallbackSelection.earliestComparableLag,
    selectionSource: fallbackSelection.selectionSource
  };
}

function findMinimumLag(cmndf: Float32Array, minLag: number, maxLag: number): number | null {
  let bestLag: number | null = null;
  let bestValue = Number.POSITIVE_INFINITY;

  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmndf[lag] < bestValue) {
      bestValue = cmndf[lag];
      bestLag = lag;
    }
  }

  return bestLag;
}

function findEarliestComparableLocalMinimum(
  cmndf: Float32Array,
  minLag: number,
  maxLag: number,
  bestValue: number
): number | null {
  const absoluteCeiling = Math.min(0.24, bestValue + 0.08);
  const relativeCeiling = bestValue * 1.45 + 0.015;
  const acceptableValue = Math.min(absoluteCeiling, relativeCeiling);

  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const currentValue = cmndf[lag];
    const previousValue = cmndf[lag - 1];
    const nextValue = cmndf[lag + 1];
    const isLocalMinimum = currentValue <= previousValue && currentValue <= nextValue;

    if (!isLocalMinimum) {
      continue;
    }

    if (currentValue <= acceptableValue) {
      return lag;
    }
  }

  return null;
}

function collectTopLocalMinima(
  cmndf: Float32Array,
  minLag: number,
  maxLag: number,
  sampleRate: number,
  limit: number = 5
): PitchDetectionLocalMinimum[] {
  const minima: PitchDetectionLocalMinimum[] = [];

  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const currentValue = cmndf[lag];
    const previousValue = cmndf[lag - 1];
    const nextValue = cmndf[lag + 1];
    const isLocalMinimum = currentValue <= previousValue && currentValue <= nextValue;

    if (!isLocalMinimum) {
      continue;
    }

    minima.push({
      lag,
      frequencyHz: sampleRate / lag,
      cmndfValue: currentValue
    });
  }

  minima.sort((left, right) => left.cmndfValue - right.cmndfValue || left.lag - right.lag);
  return minima.slice(0, limit);
}

function buildDebugCandidateEntry(
  candidate: HarmonicCandidate,
  cmndf: Float32Array,
  samples: Float32Array,
  sampleRate: number,
  minLag: number,
  maxLag: number,
  threshold: number,
  rms: number,
  rankingScore: number | null
): PitchDetectionLocalMinimum {
  const refinedLag = refineYinLag(cmndf, candidate.lag, minLag, maxLag);
  const periodicity = clamp01(1 - candidate.cmndfValue);
  const signalToNoiseEstimate = estimateSignalToNoise(samples, Math.round(refinedLag));
  const thresholdMatched = candidate.cmndfValue < threshold;
  const probability = computePitchProbability({
    periodicity,
    rms,
    signalToNoiseEstimate,
    thresholdMatched
  });

  return {
    lag: candidate.lag,
    frequencyHz: sampleRate / refinedLag,
    cmndfValue: candidate.cmndfValue,
    refinedLag,
    periodicity,
    signalToNoiseEstimate,
    probability,
    thresholdMatched,
    spectrumScore: Number.isFinite(candidate.spectrumScore) ? candidate.spectrumScore : null,
    rankingScore,
    source: candidate.source
  };
}

function selectLagByCandidateRanking(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  cmndf: Float32Array,
  threshold: number,
  fallbackSelection: {
    selectedLag: number;
    thresholdLag: number | null;
  },
  localMinima: PitchDetectionLocalMinimum[]
): number | null {
  if (localMinima.length < 2) {
    return null;
  }

  const candidatePool = buildHarmonicCandidatePool(
    cmndf,
    samples,
    sampleRate,
    minHz,
    maxHz,
    localMinima,
    fallbackSelection.selectedLag
  );
  const fallbackCandidate = candidatePool.find(candidate => candidate.lag === fallbackSelection.selectedLag);

  if (!fallbackCandidate) {
    return null;
  }

  const magnitudeCache = new Map<string, number>();
  for (const candidate of candidatePool) {
    candidate.spectrumScore = computeCandidateSpectrumScore(candidate.frequencyHz, samples, sampleRate, minHz, maxHz, magnitudeCache);
  }

  const spectrumScores = candidatePool.map(candidate => candidate.spectrumScore);
  const spectrumMin = Math.min(...spectrumScores);
  const spectrumMax = Math.max(...spectrumScores);
  const spectrumRange = Math.max(EPSILON, spectrumMax - spectrumMin);

  let bestCandidate = fallbackCandidate;
  let bestScore = scoreLagCandidate(
    fallbackCandidate,
    candidatePool,
    fallbackCandidate,
    fallbackSelection.thresholdLag,
    threshold,
    samples,
    sampleRate,
    magnitudeCache,
    spectrumMin,
    spectrumRange
  );

  for (const candidate of candidatePool) {
    const semitoneDistanceFromFallback = Math.abs(12 * Math.log2(candidate.frequencyHz / fallbackCandidate.frequencyHz));
    const allowLargeJumpPromotion = candidate.frequencyHz >= 250 &&
      hasThirdShadowSupport(candidate, candidatePool, samples, sampleRate, magnitudeCache);
    const allowPromotion = candidate.lag === fallbackCandidate.lag ||
      semitoneDistanceFromFallback <= 3.5 ||
      allowLargeJumpPromotion;

    if (!allowPromotion) {
      continue;
    }

    const score = scoreLagCandidate(
      candidate,
      candidatePool,
      fallbackCandidate,
      fallbackSelection.thresholdLag,
      threshold,
      samples,
      sampleRate,
      magnitudeCache,
      spectrumMin,
      spectrumRange
    );

    if (
      score > bestScore + 0.06 ||
      (candidate.lag !== fallbackCandidate.lag &&
        score > bestScore + 0.035 &&
        candidate.frequencyHz > bestCandidate.frequencyHz * 1.35)
    ) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate.lag === fallbackCandidate.lag ? null : bestCandidate.lag;
}

function buildHarmonicCandidatePool(
  cmndf: Float32Array,
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  localMinima: PitchDetectionLocalMinimum[],
  fallbackLag: number
): HarmonicCandidate[] {
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(cmndf.length - 1, Math.floor(sampleRate / minHz));
  const uniqueCandidates = new Map<number, HarmonicCandidate>();
  const magnitudeCache = new Map<string, number>();

  for (const minimum of localMinima) {
    const refinedLag = refineYinLag(cmndf, minimum.lag, minLag, maxLag);
    const frequencyHz = sampleRate / refinedLag;
    uniqueCandidates.set(minimum.lag, {
      lag: minimum.lag,
      frequencyHz,
      cmndfValue: minimum.cmndfValue,
      spectrumScore: Number.NEGATIVE_INFINITY,
      source: 'local-minimum'
    });
  }

  for (const peak of buildSpectralPeakCandidates(samples, sampleRate, minHz, maxHz, magnitudeCache)) {
    const approximateLag = Math.round(sampleRate / peak.frequencyHz);
    if (approximateLag < minLag || approximateLag > maxLag || uniqueCandidates.has(approximateLag)) {
      continue;
    }

    const refinedLag = refineYinLag(cmndf, approximateLag, minLag, maxLag);
    uniqueCandidates.set(approximateLag, {
      lag: approximateLag,
      frequencyHz: sampleRate / refinedLag,
      cmndfValue: cmndf[approximateLag],
      spectrumScore: Number.NEGATIVE_INFINITY,
      source: 'spectral-peak'
    });
  }

  if (!uniqueCandidates.has(fallbackLag)) {
    const refinedLag = refineYinLag(cmndf, fallbackLag, minLag, maxLag);
    uniqueCandidates.set(fallbackLag, {
      lag: fallbackLag,
      frequencyHz: sampleRate / refinedLag,
      cmndfValue: cmndf[fallbackLag],
      spectrumScore: Number.NEGATIVE_INFINITY,
      source: 'fallback'
    });
  }

  return Array.from(uniqueCandidates.values())
    .filter(candidate => candidate.frequencyHz >= minHz && candidate.frequencyHz <= maxHz)
    .sort((left, right) => left.cmndfValue - right.cmndfValue || left.lag - right.lag);
}

function computeCandidateSpectrumScore(
  candidateFrequencyHz: number,
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  magnitudeCache: Map<string, number>
): number {
  const fundamental = getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz, magnitudeCache);
  const second = candidateFrequencyHz * 2 <= maxHz * 2.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 2, magnitudeCache)
    : 0;
  const third = candidateFrequencyHz * 3 <= maxHz * 3.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 3, magnitudeCache)
    : 0;
  const fourth = candidateFrequencyHz * 4 <= maxHz * 4.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 4, magnitudeCache)
    : 0;
  const lowerOctave = candidateFrequencyHz / 2 >= minHz * 0.5
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz / 2, magnitudeCache)
    : 0;
  const lowerTwelfth = candidateFrequencyHz / 3 >= minHz * 0.4
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz / 3, magnitudeCache)
    : 0;

  const harmonicSupport = fundamental * 1.85 + second * 0.92 + third * 0.58 + fourth * 0.36;
  const missingFundamentalPenalty = Math.max(
    0,
    Math.max(second * 0.95, third * 1.15, fourth * 1.3) - fundamental
  ) * 0.9;
  const subharmonicPenalty = lowerOctave * 0.58 + lowerTwelfth * 0.34;

  return harmonicSupport - missingFundamentalPenalty - subharmonicPenalty;
}

function buildSpectralPeakCandidates(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  magnitudeCache: Map<string, number>
): SpectralPeakCandidate[] {
  const startQuarterMidi = Math.ceil(frequencyToMidiFloat(minHz) * SPECTRAL_GRID_DIVISIONS_PER_SEMITONE);
  const endQuarterMidi = Math.floor(frequencyToMidiFloat(maxHz) * SPECTRAL_GRID_DIVISIONS_PER_SEMITONE);
  const grid: SpectralPeakCandidate[] = [];

  for (let midiStep = startQuarterMidi; midiStep <= endQuarterMidi; midiStep++) {
    const frequencyHz = midiToFrequency(midiStep / SPECTRAL_GRID_DIVISIONS_PER_SEMITONE);
    grid.push({
      frequencyHz,
      score: computeSpectralPeakScore(frequencyHz, samples, sampleRate, minHz, maxHz, magnitudeCache)
    });
  }

  const peaks: SpectralPeakCandidate[] = [];
  for (let index = 1; index < grid.length - 1; index++) {
    const previous = grid[index - 1];
    const current = grid[index];
    const next = grid[index + 1];

    if (current.score < previous.score || current.score < next.score) {
      continue;
    }

    peaks.push(current);
  }

  peaks.sort((left, right) => right.score - left.score || left.frequencyHz - right.frequencyHz);
  return peaks.slice(0, MAX_SPECTRAL_PEAK_CANDIDATES);
}

function computeSpectralPeakScore(
  candidateFrequencyHz: number,
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  magnitudeCache: Map<string, number>
): number {
  const fundamental = getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz, magnitudeCache);
  const second = candidateFrequencyHz * 2 <= maxHz * 2.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 2, magnitudeCache)
    : 0;
  const third = candidateFrequencyHz * 3 <= maxHz * 3.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 3, magnitudeCache)
    : 0;
  const fourth = candidateFrequencyHz * 4 <= maxHz * 4.1
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz * 4, magnitudeCache)
    : 0;
  const lowerOctave = candidateFrequencyHz / 2 >= minHz * 0.5
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz / 2, magnitudeCache)
    : 0;
  const lowerTwelfth = candidateFrequencyHz / 3 >= minHz * 0.4
    ? getFrequencyMagnitude(samples, sampleRate, candidateFrequencyHz / 3, magnitudeCache)
    : 0;

  const harmonicProduct = Math.cbrt((fundamental + EPSILON) * (second + EPSILON) * (third + EPSILON));
  const harmonicSupport = fundamental * 1.6 + second * 0.78 + third * 0.48 + fourth * 0.24;
  const missingFundamentalPenalty = Math.max(0, Math.max(second * 0.9, third * 1.05) - fundamental) * 0.55;
  const subharmonicPenalty = lowerOctave * 0.72 + lowerTwelfth * 0.94;

  return harmonicSupport + harmonicProduct * 1.9 - missingFundamentalPenalty - subharmonicPenalty;
}

function scoreLagCandidate(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  fallbackCandidate: HarmonicCandidate,
  thresholdLag: number | null,
  threshold: number,
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>,
  spectrumMin: number,
  spectrumRange: number
): number {
  const cmndfQuality = clamp01(1 - candidate.cmndfValue);
  const spectrumQuality = clamp01((candidate.spectrumScore - spectrumMin) / spectrumRange);
  const thresholdBonus = candidate.cmndfValue < threshold ? 0.03 : 0;
  const fallbackBonus = candidate.lag === fallbackCandidate.lag ? 0.015 : 0;
  const thresholdLagBonus = thresholdLag !== null && candidate.lag === thresholdLag ? 0.02 : 0;
  const shadowAdjustment = computeCandidateShadowAdjustment(
    candidate,
    candidatePool,
    samples,
    sampleRate,
    magnitudeCache
  );

  return cmndfQuality * 0.58 +
    spectrumQuality * 0.22 +
    thresholdBonus +
    thresholdLagBonus +
    fallbackBonus +
    shadowAdjustment;
}

function computeCandidateShadowAdjustment(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>
): number {
  let adjustment = 0;

  if (hasThirdShadowSupport(candidate, candidatePool, samples, sampleRate, magnitudeCache)) {
    adjustment += 0.13;
  }

  if (hasHalfShadowSupport(candidate, candidatePool, samples, sampleRate, magnitudeCache)) {
    adjustment += 0.04;
  }

  if (hasUpperStringShadowLadderSupport(candidate, candidatePool, samples, sampleRate, magnitudeCache)) {
    adjustment += 0.14;
  }

  if (isLikelyThirdSubharmonicShadow(candidate, candidatePool, samples, sampleRate, magnitudeCache)) {
    adjustment -= 0.18;
  }

  if (isLikelyUpperStringSubharmonicShadow(candidate, candidatePool, samples, sampleRate, magnitudeCache)) {
    adjustment -= 0.16;
  }

  return adjustment;
}

function hasThirdShadowSupport(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>,
): boolean {
  const lowerCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz / 3, candidate.lag);
  if (!lowerCandidate) {
    return false;
  }

  const candidateFundamental = getFrequencyMagnitude(samples, sampleRate, candidate.frequencyHz, magnitudeCache);
  const lowerFundamental = getFrequencyMagnitude(samples, sampleRate, lowerCandidate.frequencyHz, magnitudeCache);
  const comparableCmndf = candidate.cmndfValue <= lowerCandidate.cmndfValue + 0.17;
  const strongerFundamental = candidateFundamental > lowerFundamental * 1.02;
  const strongerSpectrum = candidate.spectrumScore > lowerCandidate.spectrumScore + 0.0001;

  return comparableCmndf && strongerFundamental && strongerSpectrum;
}

function hasHalfShadowSupport(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>,
): boolean {
  const lowerCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz / 2, candidate.lag);
  if (!lowerCandidate) {
    return false;
  }

  const candidateFundamental = getFrequencyMagnitude(samples, sampleRate, candidate.frequencyHz, magnitudeCache);
  const lowerFundamental = getFrequencyMagnitude(samples, sampleRate, lowerCandidate.frequencyHz, magnitudeCache);
  const comparableCmndf = candidate.cmndfValue <= lowerCandidate.cmndfValue + 0.09;
  const strongerFundamental = candidateFundamental > lowerFundamental * 1.05;
  const strongerSpectrum = candidate.spectrumScore > lowerCandidate.spectrumScore + 0.0002;

  return comparableCmndf && strongerFundamental && strongerSpectrum;
}

function hasUpperStringShadowLadderSupport(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>
): boolean {
  if (candidate.frequencyHz < 280) {
    return false;
  }

  const lowerHalfCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz / 2, candidate.lag);
  const lowerThirdCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz / 3, candidate.lag);
  if (!lowerHalfCandidate || !lowerThirdCandidate) {
    return false;
  }

  const candidateFundamental = getFrequencyMagnitude(samples, sampleRate, candidate.frequencyHz, magnitudeCache);
  const lowerHalfFundamental = getFrequencyMagnitude(samples, sampleRate, lowerHalfCandidate.frequencyHz, magnitudeCache);
  const lowerThirdFundamental = getFrequencyMagnitude(samples, sampleRate, lowerThirdCandidate.frequencyHz, magnitudeCache);
  const comparableToHalf = candidate.cmndfValue <= lowerHalfCandidate.cmndfValue + 0.1;
  const comparableToThird = candidate.cmndfValue <= lowerThirdCandidate.cmndfValue + 0.18;
  const strongerFundamental = candidateFundamental > lowerHalfFundamental * 1.03 &&
    candidateFundamental > lowerThirdFundamental * 1.06;
  const strongerSpectrum = candidate.spectrumScore > lowerHalfCandidate.spectrumScore + 0.0002 &&
    candidate.spectrumScore > lowerThirdCandidate.spectrumScore + 0.0002;

  return comparableToHalf && comparableToThird && strongerFundamental && strongerSpectrum;
}

function isLikelyThirdSubharmonicShadow(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>
): boolean {
  const higherCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz * 3, candidate.lag);
  if (!higherCandidate) {
    return false;
  }

  const candidateFundamental = getFrequencyMagnitude(samples, sampleRate, candidate.frequencyHz, magnitudeCache);
  const higherFundamental = getFrequencyMagnitude(samples, sampleRate, higherCandidate.frequencyHz, magnitudeCache);
  const comparableCmndf = higherCandidate.cmndfValue <= candidate.cmndfValue + 0.17;
  const strongerFundamental = higherFundamental > candidateFundamental * 1.03;
  const strongerSpectrum = higherCandidate.spectrumScore > candidate.spectrumScore + 0.0002;

  return comparableCmndf && strongerFundamental && strongerSpectrum;
}

function isLikelyUpperStringSubharmonicShadow(
  candidate: HarmonicCandidate,
  candidatePool: HarmonicCandidate[],
  samples: Float32Array,
  sampleRate: number,
  magnitudeCache: Map<string, number>
): boolean {
  if (candidate.frequencyHz > 150) {
    return false;
  }

  const higherCandidate = findCandidateNearFrequency(candidatePool, candidate.frequencyHz * 3, candidate.lag);
  if (!higherCandidate || higherCandidate.frequencyHz < 280) {
    return false;
  }

  const middleCandidate = findCandidateNearFrequency(candidatePool, higherCandidate.frequencyHz / 2, candidate.lag);
  if (!middleCandidate) {
    return false;
  }

  const candidateFundamental = getFrequencyMagnitude(samples, sampleRate, candidate.frequencyHz, magnitudeCache);
  const higherFundamental = getFrequencyMagnitude(samples, sampleRate, higherCandidate.frequencyHz, magnitudeCache);
  const middleFundamental = getFrequencyMagnitude(samples, sampleRate, middleCandidate.frequencyHz, magnitudeCache);
  const comparableCmndf = higherCandidate.cmndfValue <= candidate.cmndfValue + 0.18;
  const strongerFundamental = higherFundamental > candidateFundamental * 1.08 &&
    middleFundamental > candidateFundamental * 0.88;
  const strongerSpectrum = higherCandidate.spectrumScore > candidate.spectrumScore + 0.0003 &&
    middleCandidate.spectrumScore > candidate.spectrumScore + 0.0001;

  return comparableCmndf && strongerFundamental && strongerSpectrum;
}

function findCandidateNearFrequency(
  candidates: HarmonicCandidate[],
  targetFrequencyHz: number,
  excludingLag: number
): HarmonicCandidate | null {
  let bestCandidate: HarmonicCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.lag === excludingLag) {
      continue;
    }

    const semitoneDistance = Math.abs(12 * Math.log2(candidate.frequencyHz / targetFrequencyHz));
    if (semitoneDistance > 0.8) {
      continue;
    }

    if (semitoneDistance < bestDistance) {
      bestCandidate = candidate;
      bestDistance = semitoneDistance;
    }
  }

  return bestCandidate;
}

function getFrequencyMagnitude(
  samples: Float32Array,
  sampleRate: number,
  frequencyHz: number,
  cache: Map<string, number>
): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz >= sampleRate * 0.5) {
    return 0;
  }

  const cacheKey = frequencyHz.toFixed(3);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;

  for (let index = 0; index < samples.length; index++) {
    const current = samples[index] + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }

  const power = previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious;
  const magnitude = Math.sqrt(Math.max(0, power)) / samples.length;
  cache.set(cacheKey, magnitude);
  return magnitude;
}

function createEmptyDetection(rms: number): DetectedPitch {
  return {
    frequencyHz: null,
    clarity: 0,
    probability: 0,
    periodicity: 0,
    rms,
    signalToNoiseEstimate: -24,
    hasPitch: false,
    candidates: []
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
