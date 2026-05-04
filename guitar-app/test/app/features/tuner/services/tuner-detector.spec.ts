import { detectPitchFromSamples } from '@/app/features/tuner/services/tuner-detector';

describe('tuner detector', () => {
  const sampleRate = 48_000;
  const frameLength = 4096;

  it.each([
    ['low E', 82.41],
    ['A string', 110],
    ['D string', 146.83],
    ['G string', 196],
    ['B string', 246.94],
    ['high E', 329.63]
  ])('detects %s fundamentals across the guitar range', (_label, frequencyHz) => {
    const samples = createSignal(frequencyHz);
    const detected = detectPitchFromSamples(samples, sampleRate, { minHz: 70, maxHz: 700 });

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(detected!.frequencyHz).not.toBeNull();
    expect(Math.abs(detected!.frequencyHz! - frequencyHz)).toBeLessThan(1.2);
    expect(detected!.probability).toBeGreaterThan(0.6);
  });

  it('keeps pitch detection on a quiet pluck-like sine input', () => {
    const detected = detectPitchFromSamples(createSignal(329.63, { amplitude: 0.026 }), sampleRate, {
      minHz: 70,
      maxHz: 700
    });

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(Math.abs(detected!.frequencyHz! - 329.63)).toBeLessThan(0.5);
    expect(detected!.rms).toBeGreaterThan(0);
    expect(detected!.probability).toBeGreaterThan(0.45);
  });

  it('prefers high E over its A2 subharmonic on a bright attack-shaped waveform', () => {
    const detected = detectPitchFromSamples(
      createAttackSignal(329.63, {
        amplitude: 0.14,
        harmonicAmplitudes: [0.18, 0.34, 1, 0.42]
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(detected!.frequencyHz).not.toBeNull();
    expect(Math.abs(detected!.frequencyHz! - 329.63)).toBeLessThan(2.5);
  });

  it('promotes a high-E candidate when the attack produces a 110/165/330 shadow ladder', () => {
    const detected = detectPitchFromSamples(
      createAttackSignal(329.63, {
        amplitude: 0.14,
        harmonicAmplitudes: [0.08, 0.2, 1, 0.24]
      }),
      sampleRate,
      { minHz: 70, maxHz: 700, debug: true }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(detected!.frequencyHz).not.toBeNull();
    expect(Math.abs(detected!.frequencyHz! - 329.63)).toBeLessThan(3.2);
    expect(detected!.debug!.topLocalMinima.some(minimum => Math.abs(minimum.frequencyHz - 110) < 3)).toBe(true);
    expect(detected!.debug!.topLocalMinima.some(minimum => Math.abs(minimum.frequencyHz - 330) < 8)).toBe(true);
    expect(detected!.debug!.topRankedCandidates[0].frequencyHz).toBeGreaterThan(300);
  });

  it('exports ranked runtime candidates for startup arbitration in shadow-ladder cases', () => {
    const detected = detectPitchFromSamples(
      createAttackSignal(329.63, {
        amplitude: 0.14,
        harmonicAmplitudes: [0.08, 0.2, 1, 0.24]
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.candidates.length).toBeGreaterThan(1);
    expect(detected!.candidates.length).toBeLessThanOrEqual(4);
    expect(detected!.candidates[0].rankingScore).toBeGreaterThanOrEqual(detected!.candidates[1].rankingScore);
    expect(detected!.candidates.some(candidate => candidate.frequencyHz > 300)).toBe(true);
    expect(detected!.candidates.every(candidate => Number.isFinite(candidate.signalToNoiseEstimate))).toBe(true);
  });

  it('keeps the upper-string candidate competitive in the runtime export for bright shadow ladders', () => {
    const detected = detectPitchFromSamples(
      createAttackSignal(349.23, {
        amplitude: 0.135,
        harmonicAmplitudes: [0.09, 0.2, 1, 0.22]
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.candidates[0].frequencyHz).toBeGreaterThan(320);
    expect(detected!.candidates[0].rankingScore).toBeGreaterThanOrEqual(detected!.candidates.at(-1)!.rankingScore);
    expect(detected!.candidates[0].probability).toBeGreaterThan(0.5);
    expect(detected!.candidates[0].periodicity).toBeGreaterThan(0.7);
  });

  it('exposes lag-selection debug metadata when requested', () => {
    const detected = detectPitchFromSamples(
      createAttackSignal(329.63, {
        amplitude: 0.14,
        harmonicAmplitudes: [0.18, 0.34, 1, 0.42]
      }),
      sampleRate,
      { minHz: 70, maxHz: 700, debug: true }
    );

    expect(detected).not.toBeNull();
    expect(detected!.debug).toBeDefined();
    expect(detected!.debug!.selectedLag).toBeGreaterThanOrEqual(detected!.debug!.minLag);
    expect(detected!.debug!.selectedLag).toBeLessThanOrEqual(detected!.debug!.maxLag);
    expect(detected!.debug!.topLocalMinima.length).toBeGreaterThan(0);
    expect(detected!.debug!.topLocalMinima.length).toBeLessThanOrEqual(5);
    expect(detected!.debug!.topLocalMinima[0].probability).toBeDefined();
    expect(detected!.debug!.topRankedCandidates.length).toBeGreaterThan(0);
    expect(detected!.debug!.topRankedCandidates[0].probability).toBeDefined();
  });

  it('prefers the guitar fundamental on a bright harmonic-rich waveform', () => {
    const detected = detectPitchFromSamples(
      createSignal(196, {
        harmonicAmplitudes: [1, 0.82, 0.55, 0.32],
        amplitude: 0.4
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(Math.abs(detected!.frequencyHz! - 196)).toBeLessThan(0.6);
    expect(detected!.periodicity).toBeGreaterThan(0.7);
  });

  it('stays anchored to the lower candidate when octave energy dominates', () => {
    const detected = detectPitchFromSamples(
      createSignal(110, {
        harmonicAmplitudes: [0.28, 1, 0.22],
        amplitude: 0.42
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(Math.abs(detected!.frequencyHz! - 110)).toBeLessThan(1.2);
  });

  it('does not promote a high harmonic over a real A2 fundamental', () => {
    const detected = detectPitchFromSamples(
      createSignal(110, {
        harmonicAmplitudes: [1, 0.78, 0.42, 0.18],
        amplitude: 0.4
      }),
      sampleRate,
      { minHz: 70, maxHz: 700, debug: true }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(Math.abs(detected!.frequencyHz! - 110)).toBeLessThan(1.2);
    expect(detected!.debug!.topRankedCandidates[0].frequencyHz).toBeLessThan(140);
  });

  it('does not fabricate a misleading 3x startup partner for a real A2 fundamental', () => {
    const detected = detectPitchFromSamples(
      createSignal(110, {
        harmonicAmplitudes: [1, 0.78, 0.42, 0.18],
        amplitude: 0.4
      }),
      sampleRate,
      { minHz: 70, maxHz: 700 }
    );

    expect(detected).not.toBeNull();
    expect(detected!.hasPitch).toBe(true);
    expect(detected!.candidates[0].frequencyHz).toBeLessThan(140);
    expect(
      detected!.candidates.some(candidate => candidate.frequencyHz > 300 && candidate.rankingScore >= 0.52)
    ).toBe(false);
  });

  it('treats silence and low background noise as no pitch', () => {
    const silence = detectPitchFromSamples(new Float32Array(frameLength), sampleRate, { minHz: 70, maxHz: 700 });
    const backgroundNoise = detectPitchFromSamples(createNoise(0.0002), sampleRate, { minHz: 70, maxHz: 700 });

    expect(silence).not.toBeNull();
    expect(silence!.hasPitch).toBe(false);
    expect(silence!.frequencyHz).toBeNull();

    expect(backgroundNoise).not.toBeNull();
    expect(backgroundNoise!.hasPitch).toBe(false);
    expect(backgroundNoise!.frequencyHz).toBeNull();
  });

  function createSignal(
    frequencyHz: number,
    options: {
      amplitude?: number;
      harmonicAmplitudes?: number[];
    } = {}
  ): Float32Array {
    const amplitude = options.amplitude ?? 0.32;
    const harmonicAmplitudes = options.harmonicAmplitudes ?? [1];
    const samples = new Float32Array(frameLength);

    for (let index = 0; index < frameLength; index++) {
      let value = 0;

      for (let harmonicIndex = 0; harmonicIndex < harmonicAmplitudes.length; harmonicIndex++) {
        const harmonicAmplitude = harmonicAmplitudes[harmonicIndex];
        const harmonicNumber = harmonicIndex + 1;
        value += harmonicAmplitude * Math.sin((2 * Math.PI * frequencyHz * harmonicNumber * index) / sampleRate);
      }

      samples[index] = value * amplitude;
    }

    return samples;
  }

  function createAttackSignal(
    frequencyHz: number,
    options: {
      amplitude?: number;
      harmonicAmplitudes?: number[];
    } = {}
  ): Float32Array {
    const amplitude = options.amplitude ?? 0.14;
    const harmonicAmplitudes = options.harmonicAmplitudes ?? [1];
    const samples = new Float32Array(frameLength);

    for (let index = 0; index < frameLength; index++) {
      const progress = index / Math.max(1, frameLength - 1);
      const envelope = Math.exp(-progress * 3.4) * 0.68 + Math.exp(-progress * 13) * 0.32;
      let value = 0;

      for (let harmonicIndex = 0; harmonicIndex < harmonicAmplitudes.length; harmonicIndex++) {
        const harmonicAmplitude = harmonicAmplitudes[harmonicIndex];
        const harmonicNumber = harmonicIndex + 1;
        value += harmonicAmplitude * Math.sin((2 * Math.PI * frequencyHz * harmonicNumber * index) / sampleRate);
      }

      samples[index] = value * amplitude * envelope;
    }

    return samples;
  }

  function createNoise(amplitude: number): Float32Array {
    const samples = new Float32Array(frameLength);
    let seed = 7331;

    for (let index = 0; index < frameLength; index++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      samples[index] = (((seed / 0xffffffff) * 2) - 1) * amplitude;
    }

    return samples;
  }
});
