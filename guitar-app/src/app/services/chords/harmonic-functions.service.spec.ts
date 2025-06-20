import { HarmonicFunctionsService, Degree, HarmonicFunction } from 'app/services/chords/harmonic-functions.service';
import { Semitone, SEMITONES } from 'app/common/semitones';
import { Chord, chordToString } from 'app/common/chords';
import { Modifier } from 'app/common/modifiers';

describe('HarmonicFunctionsService', () => {
  let service: HarmonicFunctionsService;

  let asChord = (note: Semitone, modifier?: Modifier): Chord => {
    return { root: note, modifiers: (modifier) ? [modifier]: [] }
  }
  beforeEach(() => {
    service = new HarmonicFunctionsService();
  });

  it('should have data for all semitones', () => {
    for (const semitone of SEMITONES) {
      const mapMajor = service.getChordsInKeyOf(asChord(semitone));
      const mapMinor = service.getChordsInKeyOf(asChord(semitone, 'm'));

      console.log(semitone + ' major', mapMajor);
      console.log(semitone + ' minor', mapMinor);
    }
  });

  it('should return 7 degrees for C major', () => {
    const map = service.getChordsInKeyOf(asChord('C'));
    expect(map.size).toBe(7);
    expect(map.get('I')).toEqual({ root: 'C', modifiers: [] });
    expect(map.get('ii')).toEqual({ root: 'D', modifiers: ['m'] });
    expect(map.get('iii')).toEqual({ root: 'E', modifiers: ['m'] });
    expect(map.get('IV')).toEqual({ root: 'F', modifiers: [] });
    expect(map.get('V')).toEqual({ root: 'G', modifiers: [] });
    expect(map.get('vi')).toEqual({ root: 'A', modifiers: ['m'] });
    expect(map.get('vii°')).toEqual({ root: 'B', modifiers: ['dim'] });
  });

  it('should return 7 degrees for C minor', () => {
    const map = service.getChordsInKeyOf(asChord('C', 'm'));
    expect(map.size).toBe(7);
    expect(map.get('i')).toEqual({ root: 'C', modifiers: ['m'] });
    expect(map.get('ii°')).toEqual({ root: 'D', modifiers: ['dim'] });
    expect(map.get('III')).toEqual({ root: 'D#', modifiers: [] });
    expect(map.get('iv')).toEqual({ root: 'F', modifiers: ['m'] });
    expect(map.get('v')).toEqual({ root: 'G', modifiers: ['m'] });
    expect(map.get('VI')).toEqual({ root: 'G#', modifiers: [] });
    expect(map.get('VII')).toEqual({ root: 'A#', modifiers: [] });
  });

  it('should return v as minor by default and as 7th if useV7forMinor is true', () => {
    // Default: minor v
    let map = service.getChordsInKeyOf(asChord('A', 'm'));
    expect(map.get('v')).toEqual({ root: 'E', modifiers: ['m'] });

    // Set to use V7
    service.useV7forMinor = true;
    map = service.getChordsInKeyOf(asChord('A', 'm'));
    expect(map.get('v')).toEqual({ root: 'E', modifiers: ['7'] });
  });

  it('should throw if key does not exist', () => {
    expect(() => service.getChordsInKeyOf(asChord('H' as Semitone))).toThrow();
  });

  it('should find all keys and degrees containing a given chord', () => {
    // C major chord
    const chord: Chord = { root: 'C', modifiers: [] };
    const results = service.find(chord);

    expect(results.some(r => chordToString(r.tonic) === 'C' && r.degree === 'I')).toBe(true);
    expect(results.some(r => chordToString(r.tonic) === 'Em' && r.degree === 'VI')).toBe(true);
  });

  it('should label harmonic functions correctly', () => {
    const chord: Chord = { root: 'E', modifiers: [] };
    const results = service.find(chord);
    for (const r of results) {
      expect(['Tonic', 'Predominant', 'Dominant']).toContain(r.function);
    }
  });
});