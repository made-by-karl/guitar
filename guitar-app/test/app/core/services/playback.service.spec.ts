import { note } from '@/app/core/music/semitones';
import { PlaybackPlan, PlaybackService } from '@/app/core/services/playback.service';
import { BehaviorSubject } from 'rxjs';
import { HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

describe('PlaybackService', () => {
  const createService = () => {
    const progress = new BehaviorSubject<HtmlAudioProgress>({
      channel: 'finite:session-a',
      currentTime: 0,
      duration: 1,
      ended: false
    });
    const renderedAudioService = {
      renderInstructions: jest.fn().mockResolvedValue({
        url: 'blob:rendered-audio',
        blob: new Blob(['wav'], { type: 'audio/wav' }),
        durationSeconds: 1
      })
    };
    const htmlAudioPlaybackService = {
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      resume: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      seek: jest.fn(),
      progress$: jest.fn(() => progress.asObservable())
    };

    return {
      service: new PlaybackService(renderedAudioService as any, htmlAudioPlaybackService as any),
      renderedAudioService,
      htmlAudioPlaybackService,
      progress
    };
  };

  it('plays a chord by rendering a single instruction and sending it to media playback', async () => {
    const { service, renderedAudioService, htmlAudioPlaybackService } = createService();

    await service.playChordFromNotes(['E4', 'G4', 'B4'], 1.5, 0.8, 'accented');

    expect(renderedAudioService.renderInstructions).toHaveBeenCalledWith([
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
    ], 1.5);
    expect(htmlAudioPlaybackService.play).toHaveBeenCalledWith('chord-preview', 'blob:rendered-audio');
  });

  it('stops another finite session in the same scope when a new one starts', async () => {
    const { service, htmlAudioPlaybackService } = createService();
    const sessionA = service.getFiniteSession('session-a');
    const sessionB = service.getFiniteSession('session-b');
    const plan: PlaybackPlan = {
      instructions: [{
        time: 0,
        playbackDuration: 0.5,
        actionDuration: 0.5,
        notes: [{ note: note('E', 4) }],
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
    expect(htmlAudioPlaybackService.stop).toHaveBeenCalledWith('finite:session-a');
  });

  it('seeks finite media playback to the selected segment start', async () => {
    const { service, htmlAudioPlaybackService } = createService();
    const session = service.getFiniteSession('session-a');
    const plan: PlaybackPlan = {
      instructions: [{
        time: 0,
        playbackDuration: 0.5,
        actionDuration: 0.5,
        notes: [{ note: note('E', 4) }],
        velocity: 0.7,
        technique: 'normal' as const,
        playNotes: 'parallel' as const
      }],
      segmentStartTimes: [0, 0.5, 1],
      totalDuration: 1.5,
      totalSegments: 3
    };

    await session.play(plan);
    session.seek(2);

    expect(htmlAudioPlaybackService.seek).toHaveBeenCalledWith('finite:session-a', 1);
    expect(session.getSnapshot().cursor).toBe(2);
  });
});
