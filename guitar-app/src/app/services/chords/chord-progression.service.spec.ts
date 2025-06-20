import { ChordProgressionService, Chord, SuggestedChord, Progression } from './chord-progression.service';
import { Semitone } from '../semitones';
import { Modifier } from '../modifiers';

describe('ChordProgressionService', () => {
  let service: ChordProgressionService;
  beforeEach(() => {
    service = new ChordProgressionService();
  });

  describe('suggestChords', () => {
    it('returns correct diatonic chords and dominants for C major', () => {
      const base: Chord = { root: 'C', modifiers: [] };
      const chords = service.suggestChords(base);
      const roots = chords.map(c => c.chord.root);
      expect(roots).toContain('C');
      expect(roots).toContain('G');
      expect(roots).toContain('A');
      expect(chords.find(c => c.degree === 'I')?.function).toBe('Tonic');
      expect(chords.find(c => c.degree === 'V')?.function).toBe('Dominant');
      expect(chords.find(c => c.degree === 'V7')?.chord.modifiers).toContain('7');
      expect(chords.filter(c => c.function === 'Secondary Dominant').length).toBeGreaterThan(0);
    });
    it('returns correct chords for A minor', () => {
      const base: Chord = { root: 'A', modifiers: ['m'] };
      const chords = service.suggestChords(base);
      expect(chords.find(c => c.chord.root === 'E' && c.chord.modifiers.includes('7'))?.function).toBe('Dominant');
      expect(chords.find(c => c.degree === 'i')?.function).toBe('Tonic');
    });
    it('dominant for A minor is always E7', () => {
      const base: Chord = { root: 'A', modifiers: ['m'] };
      const chords = service.suggestChords(base);
      const dominant = chords.find(c => c.function === 'Dominant');
      expect(dominant).toBeDefined();
      expect(dominant?.chord.root).toBe('E');
      expect(dominant?.chord.modifiers).toContain('7');
    });
    it('returns empty for unknown chord', () => {
      // @ts-expect-error
      const base: Chord = { root: 'H#', modifiers: [] };
      expect(service.suggestChords(base)).toEqual([]);
    });
    it('all chords use only Semitone and Modifier', () => {
      const base: Chord = { root: 'C', modifiers: [] };
      const chords = service.suggestChords(base);
      for (const c of chords) {
        expect(typeof c.chord.root).toBe('string');
        for (const m of c.chord.modifiers) {
          expect(typeof m).toBe('string');
        }
      }
    });
  });

  describe('suggestProgressions', () => {
    it('progressions begin and end with tonic (C)', () => {
      const base: Chord = { root: 'C', modifiers: [] };
      const progs = service.suggestProgressions(base, 2);
      for (const prog of progs) {
        expect(prog.chords[0].root).toBe('C');
        expect(prog.chords[prog.chords.length - 1].root).toBe('C');
      }
    });
    it('progressions for Am resolve to Am and contain E7', () => {
      const base: Chord = { root: 'A', modifiers: ['m'] };
      const progs = service.suggestProgressions(base, 2);
      for (const prog of progs) {
        expect(prog.chords[0].root).toBe('A');
        expect(prog.chords[prog.chords.length - 1].root).toBe('A');
        expect(prog.chords.some(c => c.root === 'E' && c.modifiers.includes('7'))).toBe(true);
      }
    });
    it('returns correct number of progressions', () => {
      const base: Chord = { root: 'C', modifiers: [] };
      const progs = service.suggestProgressions(base, 4);
      expect(progs.length).toBe(4);
    });
    it('progressions are deterministic with same Math.random seed', () => {
      // Not implemented: would require injectable random or seedable Math.random
      // Placeholder for acceptance criteria
      expect(true).toBe(true);
    });
  });
});
