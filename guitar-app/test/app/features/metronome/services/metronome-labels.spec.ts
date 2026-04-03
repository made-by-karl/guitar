import {
  buildMetronomeLabels,
  isMainBeatLabel,
  normalizeSubdivision
} from '@/app/features/metronome/services/metronome-labels';

describe('metronome-labels', () => {
  it('builds 4/4 labels without subdivisions', () => {
    expect(buildMetronomeLabels('4/4', 'none')).toEqual(['1', '2', '3', '4']);
  });

  it('builds 4/4 labels with eighth-note subdivisions', () => {
    expect(buildMetronomeLabels('4/4', '8th')).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
  });

  it('builds 4/4 labels with sixteenth-note subdivisions', () => {
    expect(buildMetronomeLabels('4/4', '16th')).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a']);
  });

  it('builds n/8 labels without subdivisions', () => {
    expect(buildMetronomeLabels('6/8', 'none')).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('builds n/8 labels with sixteenth-note subdivisions', () => {
    expect(buildMetronomeLabels('6/8', '16th')).toEqual(['1', 'e', '2', 'e', '3', 'e', '4', 'e', '5', 'e', '6', 'e']);
  });

  it('normalizes unsupported subdivisions by time signature', () => {
    expect(normalizeSubdivision('6/8', '8th')).toBe('none');
    expect(normalizeSubdivision('4/4', '16th')).toBe('16th');
  });

  it('detects main beats', () => {
    expect(isMainBeatLabel('1')).toBe(true);
    expect(isMainBeatLabel('10')).toBe(true);
    expect(isMainBeatLabel('&')).toBe(false);
    expect(isMainBeatLabel('e')).toBe(false);
  });
});
