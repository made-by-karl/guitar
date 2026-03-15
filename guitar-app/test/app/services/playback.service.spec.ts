import { TestBed } from '@angular/core/testing';
import { PlaybackService } from '@/app/services/playback.service';
import { MidiService } from '@/app/services/midi.service';
import { note } from '@/app/common/semitones';
import { Grip } from '@/app/services/grips/grip.model';
import { RhythmModifier, RhythmPattern } from '@/app/services/rhythm-patterns.model';

describe('PlaybackService', () => {
  let service: PlaybackService;
  let midiServiceMock: jest.Mocked<MidiService>;

  const defaultTuning = [
    note('E', 2),
    note('A', 2),
    note('D', 3),
    note('G', 3),
    note('B', 3),
    note('E', 4)];

  beforeEach(() => {
    const mockMidiService = {
      playSequence: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<Partial<MidiService>>;

    TestBed.configureTestingModule({
      providers: [
        PlaybackService,
        { provide: MidiService, useValue: mockMidiService }
      ]
    });

    service = TestBed.inject(PlaybackService);
    midiServiceMock = TestBed.inject(MidiService) as jest.Mocked<MidiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call MidiService.playSequence when playing chord from notes', async () => {
    await service.playChordFromNotes(['C4', 'E4', 'G4']);

    expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          time: 0,
          notes: expect.arrayContaining([
            expect.objectContaining({ note: { semitone: 'C', octave: 4 } }), // C4
            expect.objectContaining({ note: { semitone: 'E', octave: 4 } }), // E4
            expect.objectContaining({ note: { semitone: 'G', octave: 4 } })  // G4
          ]),
          velocity: 0.7,
          technique: 'normal',
          playNotes: 'parallel'
        })
      ])
    );
  });

  it('should generate instructions for rhythm patterns', async () => {
    const mockPattern: RhythmPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      measures: [{
        timeSignature: '4/4',
        actions: [
          {
            technique: 'strum' as const,
            strum: { direction: 'D' as const, strings: 'all' as const }
          }
        ]
      }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await service.playRhythmPattern(mockPattern, defaultTuning);

    expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          technique: 'normal',
          playNotes: 'sequential'
        })
      ])
    );
  });

  it('should use default chord positions when none provided', async () => {
    const mockPattern: RhythmPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      measures: [{
        timeSignature: '4/4',
        actions: [
          {
            technique: 'strum' as const,
            strum: { direction: 'D' as const, strings: 'all' as const }
          }
        ]
      }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await service.playRhythmPattern(mockPattern, defaultTuning);

    expect(midiServiceMock.playSequence).toHaveBeenCalledTimes(1);
    expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          notes: expect.arrayContaining([
            expect.objectContaining({ note: expect.objectContaining({ semitone: expect.any(String), octave: expect.any(Number) }) })
          ])
        })
      ])
    );
  });

  it('should handle custom chord positions', async () => {
    const grip: Grip = { strings: [[{ fret: 3 }], [{ fret: 3 }], 'o', 'o', [{ fret: 2 }], [{ fret: 3 }]] } // G major chord
    const mockPattern: RhythmPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      measures: [{
        timeSignature: '4/4',
        actions: [
          {
            technique: 'strum' as const,
            strum: { direction: 'U' as const, strings: 'all' as const }
          }
        ]
      }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await service.playRhythmPattern(mockPattern, defaultTuning, grip);

    expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          playNotes: 'reversed'
        })
      ])
    );
  });

  it('should handle different playing techniques', async () => {
    await service.playChordFromNotes(['C4', 'E4', 'G4'], 1.5, 0.8, 'accented');

    expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          duration: 1.5,
          velocity: 0.8,
          technique: 'accented'
        })
      ])
    );
  });

  describe('Duration calculation', () => {
    it('should cap duration at 2 seconds when no subsequent action on same string', async () => {
      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [{
          timeSignature: '4/4',
          actions: [
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 2 }]
            },
            null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, 80);

      expect(midiServiceMock.playSequence).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            duration: 2.0 // Capped at max duration
          })
        ])
      );
    });

    it('should cut duration when same string is played again', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4; // 0.1875 seconds

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [{
          timeSignature: '4/4',
          actions: [
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 2 }]
            },
            null, null, null,
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 4 }]
            },
            null, null, null,
            null, null, null, null, null, null, null, null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      expect(calls[0].duration).toBeCloseTo(4 * sixteenthNoteDuration, 4); // Duration from position 0 to position 4
    });

    it('should allow different strings to overlap', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4;

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [{
          timeSignature: '4/4',
          actions: [
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 2 }]
            },
            null,
            {
              technique: 'pick' as const,
              pick: [{ string: 1, fret: 3 }]
            },
            null,
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 4 }]
            },
            null, null, null,
            null, null, null, null, null, null, null, null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      
      // First action (string 0) should be cut short by third action (also string 0) at position 4
      expect(calls[0].time).toBe(0);
      expect(calls[0].duration).toBeCloseTo(4 * sixteenthNoteDuration, 4);
      
      // Second action (string 1) should play for max duration as it's never cut short
      expect(calls[1].time).toBeCloseTo(2 * sixteenthNoteDuration, 4);
      expect(calls[1].duration).toBe(2.0);
      
      // Third action (string 0) should play for max duration
      expect(calls[2].time).toBeCloseTo(4 * sixteenthNoteDuration, 4);
      expect(calls[2].duration).toBe(2.0);
    });

    it('should handle cross-measure duration detection', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4;

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [
          {
            timeSignature: '4/4',
            actions: [
              null, null, null, null,
              null, null, null, null,
              null, null, null, null,
              null, null, null,
              {
                technique: 'pick' as const,
                pick: [{ string: 0, fret: 2 }]
              }
            ]
          },
          {
            timeSignature: '4/4',
            actions: [
              null, null, null, null,
              {
                technique: 'pick' as const,
                pick: [{ string: 0, fret: 5 }]
              },
              null, null, null,
              null, null, null, null, null, null, null, null
            ]
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      
      // First action at end of measure 1 should be cut by action in measure 2
      // Position 15 in measure 1, position 4 in measure 2 = 5 sixteenth notes difference
      expect(calls[0].time).toBeCloseTo(15 * sixteenthNoteDuration, 4);
      expect(calls[0].duration).toBeCloseTo(5 * sixteenthNoteDuration, 4);
    });

    it('should handle strumming with duration calculation', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4;

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [{
          timeSignature: '4/4',
          actions: [
            {
              technique: 'strum' as const,
              strum: { direction: 'D' as const, strings: [0, 1, 2] as const }
            },
            null, null, null,
            {
              technique: 'strum' as const,
              strum: { direction: 'U' as const, strings: [0, 1, 2] as const }
            },
            null, null, null,
            null, null, null, null, null, null, null, null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      
      // First strum should be cut short by second strum at position 4
      expect(calls[0].duration).toBeCloseTo(4 * sixteenthNoteDuration, 4);
    });

    it('should handle multiple measures with correct timing', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4;

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [
          {
            timeSignature: '4/4',
            actions: [
              {
                technique: 'pick' as const,
                pick: [{ string: 0, fret: 0 }]
              },
              null, null, null, null, null, null, null,
              null, null, null, null, null, null, null, null
            ]
          },
          {
            timeSignature: '4/4',
            actions: [
              {
                technique: 'pick' as const,
                pick: [{ string: 1, fret: 0 }]
              },
              null, null, null, null, null, null, null,
              null, null, null, null, null, null, null, null
            ]
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      
      // First action in first measure at time 0
      expect(calls[0].time).toBe(0);
      
      // Second action in second measure at time = 16 sixteenth notes later
      expect(calls[1].time).toBeCloseTo(16 * sixteenthNoteDuration, 4);
    });

    it('should handle percussive technique without affecting string tracking', async () => {
      const tempo = 80;
      const sixteenthNoteDuration = (60 / tempo) / 4;

      const mockPattern: RhythmPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'Test',
        category: 'test',
        measures: [{
          timeSignature: '4/4',
          actions: [
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 2 }]
            },
            null,
            {
              technique: 'percussive' as const
              ,
              percussive: { technique: 'body-knock' as const }
            },
            null,
            {
              technique: 'pick' as const,
              pick: [{ string: 0, fret: 4 }]
            },
            null, null, null,
            null, null, null, null, null, null, null, null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await service.playRhythmPattern(mockPattern, defaultTuning, undefined, tempo);

      const calls = midiServiceMock.playSequence.mock.calls[0][0];
      
      // First action (string 0) should still be cut by third action (string 0) at position 4
      // Percussive at position 2 should not affect string 0's duration
      expect(calls[0].duration).toBeCloseTo(4 * sixteenthNoteDuration, 4);
      
      // Percussive should have max duration
      expect(calls[1].technique).toBe('percussive');
      expect(calls[1].duration).toBe(0.5);
    });
  });
});
