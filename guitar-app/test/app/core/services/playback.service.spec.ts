import { PlaybackService } from '@/app/core/services/playback.service';

describe('PlaybackService', () => {
  it('plays a chord by delegating a single instruction sequence to the midi service', async () => {
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PlaybackService(midiService as any);

    await service.playChordFromNotes(['E4', 'G4', 'B4'], 1.5, 0.8, 'accented');

    expect(midiService.playSequence).toHaveBeenCalledWith([
      expect.objectContaining({
        time: 0,
        playbackDuration: 1.5,
        actionDuration: 1.5,
        velocity: 0.8,
        technique: 'accented',
        playNotes: 'parallel',
        notes: [
          expect.objectContaining({ note: expect.anything() }),
          expect.objectContaining({ note: expect.anything() }),
          expect.objectContaining({ note: expect.anything() })
        ]
      })
    ]);
  });

  it('stops another finite session in the same scope when a new one starts', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PlaybackService(midiService as any);
    const sessionA = service.getFiniteSession('session-a');
    const sessionB = service.getFiniteSession('session-b');
    const plan = {
      instructions: [{
        time: 0,
        playbackDuration: 0.5,
        actionDuration: 0.5,
        notes: [{ note: { semitone: 'E', octave: 4 } }],
        velocity: 0.7,
        technique: 'normal' as const,
        playNotes: 'parallel' as const
      }],
      segmentStartTimes: [0],
      totalDuration: 0.5,
      totalSegments: 1
    };

    await sessionA.play(plan);
    expect(sessionA.getSnapshot().status).toBe('playing');

    await sessionB.play(plan);

    expect(sessionA.getSnapshot().status).toBe('idle');
    expect(sessionB.getSnapshot().status).toBe('playing');
  });
});
