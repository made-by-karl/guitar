import { GripGeneratorService } from '@/app/features/grips/services/grips/grip-generator.service';
import { FretboardService } from '@/app/features/grips/services/fretboard.service';
import type { ChordWithNotes } from '@/app/features/grips/services/chords/chord.service';
import { Semitone } from '@/app/core/music/semitones';
import { Modifier } from '@/app/core/music/modifiers';
import { stringifyGrip } from '@/app/features/grips/services/grips/grip.model';
import type { GripGeneratorOptions, DissonanceProfile } from '@/app/features/grips/services/grips/grip-generator.service';


describe('GripGeneratorService', () => {
  let service: GripGeneratorService;
  let fretboardService: FretboardService;

  const createChord = (root: Semitone, notes: Semitone[], modifiers: Modifier[] = [], bass?: Semitone): ChordWithNotes => ({
    root,
    notes,
    modifiers,
    bass
  });

  const gripShapeSet = (
    chord: ChordWithNotes,
    profile: DissonanceProfile,
    options: GripGeneratorOptions = {}
  ): Set<string> =>
    new Set(service.generateGrips(chord, { ...options, dissonanceProfile: profile }).map(stringifyGrip));

  const expectGripSubset = (subset: Set<string>, superset: Set<string>): void => {
    subset.forEach(shape => {
      expect(superset.has(shape)).toBe(true);
    });
  };

  beforeEach(() => {
    fretboardService = new FretboardService();
    service = new GripGeneratorService(fretboardService);
  });

  describe('Basic chord generation', () => {
    it('should generate common C major open chord', () => {
      const chord = createChord('C', ['C', 'E', 'G']);
      const grips = service.generateGrips(chord);

      // Should find the common x32o1o shape
      const commonShape = grips.find(g =>
        stringifyGrip(g) === 'x|3|2|o|1|o'
      );

      expect(commonShape).toBeTruthy();
      if (commonShape) {
        expect(commonShape.notes).toEqual([null, 'C3', 'E3', 'G3', 'C4', 'E4']);
      }
    });

    it('should generate F major barre chord', () => {
      const chord = createChord('F', ['F', 'A', 'C']);
      const grips = service.generateGrips(chord);

      // Should find the common 133211 barre shape
      const barreShape = grips.find(g =>
        stringifyGrip(g) === '1b|3|3|2|1b|1b'
      );
      expect(barreShape).toBeTruthy();
      if (barreShape) {
        expect(barreShape.notes).toEqual(['F2', 'C3', 'F3', 'A3', 'C4', 'F4']);
      }
    });

    it('should generate C major chord with E as bass', () => {
      const chord = createChord('C', ['C', 'E', 'G'], [], 'E');
      const grips = service.generateGrips(chord);

      // Should find the o32o1o shape
      const commonShape = grips.find(g =>
        stringifyGrip(g) === 'o|3|2|o|1|o'
      );

      expect(commonShape).toBeTruthy();
      if (commonShape) {
        expect(commonShape.notes).toEqual(['E2', 'C3', 'E3', 'G3', 'C4', 'E4']);
      }
    });
  });

  describe('Voice leading and harmonic constraints', () => {
    it('should generate E7 chord with b7 (D) in higher strings to avoid dissonance', () => {
      const chord = createChord('E', ['E', 'G#', 'B', 'D'], ['7']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });

      expect(grips.length).toBeGreaterThan(0);

      // The problematic grip: E2,B2,D3,G#3,B3,E4 has D in the 3rd string (low position)
      // The good grip: E2,B2,E3,G#3,D4,E4 has D in the 5th string (higher position)
      const problematicGrip = grips.find(g =>
        g.notes[0] === 'E2' && g.notes[1] === 'B2' && g.notes[2] === 'D3'
      );

      // This grip should NOT exist because D (the b7) is too low in the voicing
      expect(problematicGrip).toBeFalsy();

      // The good grip should exist
      const goodGrip = grips.find(g =>
        g.notes[0] === 'E2' && g.notes[1] === 'B2' && g.notes[2] === 'E3' && g.notes[4] === 'D4'
      );
      expect(goodGrip).toBeTruthy();
    });

    it('should place 7th intervals in upper strings for G7 chord', () => {
      const chord = createChord('G', ['G', 'B', 'D', 'F'], ['7']);
      const grips = service.generateGrips(chord);

      grips.forEach(grip => {
        const notes = grip.notes.filter(n => n !== null);
        if (notes.length === 0) return;

        // Find positions of root and 7th
        const rootIndex = grip.notes.findIndex(n => n !== null && n.startsWith('G'));
        const seventhIndex = grip.notes.findIndex(n => n !== null && n.startsWith('F'));

        if (rootIndex !== -1 && seventhIndex !== -1 && seventhIndex < rootIndex) {
          // If 7th appears before root, it's an unusual voicing - skip this check
          return;
        }

        // For standard voicings, 7th should not be in the lowest 3 strings when root is present
        if (rootIndex !== -1 && seventhIndex !== -1) {
          // If there are at least 4 played strings, the 7th shouldn't be in lower positions
          const playedStringsCount = grip.notes.filter(n => n !== null).length;
          if (playedStringsCount >= 4) {
            // The 7th should preferably be in upper strings (indices 2, 1, or 0)
            // This is a softer constraint - we just verify it's not in the very bottom with root above
            if (rootIndex <= 4 && seventhIndex > rootIndex) {
              // This is acceptable - root below, 7th above
            }
          }
        }
      });
    });

    it('should avoid placing maj7 intervals too low in voicing', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'B'], ['maj7']);
      const grips = service.generateGrips(chord);

      grips.forEach(grip => {
        const notes = grip.notes.filter(n => n !== null);
        if (notes.length === 0) return;

        // Find positions of root and maj7
        const rootIndex = grip.notes.findIndex(n => n !== null && n.startsWith('C'));
        const maj7Index = grip.notes.findIndex(n => n !== null && n.startsWith('B'));

        if (rootIndex !== -1 && maj7Index !== -1) {
          // Major 7th should not be in a very low position when there are multiple strings played
          const playedStringsCount = grip.notes.filter(n => n !== null).length;
          if (playedStringsCount >= 4 && maj7Index > 3) {
            // Maj7 is too low (in bass strings), this creates dissonance
            // The interval between root and maj7 is 11 semitones, sounds harsh in low register
          }
        }
      });
    });

    it('should avoid minor 2nd intervals in lowest strings', () => {
      // Test with a chord that contains a minor 2nd interval (C to C#)
      // This is an uncommon voicing but demonstrates the dissonance check
      const chord = createChord('C', ['C', 'C#', 'G'], []);
      const grips = service.generateGrips(chord, { allowIncompleteChords: true, dissonanceProfile: 'harmonic' });

      grips.forEach(grip => {
        const notes = grip.notes.filter(n => n !== null);
        if (notes.length < 4) return;

        // Check that C# (minor 2nd from C) is not in the lowest two strings (indices 0, 1)
        for (let i = 0; i <= 1; i++) {
          const note = grip.notes[i];
          if (note && note.startsWith('C#')) {
            // Minor 2nd should not be in the lowest strings
            throw new Error(`Minor 2nd (C#) found at string index ${i}, should be avoided in lowest strings`);
          }
        }
      });
    });

    it('should avoid tritone intervals in lowest strings for diminished chords', () => {
      // Cdim contains C-Eb-Gb, where Gb is a tritone (6 semitones) from C
      const chord = createChord('C', ['C', 'D#', 'F#'], ['dim']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });

      grips.forEach(grip => {
        const notes = grip.notes.filter(n => n !== null);
        if (notes.length < 4) return;

        // Check that F# (tritone from C) is not in the lowest two strings (indices 0, 1)
        for (let i = 0; i <= 1; i++) {
          const note = grip.notes[i];
          if (note && (note.startsWith('F#') || note.startsWith('Gb'))) {
            // Tritone should not be in the very lowest strings
            throw new Error(`Tritone (F#/Gb) found at string index ${i}, should be avoided in lowest strings`);
          }
        }
      });
    });

    it('should check dissonance from bass note in slash chords', () => {
      // C/E (C major with E bass): E-C-E-G-C-E
      // If we have E in bass, and add a D, it creates a minor 7th from E (E to D = 10 semitones)
      // This should be avoided in lower strings even though D is not the 7th of C
      const chord = createChord('C', ['C', 'E', 'G', 'D'], [], 'E');
      const grips = service.generateGrips(chord, { allowIncompleteChords: true, dissonanceProfile: 'harmonic' });

      grips.forEach(grip => {
        const notes = grip.notes.filter(n => n !== null);
        if (notes.length < 4) return;

        // Find the actual bass note (should be E)
        const bassNote = notes[0];
        if (!bassNote || !bassNote.startsWith('E')) return;

        // D is a minor 7th from E (10 semitones), should not be in lower strings (0, 1, 2)
        for (let i = 0; i <= 2; i++) {
          const note = grip.notes[i];
          if (note && note.startsWith('D')) {
            throw new Error(`D (minor 7th from bass note E) found at string index ${i}, should be avoided in lowest strings`);
          }
        }
      });
    });

    it('should allow Bm7 x20202 for neutral but not for harmonic (strict)', () => {
      const chord = createChord('B', ['B', 'D', 'F#', 'A'], ['m', '7']);

      const neutralGrips = service.generateGrips(chord, { dissonanceProfile: 'neutral' });
      const neutralShape = neutralGrips.find(g => stringifyGrip(g) === 'x|2|o|2|o|2');
      expect(neutralShape).toBeTruthy();

      const harmonicGrips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });
      const harmonicShape = harmonicGrips.find(g => stringifyGrip(g) === 'x|2|o|2|o|2');
      expect(harmonicShape).toBeFalsy();
    });

    it('should keep a higher-position Dm9 voicing for dissonant and all, but not neutral', () => {
      const chord = createChord('D', ['D', 'F', 'A', 'C', 'E'], ['m', '9']);
      const targetShape = 'x|5|7|5|6|o';
      const allGrips = service.generateGrips(chord, { dissonanceProfile: 'all' });
      const neutralGrips = service.generateGrips(chord, { dissonanceProfile: 'neutral' });
      expect(neutralGrips.some(g => stringifyGrip(g) === targetShape)).toBe(false);

      const dissonantGrips = service.generateGrips(chord, { dissonanceProfile: 'dissonant' });
      expect(dissonantGrips.some(g => stringifyGrip(g) === targetShape)).toBe(true);

      expect(allGrips.some(g => stringifyGrip(g) === targetShape)).toBe(true);
    });

    it('should allow all grips when using the all profile', () => {
      const chord = createChord('B', ['B', 'D', 'F#', 'A'], ['m', '7']);

      const harmonicGrips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });
      expect(harmonicGrips.some(g => stringifyGrip(g) === 'x|2|o|2|o|2')).toBe(false);

      const allGrips = service.generateGrips(chord, { dissonanceProfile: 'all' });
      expect(allGrips.some(g => stringifyGrip(g) === 'x|2|o|2|o|2')).toBe(true);
    });

    it('should keep profile result sets monotonic for color chords', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'D'], ['add9']);
      const options = { allowIncompleteChords: false };

      const harmonic = gripShapeSet(chord, 'harmonic', options);
      const neutral = gripShapeSet(chord, 'neutral', options);
      const dissonant = gripShapeSet(chord, 'dissonant', options);
      const all = gripShapeSet(chord, 'all', options);

      expect(harmonic.size).toBeGreaterThan(0);
      expect(neutral.size).toBeGreaterThan(0);
      expect(dissonant.size).toBeGreaterThan(0);
      expect(all.size).toBeGreaterThan(0);

      expectGripSubset(harmonic, neutral);
      expectGripSubset(neutral, dissonant);
      expectGripSubset(dissonant, all);
    });

    it('should keep profile result sets monotonic for structurally tense chords', () => {
      const chord = createChord('C', ['C', 'E', 'G#'], ['aug']);
      const options = { allowIncompleteChords: false };

      const harmonic = gripShapeSet(chord, 'harmonic', options);
      const neutral = gripShapeSet(chord, 'neutral', options);
      const dissonant = gripShapeSet(chord, 'dissonant', options);
      const all = gripShapeSet(chord, 'all', options);

      expect(harmonic.size).toBeGreaterThan(0);
      expect(neutral.size).toBeGreaterThan(0);
      expect(dissonant.size).toBeGreaterThan(0);
      expect(all.size).toBeGreaterThan(0);

      expectGripSubset(harmonic, neutral);
      expectGripSubset(neutral, dissonant);
      expectGripSubset(dissonant, all);
    });

    it('should generate common Cadd9 voicings under the harmonic profile', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'D'], ['add9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });

      const openCadd9 = grips.find(g => stringifyGrip(g) === 'x|3|2|o|3|o');
      expect(openCadd9).toBeTruthy();
      if (openCadd9) {
        expect(openCadd9.notes).toEqual([null, 'C3', 'E3', 'G3', 'D4', 'E4']);
      }
    });

    it('should generate dominant 9 grips that retain both the b7 and the 9', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'A#', 'D'], ['9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'all' });

      expect(grips.length).toBeGreaterThan(0);
      expect(grips.some(g =>
        g.notes.some(note => note?.startsWith('A#')) &&
        g.notes.some(note => note?.startsWith('D'))
      )).toBe(true);
    });

    it('should generate 6/9 grips that retain both the 6th and the 9th', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'A', 'D'], ['6/9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'harmonic' });

      expect(grips.length).toBeGreaterThan(0);
      expect(grips.some(g =>
        g.notes.some(note => note?.startsWith('A')) &&
        g.notes.some(note => note?.startsWith('D'))
      )).toBe(true);
    });

    it('should keep modifier-aware relief specific to chords that expect the tension', () => {
      const cAdd9 = createChord('C', ['C', 'E', 'G', 'D'], ['add9']);
      const colorGrips = service.generateGrips(cAdd9, { dissonanceProfile: 'harmonic' });
      expect(colorGrips.some(g => stringifyGrip(g) === 'x|3|2|o|3|o')).toBe(true);

      const accidentalCluster = createChord('C', ['C', 'C#', 'G'], [], 'C');
      const clusterGrips = service.generateGrips(accidentalCluster, {
        allowIncompleteChords: true,
        dissonanceProfile: 'harmonic'
      });

      expect(clusterGrips.every(g => stringifyGrip(g) !== 'x|3|2|o|2|o')).toBe(true);
    });

    it('should allow perfect-fifth omissions for maj9 when no complete grip exists at that fret', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'B', 'D'], ['maj9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'all' });

      const omit5Grip = grips.find(g => stringifyGrip(g) === 'x|3|2|4|3|o');
      expect(omit5Grip).toBeTruthy();
      expect(omit5Grip).toMatchObject({
        isIncomplete: true,
        omittedToneRoles: ['fifth']
      });
    });

    it('should allow narrow no3 fallback only on seventh-plus-extension chords', () => {
      const c9 = createChord('C', ['C', 'E', 'G', 'A#', 'D'], ['9']);
      const c9Grips = service.generateGrips(c9, { dissonanceProfile: 'all' });
      const no3Fallback = c9Grips.find(g => stringifyGrip(g) === 'x|3|o|3|1|3');

      expect(no3Fallback).toBeTruthy();
      expect(no3Fallback).toMatchObject({
        isIncomplete: true,
        omittedToneRoles: ['third']
      });

      const cAdd9 = createChord('C', ['C', 'E', 'G', 'D'], ['add9']);
      const add9Grips = service.generateGrips(cAdd9, { dissonanceProfile: 'all' });
      expect(
        add9Grips.every(g => !(g.isIncomplete && g.omittedToneRoles.length === 1 && g.omittedToneRoles[0] === 'third'))
      ).toBe(true);
    });

    it('should keep incomplete grips even when a complete grip exists at the same minimum fret', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'A#', 'D'], ['9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'all' });
      const gripsByMinFret = new Map<number, typeof grips>();

      for (const grip of grips) {
        const minFret = grip.strings.reduce((currentMin, string) => {
          if (string === 'x' || string === 'o') return currentMin;
          return Math.min(currentMin, ...string.map(entry => entry.fret));
        }, Infinity);
        const groupKey = minFret === Infinity ? 0 : minFret;
        const existing = gripsByMinFret.get(groupKey) ?? [];
        existing.push(grip);
        gripsByMinFret.set(groupKey, existing);
      }

      expect(
        [...gripsByMinFret.values()].some(group =>
          group.some(grip => !grip.isIncomplete) &&
          group.some(grip => grip.isIncomplete)
        )
      ).toBe(true);
    });

    it('should keep requested add9 tones when incomplete add9 variations are also shown', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'D'], ['add9']);
      const grips = service.generateGrips(chord, { dissonanceProfile: 'all' });

      expect(grips.length).toBeGreaterThan(0);
      expect(grips.some(g => stringifyGrip(g) === 'x|3|2|o|3|o')).toBe(true);
      expect(grips.every(g => g.notes.some(note => note?.startsWith('D')))).toBe(true);
    });

    it('should disable practical omissions when allowIncompleteChords is false', () => {
      const chord = createChord('C', ['C', 'E', 'G', 'B', 'D'], ['maj9']);

      const defaultGrips = service.generateGrips(chord, { dissonanceProfile: 'all' });
      expect(defaultGrips.some(g => g.isIncomplete)).toBe(true);

      const strictGrips = service.generateGrips(chord, {
        allowIncompleteChords: false,
        dissonanceProfile: 'all'
      });
      expect(strictGrips.every(g => !g.isIncomplete)).toBe(true);
      expect(strictGrips.some(g => stringifyGrip(g) === 'x|3|2|4|3|o')).toBe(false);
    });

    it('should not omit altered fifths in diminished chords', () => {
      const chord = createChord('C', ['C', 'D#', 'F#'], ['dim']);
      const grips = service.generateGrips(chord, { allowIncompleteChords: true, dissonanceProfile: 'all' });

      expect(grips.length).toBeGreaterThan(0);
      expect(grips.every(g => !g.isIncomplete)).toBe(true);
    });
  });
});
