import { buildMetronomeLabels, isMainBeatLabel } from './metronome-labels';

describe('metronome-labels', () => {
  it('builds 4/4 labels without sub-beats', () => {
    expect(buildMetronomeLabels('4/4', false)).toEqual(['1', '2', '3', '4']);
  });

  it('builds 4/4 labels with sub-beats (eighths)', () => {
    expect(buildMetronomeLabels('4/4', true)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
  });

  it('builds n/8 labels without sub-beats (eighths)', () => {
    expect(buildMetronomeLabels('6/8', false)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('builds n/8 labels with sub-beats (sixteenths => e)', () => {
    expect(buildMetronomeLabels('6/8', true)).toEqual(['1', 'e', '2', 'e', '3', 'e', '4', 'e', '5', 'e', '6', 'e']);
  });

  it('detects main beats', () => {
    expect(isMainBeatLabel('1')).toBe(true);
    expect(isMainBeatLabel('10')).toBe(true);
    expect(isMainBeatLabel('&')).toBe(false);
    expect(isMainBeatLabel('e')).toBe(false);
  });
});
