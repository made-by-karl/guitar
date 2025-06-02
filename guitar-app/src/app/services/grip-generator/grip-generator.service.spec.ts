import { GripGeneratorService } from './grip-generator.service';
import { FretboardService } from '../fretboard.service';
import type { GuitarGrip } from './grip-generator.service';

describe('GripGeneratorService', () => {
  let service: GripGeneratorService;

  const expectValidGrip = (grip: GuitarGrip, chordNotes: string[], maxSpan = 4) => {
    const played = grip.notes.filter(n => n !== null);
    expect(played.length).toBeGreaterThan(0);
    played.forEach(note => expect(chordNotes).toContain(note));

    const fretted = grip.frets.filter(f => f !== 'x') as number[];
    if (fretted.length > 0) {
      const span = Math.max(...fretted) - Math.min(...fretted);
      expect(span).toBeLessThanOrEqual(maxSpan);
    }
  };

  beforeEach(() => {
    service = new GripGeneratorService(new FretboardService);
  });

  it('should generate valid grips for C major', () => {
    const chordNotes = ['C', 'E', 'G'];
    const grips = service.generateGrips(chordNotes);

    expect(grips.length).toBeGreaterThan(0);

    for (const grip of grips) {
      // Every played note must be in the chord
      grip.notes.forEach(note => {
        if (note !== null) {
          expect(chordNotes).toContain(note);
        }
      });

      // Fret span must not exceed 4
      const fretted = grip.frets.filter(f => f !== 'x') as number[];
      if (fretted.length > 0) {
        const span = Math.max(...fretted) - Math.min(...fretted);
        expect(span).toBeLessThanOrEqual(4);
      }
    }
  });

  it('should generate valid grips for Cmaj7', () => {
    const chordNotes = ['C', 'E', 'G', 'B'];
    const grips = service.generateGrips(chordNotes);
    console.log(grips)
    expect(grips.length).toBeGreaterThan(0);
    grips.forEach(grip => expectValidGrip(grip, chordNotes));
  });

  it('should not create grips with invalid notes', () => {
    const chordNotes = ['C', 'E', 'G'];
    const grips = service.generateGrips(chordNotes);
    grips.forEach(grip => {
      grip.notes.forEach(note => {
        if (note !== null) {
          expect(chordNotes.includes(note)).toBeTruthy();
        }
      });
    });
  });

  it('should simulate barre detection based on repeated frets', () => {
    const chordNotes = ['A', 'C#', 'E']; // A major
    const grips = service.generateGrips(chordNotes);

    const potentialBarres = grips.filter(grip => {
      const fretCounts = new Map<number, number>();
      grip.frets.forEach(f => {
        if (f !== 'x' && f !== 0) {
          fretCounts.set(f, (fretCounts.get(f) || 0) + 1);
        }
      });
      return [...fretCounts.values()].some(v => v >= 3);
    });

    expect(potentialBarres.length).toBeGreaterThan(0);
  });

  it('should assign finger numbers or leave it undefined', () => {
    const chordNotes = ['C', 'E', 'G'];
    const grips = service.generateGrips(chordNotes);

    for (const grip of grips) {
      expect(grip.frets.length).toBe(6);
    }
  });
});
