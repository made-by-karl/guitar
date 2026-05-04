import {
  buildTrackingPitchCandidates,
  scoreTrackingPitchCandidate
} from '@/app/features/tuner/services/tuner-tracking-candidates';

describe('tuner tracking candidates', () => {
  it('builds half, base, and octave candidates within bounds', () => {
    expect(buildTrackingPitchCandidates(220, { minHz: 70, maxHz: 700 })).toEqual([110, 220, 440]);
    expect(buildTrackingPitchCandidates(80, { minHz: 70, maxHz: 140 })).toEqual([80]);
  });

  it('scores closer candidates above distant octave jumps when quality matches', () => {
    const closeScore = scoreTrackingPitchCandidate(220, 220.4, 0.7, 0.8);
    const jumpScore = scoreTrackingPitchCandidate(440, 220.4, 0.7, 0.8);

    expect(closeScore).toBeGreaterThan(jumpScore);
  });
});
