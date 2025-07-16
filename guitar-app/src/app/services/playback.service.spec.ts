import { TestBed } from '@angular/core/testing';
import { PlaybackService } from './playback.service';
import { MidiService } from './midi.service';
import { note } from 'app/common/semitones';
import { Grip } from './grips/grip.model';

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
    const mockPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      timeSignature: '4/4',
      tempo: 120,
      steps: [
        {
          technique: 'strum' as const,
          direction: 'D' as const,
          beat: 1,
          timing: 'on-beat' as const,
          strum: { strings: 'all' as const }
        }
      ],
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
    const mockPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      timeSignature: '4/4',
      tempo: 120,
      steps: [
        {
          technique: 'strum' as const,
          direction: 'D' as const,
          beat: 1,
          timing: 'on-beat' as const,
          strum: { strings: 'all' as const }
        }
      ],
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
    const mockPattern = {
      id: 'test',
      name: 'Test Pattern',
      description: 'Test',
      category: 'test',
      timeSignature: '4/4',
      tempo: 120,
      steps: [
        {
          technique: 'strum' as const,
          direction: 'U' as const,
          beat: 1,
          timing: 'on-beat' as const,
          strum: { strings: 'all' as const }
        }
      ],
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
});
