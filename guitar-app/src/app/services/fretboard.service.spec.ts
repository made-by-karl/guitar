import { TestBed } from '@angular/core/testing';
import { FretboardService, FretBoardNote } from './fretboard.service';

describe('FretboardService', () => {
  let service: FretboardService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FretboardService);
  });

  it('should generate the correct fretboard for a standard guitar tuning with 12 frets', () => {
    const expectedFretboard: FretBoardNote[][] = [
      [
        { semitone: 'E', octave: 2 },
        { semitone: 'A', octave: 2 },
        { semitone: 'D', octave: 3 },
        { semitone: 'G', octave: 3 },
        { semitone: 'B', octave: 3 },
        { semitone: 'E', octave: 4 },
      ],
      [
        { semitone: 'F', octave: 2 },
        { semitone: 'A#', octave: 2 },
        { semitone: 'D#', octave: 3 },
        { semitone: 'G#', octave: 3 },
        { semitone: 'C', octave: 4 },
        { semitone: 'F', octave: 4 },
      ],
      [
        { semitone: 'F#', octave: 2 },
        { semitone: 'B', octave: 2 },
        { semitone: 'E', octave: 3 },
        { semitone: 'A', octave: 3 },
        { semitone: 'C#', octave: 4 },
        { semitone: 'F#', octave: 4 },
      ],
      [
        { semitone: 'G', octave: 2 },
        { semitone: 'C', octave: 3 },
        { semitone: 'F', octave: 3 },
        { semitone: 'A#', octave: 3 },
        { semitone: 'D', octave: 4 },
        { semitone: 'G', octave: 4 },
      ],
      [
        { semitone: 'G#', octave: 2 },
        { semitone: 'C#', octave: 3 },
        { semitone: 'F#', octave: 3 },
        { semitone: 'B', octave: 3 },
        { semitone: 'D#', octave: 4 },
        { semitone: 'G#', octave: 4 },
      ],
      [
        { semitone: 'A', octave: 2 },
        { semitone: 'D', octave: 3 },
        { semitone: 'G', octave: 3 },
        { semitone: 'C', octave: 4 },
        { semitone: 'E', octave: 4 },
        { semitone: 'A', octave: 4 },
      ],
      [
        { semitone: 'A#', octave: 2 },
        { semitone: 'D#', octave: 3 },
        { semitone: 'G#', octave: 3 },
        { semitone: 'C#', octave: 4 },
        { semitone: 'F', octave: 4 },
        { semitone: 'A#', octave: 4 },
      ],
      [
        { semitone: 'B', octave: 2 },
        { semitone: 'E', octave: 3 },
        { semitone: 'A', octave: 3 },
        { semitone: 'D', octave: 4 },
        { semitone: 'F#', octave: 4 },
        { semitone: 'B', octave: 4 },
      ],
      [
        { semitone: 'C', octave: 3 },
        { semitone: 'F', octave: 3 },
        { semitone: 'A#', octave: 3 },
        { semitone: 'D#', octave: 4 },
        { semitone: 'G', octave: 4 },
        { semitone: 'C', octave: 5 },
      ],
      [
        { semitone: 'C#', octave: 3 },
        { semitone: 'F#', octave: 3 },
        { semitone: 'B', octave: 3 },
        { semitone: 'E', octave: 4 },
        { semitone: 'G#', octave: 4 },
        { semitone: 'C#', octave: 5 },
      ],
      [
        { semitone: 'D', octave: 3 },
        { semitone: 'G', octave: 3 },
        { semitone: 'C', octave: 4 },
        { semitone: 'F', octave: 4 },
        { semitone: 'A', octave: 4 },
        { semitone: 'D', octave: 5 },
      ],
      [
        { semitone: 'D#', octave: 3 },
        { semitone: 'G#', octave: 3 },
        { semitone: 'C#', octave: 4 },
        { semitone: 'F#', octave: 4 },
        { semitone: 'A#', octave: 4 },
        { semitone: 'D#', octave: 5 },
      ],
      [
        { semitone: 'E', octave: 3 },
        { semitone: 'A', octave: 3 },
        { semitone: 'D', octave: 4 },
        { semitone: 'G', octave: 4 },
        { semitone: 'B', octave: 4 },
        { semitone: 'E', octave: 5 },
      ],
    ];

    const guitarConfig = service.getGuitarFretboardConfig();
    expect(guitarConfig.tuning.map(x => x.semitone)).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    expect(guitarConfig.tuning.map(x => x.octave)).toEqual([2, 2, 3, 3, 3, 4]);
    expect(guitarConfig.frets).toBe(12);

    const result = service.getFretboard(guitarConfig.tuning, guitarConfig.frets);
    console.log(result);
    expect(result).toEqual(expectedFretboard);
  });
});
