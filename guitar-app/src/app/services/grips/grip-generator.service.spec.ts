import { GripGeneratorService } from 'app/services/grips/grip-generator.service';
import { FretboardService } from 'app/services/fretboard.service';
import type { ExtendedChord } from 'app/services/chords/chord.service';
import { Semitone } from 'app/common/semitones';
import { Modifier } from 'app/common/modifiers';
import { stringifyGrip } from './grip.model';


describe('GripGeneratorService', () => {
  let service: GripGeneratorService;
  let fretboardService: FretboardService;

  const createChord = (root: Semitone, notes: Semitone[], modifiers: Modifier[] = [], bass?: Semitone): ExtendedChord => ({
    root,
    notes,
    modifiers,
    bass
  });

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
  });
  
  /*
  describe('Ergonomic constraints', () => {
    it('should not generate grips with spans larger than 4 frets', () => {
      const chord = createChordAnalysis('Cmaj7', ['C', 'E', 'G', 'B']);
      const grips = service.generateGrips(chord);

      grips.forEach(grip => {
        const frettedPositions = grip.frets.filter(f => typeof f === 'number' && f > 0) as number[];
        if (frettedPositions.length > 0) {
          const span = Math.max(...frettedPositions) - Math.min(...frettedPositions);
          expect(span).toBeLessThanOrEqual(4);
        }
      });
    });

    it('should ensure minimum of 3 strings played', () => {
      const chord = createChordAnalysis('Am', ['A', 'C', 'E']);
      const grips = service.generateGrips(chord);

      grips.forEach(grip => {
        const playedStrings = grip.frets.filter(f => f !== 'x').length;
        expect(playedStrings).toBeGreaterThanOrEqual(3);
      });
    });

    it('should not have muted strings between played strings', () => {
      const chord = createChordAnalysis('G', ['G', 'B', 'D']);
      const grips = service.generateGrips(chord);

      grips.forEach(grip => {
        let foundPlayed = false;
        let foundMutedAfterPlayed = false;
        let foundPlayedAfterMuted = false;

        grip.frets.forEach(f => {
          if (f !== 'x') {
            if (foundMutedAfterPlayed) {
              foundPlayedAfterMuted = true;
            }
            foundPlayed = true;
          } else if (foundPlayed) {
            foundMutedAfterPlayed = true;
          }
        });

        expect(foundPlayedAfterMuted).toBeFalsy();
      });
    });
  });
  */
  /*
  describe('Special cases', () => {
    it('should handle slash chords with different bass notes', () => {
      const chord = createChordAnalysis('C', ['C', 'E', 'G'], [], 'G');
      const grips = service.generateGrips(chord);

      // Should find a grip with G in the bass
      const bassGrip = grips.find(g => {
        const lowestNote = g.notes.filter(n => n !== null)[0];
        return lowestNote === 'G';
      });
      expect(bassGrip).toBeTruthy();
    });

    it('should handle extended chords', () => {
      const chord = createChordAnalysis('Cmaj9', ['C', 'E', 'G', 'B', 'D']);
      const grips = service.generateGrips(chord);

      expect(grips.length).toBeGreaterThan(0);
      grips.forEach(grip => {
        const uniqueNotes = new Set(grip.notes.filter(n => n !== null));
        expect(uniqueNotes.size).toBeGreaterThanOrEqual(3);
      });
    });
  });
  */
});
